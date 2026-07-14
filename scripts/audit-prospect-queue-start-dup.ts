/**
 * Safe audit for queue start + duplicate outreach (no secrets/bodies).
 * npx tsx scripts/audit-prospect-queue-start-dup.ts
 */
import { and, desc, eq, ilike } from "drizzle-orm";
import { db } from "../drizzle/db";
import {
  contacts,
  conversations,
  messages,
  prospectIntelligence,
  prospectOutreachQueueItems,
  prospectOutreachSettings,
} from "@shared/schema";
import { resolveProspectImportDestinationUserId } from "../server/prospectImport/prospectImportService";

async function main() {
  const wid = await resolveProspectImportDestinationUserId();
  const settings = await db
    .select()
    .from(prospectOutreachSettings)
    .where(eq(prospectOutreachSettings.workspaceUserId, wid))
    .limit(1);
  console.log(
    JSON.stringify({
      tag: "[AuditQueue]",
      event: "settings",
      exists: Boolean(settings[0]),
      paused: settings[0]?.paused ?? null,
      note: "missing row => getOutreachSettings defaults paused:false (BUG)",
    }),
  );

  for (const n of ["smash", "james solomon", "outsmart", "interactive"]) {
    const rows = await db
      .select({ id: contacts.id, name: contacts.name, email: contacts.email })
      .from(contacts)
      .where(ilike(contacts.name, `%${n}%`))
      .limit(5);
    for (const c of rows) {
      const pi = await db
        .select({
          reviewStatus: prospectIntelligence.reviewStatus,
          outreachStatus: prospectIntelligence.outreachStatus,
          outreachConversationId: prospectIntelligence.outreachConversationId,
          outreachMessageId: prospectIntelligence.outreachMessageId,
          outreachSentAt: prospectIntelligence.outreachSentAt,
        })
        .from(prospectIntelligence)
        .where(eq(prospectIntelligence.contactId, c.id))
        .limit(1);
      const q = await db
        .select({
          id: prospectOutreachQueueItems.id,
          status: prospectOutreachQueueItems.queueStatus,
          scheduledAt: prospectOutreachQueueItems.scheduledAt,
          sentAt: prospectOutreachQueueItems.sentAt,
          conversationId: prospectOutreachQueueItems.conversationId,
          attempts: prospectOutreachQueueItems.attempts,
          lastError: prospectOutreachQueueItems.lastError,
        })
        .from(prospectOutreachQueueItems)
        .where(eq(prospectOutreachQueueItems.contactId, c.id))
        .orderBy(desc(prospectOutreachQueueItems.createdAt))
        .limit(5);
      const convs = await db
        .select({
          id: conversations.id,
          channel: conversations.channel,
          subject: conversations.subject,
          lastMessageAt: conversations.lastMessageAt,
        })
        .from(conversations)
        .where(eq(conversations.contactId, c.id))
        .limit(20);
      const emailConvs = convs.filter((x) => String(x.channel) === "email");
      const outboundCounts: Array<{ conversationId: string; outbound: number }> = [];
      for (const conv of emailConvs.slice(0, 5)) {
        const msgs = await db
          .select({ id: messages.id, direction: messages.direction })
          .from(messages)
          .where(
            and(eq(messages.conversationId, conv.id), eq(messages.direction, "outbound")),
          )
          .limit(20);
        outboundCounts.push({ conversationId: conv.id.slice(0, 8), outbound: msgs.length });
      }
      console.log(
        JSON.stringify({
          tag: "[AuditQueue]",
          prospect: c.name,
          email: c.email,
          contactIdPrefix: c.id.slice(0, 8),
          pi: pi[0] || null,
          queueItems: q.map((x) => ({
            idPrefix: x.id.slice(0, 8),
            status: x.status,
            scheduledAt: x.scheduledAt,
            sentAt: x.sentAt,
            conversationIdPrefix: x.conversationId?.slice(0, 8) || null,
            attempts: x.attempts,
            lastError: x.lastError,
          })),
          emailConversations: emailConvs.map((x) => ({
            idPrefix: x.id.slice(0, 8),
            subject: x.subject,
            lastMessageAt: x.lastMessageAt,
          })),
          outboundCounts,
        }),
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
