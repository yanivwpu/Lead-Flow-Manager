/**
 * READ-ONLY audit: iwiin / jives legacy outreach vs traceable send records.
 * Does not mutate. Run: npx tsx scripts/audit-legacy-outreach-iwiin-jives.ts
 */
import "dotenv/config";
import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  contacts,
  conversations,
  messages,
  prospectIntelligence,
  prospectOutreachQueueItems,
  prospectOutreachBatches,
} from "../shared/schema";
import { db } from "../drizzle/db";

async function auditName(pattern: string) {
  const rows = await db
    .select({
      contactId: contacts.id,
      name: contacts.name,
      email: contacts.email,
      reviewStatus: prospectIntelligence.reviewStatus,
      outreachStatus: prospectIntelligence.outreachStatus,
      outreachSentAt: prospectIntelligence.outreachSentAt,
      outreachConversationId: prospectIntelligence.outreachConversationId,
      outreachMessageId: prospectIntelligence.outreachMessageId,
      enrichmentStatus: prospectIntelligence.enrichmentStatus,
      analysisStatus: prospectIntelligence.analysisStatus,
    })
    .from(contacts)
    .innerJoin(prospectIntelligence, eq(prospectIntelligence.contactId, contacts.id))
    .where(ilike(contacts.name, pattern))
    .limit(10);

  const results = [];
  for (const r of rows) {
    const queue = await db
      .select({
        id: prospectOutreachQueueItems.id,
        batchId: prospectOutreachQueueItems.batchId,
        queueStatus: prospectOutreachQueueItems.queueStatus,
        messageId: prospectOutreachQueueItems.messageId,
        conversationId: prospectOutreachQueueItems.conversationId,
        sentAt: prospectOutreachQueueItems.sentAt,
        createdAt: prospectOutreachQueueItems.createdAt,
        lastError: prospectOutreachQueueItems.lastError,
      })
      .from(prospectOutreachQueueItems)
      .where(eq(prospectOutreachQueueItems.contactId, r.contactId));

    let linkedConversation: {
      id: string;
      subject: string | null;
      channel: string | null;
      createdAt: Date | null;
    } | null = null;
    let linkedOutboundCount = 0;
    let linkedMessageExists = false;

    if (r.outreachConversationId) {
      const convRows = await db
        .select({
          id: conversations.id,
          subject: conversations.subject,
          channel: conversations.channel,
          createdAt: conversations.createdAt,
        })
        .from(conversations)
        .where(eq(conversations.id, r.outreachConversationId))
        .limit(1);
      linkedConversation = convRows[0] || null;
      if (linkedConversation) {
        const out = await db
          .select({ id: messages.id })
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, linkedConversation.id),
              eq(messages.direction, "outbound"),
            ),
          );
        linkedOutboundCount = out.length;
      }
    }

    if (r.outreachMessageId) {
      const msg = await db
        .select({ id: messages.id, direction: messages.direction, conversationId: messages.conversationId })
        .from(messages)
        .where(eq(messages.id, r.outreachMessageId))
        .limit(1);
      linkedMessageExists = msg.length > 0;
    }

    // Any email conversations with outbound for this contact
    const emailConvs = await db
      .select({
        id: conversations.id,
        subject: conversations.subject,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .where(and(eq(conversations.contactId, r.contactId), eq(conversations.channel, "email")));

    const emailConvIds = emailConvs.map((c) => c.id);
    let outboundOnAnyEmail = 0;
    if (emailConvIds.length) {
      const outs = await db
        .select({ conversationId: messages.conversationId })
        .from(messages)
        .where(
          and(
            inArray(messages.conversationId, emailConvIds),
            eq(messages.direction, "outbound"),
          ),
        );
      outboundOnAnyEmail = outs.length;
    }

    const ideaOutbound = [];
    for (const c of emailConvs) {
      if (!/^Idea for /i.test(String(c.subject || ""))) continue;
      const outs = await db
        .select({ id: messages.id, createdAt: messages.createdAt })
        .from(messages)
        .where(and(eq(messages.conversationId, c.id), eq(messages.direction, "outbound")))
        .limit(3);
      if (outs.length) {
        ideaOutbound.push({
          conversationIdPrefix: String(c.id).slice(0, 8),
          subject: String(c.subject || "").slice(0, 80),
          outboundCount: outs.length,
          firstOutboundAt: outs[0]?.createdAt?.toISOString() || null,
        });
      }
    }

    const hasQueueSent = queue.some((q) => String(q.queueStatus) === "sent");
    const hasAnyQueue = queue.length > 0;
    const hasTraceable =
      hasQueueSent ||
      linkedMessageExists ||
      linkedOutboundCount > 0 ||
      Boolean(r.outreachMessageId && linkedMessageExists);

    results.push({
      name: r.name,
      contactIdPrefix: String(r.contactId).slice(0, 8),
      emailMasked: r.email
        ? String(r.email).slice(0, 2) + "***@" + String(r.email).split("@")[1]
        : null,
      pi: {
        reviewStatus: r.reviewStatus,
        outreachStatus: r.outreachStatus,
        outreachSentAt: r.outreachSentAt?.toISOString() || null,
        hasOutreachConversationId: Boolean(r.outreachConversationId),
        hasOutreachMessageId: Boolean(r.outreachMessageId),
        enrichmentStatus: r.enrichmentStatus,
        analysisStatus: r.analysisStatus,
      },
      queue: {
        count: queue.length,
        statuses: queue.map((q) => q.queueStatus),
        hasSent: hasQueueSent,
        items: queue.map((q) => ({
          status: q.queueStatus,
          hasMessageId: Boolean(q.messageId),
          hasConversationId: Boolean(q.conversationId),
          sentAt: q.sentAt?.toISOString() || null,
          createdAt: q.createdAt?.toISOString() || null,
          batchIdPrefix: String(q.batchId).slice(0, 8),
        })),
      },
      linkedThread: {
        exists: Boolean(linkedConversation),
        outboundCount: linkedOutboundCount,
        linkedMessageExists,
        subject: linkedConversation?.subject
          ? String(linkedConversation.subject).slice(0, 80)
          : null,
      },
      emailActivity: {
        emailConversationCount: emailConvs.length,
        outboundMessageCount: outboundOnAnyEmail,
        ideaForOutboundThreads: ideaOutbound,
      },
      verdict: {
        hasTraceableSend: hasTraceable || ideaOutbound.length > 0 || outboundOnAnyEmail > 0,
        staleLifecycleLikely:
          (r.outreachStatus === "outreach_sent" || Boolean(r.outreachSentAt)) &&
          !hasAnyQueue &&
          !linkedMessageExists &&
          linkedOutboundCount === 0 &&
          ideaOutbound.length === 0 &&
          outboundOnAnyEmail === 0,
        classification:
          hasQueueSent
            ? "queue_sent"
            : linkedMessageExists || linkedOutboundCount > 0
              ? "linked_outbound_message"
              : ideaOutbound.length > 0 || outboundOnAnyEmail > 0
                ? "unlinked_email_outbound_exists"
                : r.outreachStatus === "outreach_sent" || r.outreachSentAt
                  ? "stale_pi_fields_only"
                  : "not_marked_sent",
      },
    });
  }
  return results;
}

async function main() {
  const iwiin = await auditName("%iwiin%");
  const jives = await auditName("%jives%");
  console.log(
    JSON.stringify(
      {
        tag: "[ProspectOutreachAudit]",
        readOnly: true,
        iwiin,
        jives,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
