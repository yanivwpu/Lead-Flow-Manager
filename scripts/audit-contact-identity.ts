/**
 * Read-only production-style identity audit for Susu / Yaniv.
 * Run: npx tsx scripts/audit-contact-identity.ts
 * Safe fields only — masks emails, truncates IDs.
 */
import "dotenv/config";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { contacts, conversations, messages } from "../shared/schema";
import { db } from "../drizzle/db";

function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const e = String(email).trim().toLowerCase();
  const [local, domain] = e.split("@");
  if (!domain) return "***";
  const l = local.slice(0, 2) + "***";
  return `${l}@${domain}`;
}

function shortId(id: string | null | undefined): string | null {
  if (!id) return null;
  return String(id).slice(0, 8);
}

async function auditName(namePattern: string) {
  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      email: contacts.email,
      phone: contacts.phone,
      tag: contacts.tag,
      pipelineStage: contacts.pipelineStage,
      leadScore: contacts.leadScore,
      primaryChannel: contacts.primaryChannel,
      facebookId: contacts.facebookId,
      whatsappId: contacts.whatsappId,
      instagramId: contacts.instagramId,
      source: contacts.source,
      createdAt: contacts.createdAt,
      updatedAt: contacts.updatedAt,
    })
    .from(contacts)
    .where(ilike(contacts.name, namePattern))
    .limit(50);

  console.log(`\n=== Contacts matching ${namePattern} (count=${rows.length}) ===`);
  for (const c of rows) {
    console.log(
      JSON.stringify({
        tag: "[ContactIdentityAudit]",
        event: "contact",
        contactId: shortId(c.id),
        name: c.name,
        emailMasked: maskEmail(c.email),
        hasPhone: Boolean(c.phone),
        tag: c.tag,
        pipelineStage: c.pipelineStage,
        leadScore: c.leadScore,
        primaryChannel: c.primaryChannel,
        hasFacebookId: Boolean(c.facebookId),
        facebookIdPrefix: c.facebookId ? String(c.facebookId).slice(0, 6) : null,
        hasWhatsappId: Boolean(c.whatsappId),
        hasInstagramId: Boolean(c.instagramId),
        source: c.source,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }),
    );

    const convs = await db
      .select({
        id: conversations.id,
        channel: conversations.channel,
        subject: conversations.subject,
        createdAt: conversations.createdAt,
        lastMessageAt: conversations.lastMessageAt,
        channelAccountId: conversations.channelAccountId,
        externalThreadId: conversations.externalThreadId,
        lastMessagePreview: conversations.lastMessagePreview,
        lastMessageDirection: conversations.lastMessageDirection,
      })
      .from(conversations)
      .where(eq(conversations.contactId, c.id))
      .limit(30);

    for (const conv of convs) {
      const msgCount = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(messages)
        .where(eq(messages.conversationId, conv.id));
      console.log(
        JSON.stringify({
          tag: "[ContactIdentityAudit]",
          event: "conversation",
          contactId: shortId(c.id),
          conversationId: shortId(conv.id),
          channel: conv.channel,
          subject: (conv.subject || "").slice(0, 80),
          createdAt: conv.createdAt,
          lastMessageAt: conv.lastMessageAt,
          hasExternalThreadId: Boolean(conv.externalThreadId),
          hasChannelAccountId: Boolean(conv.channelAccountId),
          messageCount: msgCount[0]?.n ?? 0,
          previewKind: /invitation|calendar|invite|accepted|declined/i.test(
            `${conv.subject || ""} ${conv.lastMessagePreview || ""}`,
          )
            ? "calendar_or_invite"
            : /test\s*\d+/i.test(conv.subject || "")
              ? "test_email"
              : "normal",
        }),
      );
    }
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL missing");
    process.exit(1);
  }
  await auditName("%Susu%Sahbak%");
  await auditName("%Yaniv%");
  console.log("\n[ContactIdentityAudit] done");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
