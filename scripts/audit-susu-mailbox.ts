import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../drizzle/db";

function mask(e: unknown) {
  if (!e) return null;
  const s = String(e).toLowerCase().trim();
  const at = s.indexOf("@");
  if (at < 0) return "***";
  return s.slice(0, Math.min(3, at)) + "***@" + s.slice(at + 1);
}

async function main() {
  const susuRes = await db.execute(sql`
    SELECT id::text AS id, name, email, tag, lead_score, facebook_id IS NOT NULL AS has_fb,
           primary_channel, source, user_id::text AS user_id, updated_at
    FROM contacts
    WHERE name ILIKE '%Susu%Sahbak%'
    LIMIT 1
  `);
  const c = ((susuRes as any).rows ?? susuRes)[0];
  if (!c) {
    console.log(JSON.stringify({ tag: "[ContactIdentityAudit]", event: "no_susu" }));
    process.exit(1);
  }
  const susuEmail = c.email ? String(c.email).trim().toLowerCase() : null;
  console.log(
    JSON.stringify({
      tag: "[ContactIdentityAudit]",
      event: "susu_contact",
      contactId: String(c.id).slice(0, 8),
      emailMasked: mask(c.email),
      tagField: c.tag,
      leadScore: c.lead_score,
      hasFb: c.has_fb,
      primaryChannel: c.primary_channel,
      source: c.source,
      updatedAt: c.updated_at,
    }),
  );

  const mb = await db.execute(sql`
    SELECT id::text AS id, email_address, display_name, provider, workspace_user_id::text AS ws
    FROM email_mailboxes
    WHERE workspace_user_id = ${c.user_id}
  `);
  for (const a of (mb as any).rows ?? mb) {
    const em = String(a.email_address || "")
      .trim()
      .toLowerCase();
    console.log(
      JSON.stringify({
        tag: "[ContactIdentityAudit]",
        event: "mailbox",
        mailboxId: String(a.id).slice(0, 8),
        emailMasked: mask(em),
        sameAsSusuEmail: Boolean(susuEmail && em === susuEmail),
        displayName: a.display_name,
      }),
    );
  }

  const yaniv = await db.execute(sql`
    SELECT id::text AS id, name, email, tag, lead_score
    FROM contacts WHERE name ILIKE '%Yaniv%' LIMIT 1
  `);
  const y = ((yaniv as any).rows ?? yaniv)[0];
  if (y) {
    const yEmail = y.email ? String(y.email).trim().toLowerCase() : null;
    console.log(
      JSON.stringify({
        tag: "[LeadScoreAudit]",
        event: "yaniv",
        contactId: String(y.id).slice(0, 8),
        emailMasked: mask(y.email),
        tagField: y.tag,
        leadScore: y.lead_score,
        susuEmailEqualsYanivEmail: Boolean(susuEmail && yEmail && susuEmail === yEmail),
        susuEmailLocalEqYanivLocal: Boolean(
          susuEmail &&
            yEmail &&
            susuEmail.split("@")[0] === yEmail.split("@")[0],
        ),
      }),
    );
  }

  // Any other contact with same email as Susu?
  if (susuEmail) {
    const dup = await db.execute(sql`
      SELECT id::text AS id, name, email, facebook_id IS NOT NULL AS has_fb, source, tag
      FROM contacts
      WHERE user_id = ${c.user_id}
        AND lower(trim(email)) = ${susuEmail}
    `);
    for (const d of (dup as any).rows ?? dup) {
      console.log(
        JSON.stringify({
          tag: "[ContactIdentityAudit]",
          event: "same_email_contacts",
          contactId: String(d.id).slice(0, 8),
          name: d.name,
          emailMasked: mask(d.email),
          hasFb: d.has_fb,
          source: d.source,
          tagField: d.tag,
          isSusu: String(d.id) === String(c.id),
        }),
      );
    }
  }

  const details = await db.execute(sql`
    SELECT c.id::text AS conversation_id, c.subject, c.created_at, c.last_message_at,
           d.from_address, d.to_addresses, d.subject AS detail_subject, d.snippet
    FROM conversations c
    LEFT JOIN messages m ON m.conversation_id = c.id
    LEFT JOIN email_message_details d ON d.message_id = m.id
    WHERE c.contact_id = ${c.id} AND c.channel = 'email'
    ORDER BY c.created_at DESC
  `);
  for (const row of (details as any).rows ?? details) {
    const toList = Array.isArray(row.to_addresses) ? row.to_addresses : [];
    const toEmails = toList
      .map((x: any) => (typeof x === "string" ? x : x?.email))
      .filter(Boolean)
      .map((x: string) => x.toLowerCase());
    const from = row.from_address ? String(row.from_address).toLowerCase() : null;
    console.log(
      JSON.stringify({
        tag: "[ContactIdentityAudit]",
        event: "email_thread",
        conversationId: String(row.conversation_id).slice(0, 8),
        subject: String(row.subject || row.detail_subject || "").slice(0, 70),
        fromMasked: mask(from),
        toMasked: toEmails.map(mask),
        fromEqSusu: Boolean(susuEmail && from === susuEmail),
        toContainsSusu: Boolean(susuEmail && toEmails.includes(susuEmail)),
        createdAt: row.created_at,
        lastMessageAt: row.last_message_at,
        matchPath: "contacts.email exact match via resolveEmailContact",
      }),
    );
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
