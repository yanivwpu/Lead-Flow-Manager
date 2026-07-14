/**
 * Read-only / optional reconcile for Jives Media PI outreach conversation.
 * Run: npx tsx scripts/reconcile-jives-outreach.ts
 * Does not update unless RECONCILE_APPLY=1.
 */
import "dotenv/config";
import { and, eq, ilike, sql } from "drizzle-orm";
import { contacts, conversations, messages, prospectIntelligence } from "../shared/schema";
import { db } from "../drizzle/db";

async function main() {
  const apply = process.env.RECONCILE_APPLY === "1";
  const rows = await db
    .select({
      contactId: contacts.id,
      name: contacts.name,
      email: contacts.email,
      reviewStatus: prospectIntelligence.reviewStatus,
      outreachStatus: prospectIntelligence.outreachStatus,
      outreachConversationId: prospectIntelligence.outreachConversationId,
      outreachSentAt: prospectIntelligence.outreachSentAt,
    })
    .from(contacts)
    .innerJoin(prospectIntelligence, eq(prospectIntelligence.contactId, contacts.id))
    .where(ilike(contacts.name, "%Jives%Media%"))
    .limit(5);

  if (!rows.length) {
    console.log(JSON.stringify({ tag: "[ProspectOutreachLifecycle]", event: "jives_audit", found: false }));
    process.exit(0);
  }

  for (const r of rows) {
    const emailMasked = r.email
      ? String(r.email).slice(0, 3) + "***@" + String(r.email).split("@")[1]
      : null;
    console.log(
      JSON.stringify({
        tag: "[ProspectOutreachLifecycle]",
        event: "jives_audit",
        contactId: String(r.contactId).slice(0, 8),
        name: r.name,
        emailMasked,
        reviewStatus: r.reviewStatus,
        outreachStatus: r.outreachStatus,
        hasOutreachConversation: Boolean(r.outreachConversationId),
      }),
    );

    if (r.outreachConversationId || r.outreachStatus === "outreach_sent" || r.outreachStatus === "replied") {
      console.log(
        JSON.stringify({
          tag: "[ProspectOutreachLifecycle]",
          event: "jives_reconcile",
          reason: "already_linked_or_sent",
          contactId: String(r.contactId).slice(0, 8),
        }),
      );
      continue;
    }

    if (r.reviewStatus !== "approved") {
      console.log(
        JSON.stringify({
          tag: "[ProspectOutreachLifecycle]",
          event: "jives_reconcile",
          reason: "not_approved",
          contactId: String(r.contactId).slice(0, 8),
        }),
      );
      continue;
    }

    const convs = await db
      .select({
        id: conversations.id,
        subject: conversations.subject,
        channel: conversations.channel,
        createdAt: conversations.createdAt,
        lastMessageDirection: conversations.lastMessageDirection,
      })
      .from(conversations)
      .where(and(eq(conversations.contactId, r.contactId), eq(conversations.channel, "email")));

    const ideaConvs = convs.filter((c) =>
      /^Idea for /i.test(String(c.subject || "")),
    );

    console.log(
      JSON.stringify({
        tag: "[ProspectOutreachLifecycle]",
        event: "jives_candidates",
        contactId: String(r.contactId).slice(0, 8),
        emailConversationCount: convs.length,
        ideaForSubjectCount: ideaConvs.length,
        subjects: ideaConvs.map((c) => String(c.subject || "").slice(0, 60)),
      }),
    );

    if (ideaConvs.length !== 1) {
      console.log(
        JSON.stringify({
          tag: "[ProspectOutreachLifecycle]",
          event: "jives_reconcile",
          reason:
            ideaConvs.length === 0
              ? "no_deterministic_idea_for_thread"
              : "ambiguous_multiple_idea_for_threads",
          contactId: String(r.contactId).slice(0, 8),
          apply: false,
        }),
      );
      continue;
    }

    const chosen = ideaConvs[0];
    const outbound = await db
      .select({ id: messages.id, direction: messages.direction })
      .from(messages)
      .where(and(eq(messages.conversationId, chosen.id), eq(messages.direction, "outbound")))
      .limit(1);

    if (!outbound.length) {
      console.log(
        JSON.stringify({
          tag: "[ProspectOutreachLifecycle]",
          event: "jives_reconcile",
          reason: "no_outbound_on_candidate",
          conversationId: String(chosen.id).slice(0, 8),
        }),
      );
      continue;
    }

    if (!apply) {
      console.log(
        JSON.stringify({
          tag: "[ProspectOutreachLifecycle]",
          event: "jives_reconcile",
          reason: "dry_run_eligible",
          contactId: String(r.contactId).slice(0, 8),
          conversationId: String(chosen.id).slice(0, 8),
          messageId: String(outbound[0].id).slice(0, 8),
          hint: "Re-run with RECONCILE_APPLY=1 to link",
        }),
      );
      continue;
    }

    const { reconcileProspectOutreachConversation } = await import(
      "../server/prospectImport/prospectIntelligenceService"
    );
    const result = await reconcileProspectOutreachConversation({
      contactId: r.contactId,
      conversationId: chosen.id,
      messageId: outbound[0].id,
    });
    console.log(
      JSON.stringify({
        tag: "[ProspectOutreachLifecycle]",
        event: "jives_reconcile",
        ...result,
        contactId: String(r.contactId).slice(0, 8),
        conversationId: String(chosen.id).slice(0, 8),
      }),
    );
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
