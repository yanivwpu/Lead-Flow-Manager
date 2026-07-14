/**
 * Deterministic one-time W.I.N. backfill AFTER the prospectOutreach passthrough fix ships.
 * Dry-run by default. Apply with RECONCILE_APPLY=1.
 * Do not send another email.
 */
import "dotenv/config";
import { and, desc, eq } from "drizzle-orm";
import {
  contacts,
  conversations,
  messages,
  prospectIntelligence,
  emailMessageDetails,
} from "../shared/schema";
import { db } from "../drizzle/db";

async function main() {
  const apply = process.env.RECONCILE_APPLY === "1";
  const contactRows = await db
    .select()
    .from(contacts)
    .where(eq(contacts.email, "info@whatineedmarketing.com"))
    .limit(1);
  const contact = contactRows[0];
  if (!contact) {
    console.log(JSON.stringify({ tag: "[ProspectOutreachLifecycle]", event: "win_reconcile", found: false }));
    process.exit(0);
  }

  const piRows = await db
    .select()
    .from(prospectIntelligence)
    .where(eq(prospectIntelligence.contactId, contact.id))
    .limit(1);
  const pi = piRows[0];
  console.log(
    JSON.stringify({
      tag: "[ProspectOutreachLifecycle]",
      event: "win_reconcile_state",
      contactId: contact.id.slice(0, 8),
      reviewStatus: pi?.reviewStatus,
      outreachStatus: pi?.outreachStatus,
      outreachConversationId: pi?.outreachConversationId?.slice(0, 8) ?? null,
    }),
  );

  if (!pi) process.exit(0);
  if (pi.outreachStatus === "outreach_sent" || pi.outreachStatus === "replied") {
    console.log(JSON.stringify({ tag: "[ProspectOutreachLifecycle]", event: "win_reconcile", reason: "already_sent" }));
    process.exit(0);
  }

  const convs = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.contactId, contact.id), eq(conversations.channel, "email")))
    .orderBy(desc(conversations.createdAt));

  const idea = convs.filter((c) => /^Idea for /i.test(String(c.subject || "")));
  if (idea.length !== 1) {
    console.log(
      JSON.stringify({
        tag: "[ProspectOutreachLifecycle]",
        event: "win_reconcile",
        reason: idea.length === 0 ? "no_idea_for_thread" : "ambiguous",
        count: idea.length,
      }),
    );
    process.exit(0);
  }

  const conv = idea[0];
  const outs = await db
    .select({ id: messages.id, status: messages.status, direction: messages.direction })
    .from(messages)
    .where(and(eq(messages.conversationId, conv.id), eq(messages.direction, "outbound")))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  const msg = outs[0];
  if (!msg || msg.status !== "sent") {
    console.log(
      JSON.stringify({
        tag: "[ProspectOutreachLifecycle]",
        event: "win_reconcile",
        reason: "no_sent_outbound",
        conversationId: conv.id.slice(0, 8),
      }),
    );
    process.exit(0);
  }

  const detail = await db
    .select({ subject: emailMessageDetails.subject })
    .from(emailMessageDetails)
    .where(eq(emailMessageDetails.messageId, msg.id))
    .limit(1);

  console.log(
    JSON.stringify({
      tag: "[ProspectOutreachLifecycle]",
      event: "win_reconcile",
      reason: apply ? "applying" : "dry_run_eligible",
      contactId: contact.id.slice(0, 8),
      conversationId: conv.id.slice(0, 8),
      messageId: msg.id.slice(0, 8),
      subject: String(detail[0]?.subject || conv.subject || "").slice(0, 80),
    }),
  );

  if (!apply) {
    console.log(
      JSON.stringify({
        tag: "[ProspectOutreachLifecycle]",
        event: "win_reconcile",
        hint: "Re-run with RECONCILE_APPLY=1 after deploying prospectOutreach passthrough fix",
      }),
    );
    process.exit(0);
  }

  const { reconcileProspectOutreachConversation } = await import(
    "../server/prospectImport/prospectIntelligenceService"
  );
  const result = await reconcileProspectOutreachConversation({
    contactId: contact.id,
    conversationId: conv.id,
    messageId: msg.id,
  });
  console.log(JSON.stringify({ tag: "[ProspectOutreachLifecycle]", event: "win_reconcile_result", ...result }));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
