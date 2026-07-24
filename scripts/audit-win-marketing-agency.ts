/**
 * READ-ONLY audit for W.I.N. Marketing Agency lifecycle mismatch.
 * Run: npx tsx scripts/audit-win-marketing-agency.ts
 */
import "dotenv/config";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import {
  contacts,
  conversations,
  messages,
  prospectIntelligence,
  prospectOutreachQueueItems,
} from "../shared/schema";
import { db } from "../drizzle/db";
import { isQualifiedForEmailCampaign } from "../shared/prospectAiReviewState";
import { hasTraceableProspectOutreachSend } from "../shared/prospectTraceableOutreach";
import { detectPriorProspectOutreach } from "../shared/prospectPriorOutreach";

async function main() {
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
      recommendedOffer: prospectIntelligence.recommendedOffer,
      needsReview: prospectIntelligence.needsReview,
      websiteUrlUsed: prospectIntelligence.websiteUrlUsed,
      companyName: prospectIntelligence.companyName,
    })
    .from(contacts)
    .innerJoin(prospectIntelligence, eq(prospectIntelligence.contactId, contacts.id))
    .where(
      or(
        ilike(contacts.name, "%w.i.n%"),
        ilike(contacts.name, "%win%marketing%"),
        ilike(prospectIntelligence.companyName, "%w.i.n%"),
        ilike(prospectIntelligence.companyName, "%win%marketing%"),
      ),
    )
    .limit(20);

  console.log(
    JSON.stringify({
      found: rows.length,
      names: rows.map((r) => ({ name: r.name, company: r.companyName })),
    }),
  );

  for (const r of rows) {
    const queue = await db
      .select({
        queueStatus: prospectOutreachQueueItems.queueStatus,
        messageId: prospectOutreachQueueItems.messageId,
        conversationId: prospectOutreachQueueItems.conversationId,
      })
      .from(prospectOutreachQueueItems)
      .where(eq(prospectOutreachQueueItems.contactId, r.contactId));

    const convs = await db
      .select({
        id: conversations.id,
        subject: conversations.subject,
      })
      .from(conversations)
      .where(and(eq(conversations.contactId, r.contactId), eq(conversations.channel, "email")));

    const emailConversations: Array<{ id: string; subject: string | null; hasOutbound: boolean }> =
      [];
    for (const c of convs) {
      const outs = await db
        .select({ id: messages.id })
        .from(messages)
        .where(and(eq(messages.conversationId, c.id), eq(messages.direction, "outbound")))
        .limit(1);
      emailConversations.push({
        id: c.id,
        subject: c.subject,
        hasOutbound: outs.length > 0,
      });
    }

    const prior = detectPriorProspectOutreach({
      outreachStatus: r.outreachStatus,
      outreachConversationId: r.outreachConversationId,
      outreachMessageId: r.outreachMessageId,
      outreachSentAt: r.outreachSentAt,
      emailConversations,
      hasSuccessfulQueueSend: queue.some((q) => q.queueStatus === "sent"),
    });

    const ux = {
      analysisStatus: r.analysisStatus,
      reviewStatus: r.reviewStatus,
      needsReview: r.needsReview,
      enrichmentStatus: r.enrichmentStatus,
      outreachStatus: r.outreachStatus,
      outreachSentAt: r.outreachSentAt?.toISOString() || null,
      outreachMessageId: r.outreachMessageId,
      outreachConversationId: r.outreachConversationId,
      email: r.email,
      websiteUrlUsed: r.websiteUrlUsed,
      notQualified: String(r.recommendedOffer || "").toLowerCase() === "not_a_fit",
      queueStatus: queue[0]?.queueStatus || null,
      /** Same flag list API now attaches from detectPriorProspectOutreach. */
      priorOutreachDetected: prior.alreadyContacted,
    };

    const clientQualified = isQualifiedForEmailCampaign(ux);
    const traceable = hasTraceableProspectOutreachSend(ux);

    console.log(
      JSON.stringify(
        {
          name: r.name,
          companyName: r.companyName,
          contactIdPrefix: String(r.contactId).slice(0, 8),
          emailMasked: r.email
            ? String(r.email).slice(0, 2) + "***@" + String(r.email).split("@")[1]
            : null,
          pi: {
            reviewStatus: r.reviewStatus,
            outreachStatus: r.outreachStatus,
            outreachSentAt: r.outreachSentAt?.toISOString() || null,
            hasConvId: Boolean(r.outreachConversationId),
            hasMsgId: Boolean(r.outreachMessageId),
            enrichmentStatus: r.enrichmentStatus,
            analysisStatus: r.analysisStatus,
            offer: r.recommendedOffer,
            needsReview: r.needsReview,
          },
          queue: { count: queue.length, statuses: queue.map((q) => q.queueStatus) },
          emailActivity: {
            convCount: convs.length,
            subjects: emailConversations.map((c) => ({
              subject: String(c.subject || "").slice(0, 60),
              hasOutbound: c.hasOutbound,
            })),
            ideaOutbound: emailConversations.filter(
              (c) => /^Idea for /i.test(String(c.subject || "")) && c.hasOutbound,
            ).length,
          },
          prior,
          resolvers: {
            clientQualified,
            traceableSend: traceable,
            /** After fix: should be false when prior.alreadyContacted. */
            mismatch: clientQualified && prior.alreadyContacted,
          },
        },
        null,
        2,
      ),
    );
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
