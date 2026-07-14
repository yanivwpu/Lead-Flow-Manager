/**
 * Read-only audit for W.I.N. marketing agency PI outreach lifecycle.
 * Safe fields only — no message bodies.
 */
import "dotenv/config";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import {
  contacts,
  conversations,
  messages,
  prospectIntelligence,
  emailMessageDetails,
} from "../shared/schema";
import { db } from "../drizzle/db";

function maskEmail(e: string | null | undefined) {
  if (!e) return null;
  const [l, d] = String(e).toLowerCase().split("@");
  return (l?.slice(0, 3) || "") + "***@" + (d || "");
}

async function main() {
  const contactsFound = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      email: contacts.email,
    })
    .from(contacts)
    .where(
      or(
        ilike(contacts.email, "%whatineedmarketing%"),
        ilike(contacts.name, "%w.i.n%"),
        ilike(contacts.name, "%win%marketing%"),
      ),
    )
    .limit(20);

  for (const c of contactsFound) {
    console.log(
      JSON.stringify({
        tag: "[ProspectOutreachLifecycle]",
        event: "win_contact",
        contactId: c.id.slice(0, 8),
        name: c.name,
        emailMasked: maskEmail(c.email),
        emailExactMatch:
          String(c.email || "").toLowerCase().trim() === "info@whatineedmarketing.com",
      }),
    );
  }

  const target = contactsFound.find(
    (c) => String(c.email || "").toLowerCase().trim() === "info@whatineedmarketing.com",
  );
  if (!target) {
    console.log(
      JSON.stringify({
        tag: "[ProspectOutreachLifecycle]",
        event: "win_audit",
        found: false,
        reason: "no_contact_with_exact_email",
      }),
    );
    process.exit(0);
  }

  const pi = await db
    .select()
    .from(prospectIntelligence)
    .where(eq(prospectIntelligence.contactId, target.id))
    .limit(1);

  const row = pi[0];
  console.log(
    JSON.stringify({
      tag: "[ProspectOutreachLifecycle]",
      event: "win_pi_record",
      contactId: target.id.slice(0, 8),
      reviewStatus: row?.reviewStatus ?? null,
      outreachStatus: row?.outreachStatus ?? null,
      outreachSentAt: row?.outreachSentAt ?? null,
      outreachConversationId: row?.outreachConversationId
        ? String(row.outreachConversationId).slice(0, 8)
        : null,
      outreachMessageId: row?.outreachMessageId
        ? String(row.outreachMessageId).slice(0, 8)
        : null,
      repliedAt: row?.repliedAt ?? null,
      hasPiRow: Boolean(row),
    }),
  );

  const convs = await db
    .select({
      id: conversations.id,
      subject: conversations.subject,
      channel: conversations.channel,
      createdAt: conversations.createdAt,
      lastMessageAt: conversations.lastMessageAt,
      lastMessageDirection: conversations.lastMessageDirection,
      externalThreadId: conversations.externalThreadId,
    })
    .from(conversations)
    .where(and(eq(conversations.contactId, target.id), eq(conversations.channel, "email")))
    .orderBy(desc(conversations.createdAt))
    .limit(10);

  for (const conv of convs) {
    const msgRows = await db
      .select({
        id: messages.id,
        direction: messages.direction,
        status: messages.status,
        createdAt: messages.createdAt,
        sentAt: messages.sentAt,
      })
      .from(messages)
      .where(eq(messages.conversationId, conv.id))
      .orderBy(desc(messages.createdAt))
      .limit(5);

    for (const m of msgRows) {
      const detail = await db
        .select({
          subject: emailMessageDetails.subject,
          toAddresses: emailMessageDetails.toAddresses,
          fromAddress: emailMessageDetails.fromAddress,
        })
        .from(emailMessageDetails)
        .where(eq(emailMessageDetails.messageId, m.id))
        .limit(1);
      const d = detail[0];
      const toList = Array.isArray(d?.toAddresses) ? d.toAddresses : [];
      const toEmails = toList
        .map((x: any) => (typeof x === "string" ? x : x?.email))
        .filter(Boolean)
        .map((x: string) => String(x).toLowerCase());

      console.log(
        JSON.stringify({
          tag: "[ProspectOutreachLifecycle]",
          event: "win_email_message",
          conversationId: conv.id.slice(0, 8),
          messageId: m.id.slice(0, 8),
          direction: m.direction,
          status: m.status,
          subject: String(d?.subject || conv.subject || "").slice(0, 80),
          toMasked: toEmails.map(maskEmail),
          fromMasked: maskEmail(d?.fromAddress),
          createdAt: m.createdAt,
          sentAt: m.sentAt,
          conversationCreatedAt: conv.createdAt,
          isIdeaFor: /^Idea for /i.test(String(d?.subject || conv.subject || "")),
        }),
      );
    }

    if (!msgRows.length) {
      console.log(
        JSON.stringify({
          tag: "[ProspectOutreachLifecycle]",
          event: "win_email_conversation_empty",
          conversationId: conv.id.slice(0, 8),
          subject: String(conv.subject || "").slice(0, 80),
          createdAt: conv.createdAt,
        }),
      );
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
