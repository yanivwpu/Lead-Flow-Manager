/**
 * Read-only estimate of email-created CRM contacts. Does not delete or update.
 * Run: npx tsx scripts/estimate-email-junk-contacts.ts
 */
import { db } from "../drizzle/db";
import { sql } from "drizzle-orm";

async function one(query: ReturnType<typeof sql>) {
  const result = await db.execute(query);
  const rows = (result as { rows?: Array<Record<string, unknown>> }).rows ?? (result as unknown as Array<Record<string, unknown>>);
  return rows[0] as Record<string, unknown>;
}

async function main() {
  const total = await one(sql`SELECT count(*)::int AS n FROM contacts`);
  const sourceEmail = await one(sql`SELECT count(*)::int AS n FROM contacts WHERE source = 'email'`);
  const sourceInbox = await one(sql`SELECT count(*)::int AS n FROM contacts WHERE source = 'email_inbox'`);
  const noreplyLike = await one(sql`
    SELECT count(*)::int AS n FROM contacts
    WHERE source = 'email'
      AND email IS NOT NULL
      AND (
        lower(split_part(email, '@', 1)) ~ '^(noreply|no-reply|no_reply|donotreply|mailer-daemon|postmaster|bounce|notifications?|alerts?|newsletters?)'
        OR lower(split_part(email, '@', 2)) ~ '(^|\\.)(notification|notifications|alerts?|newsletters?|noreply|no-reply)(\\.|$)'
      )
  `);
  const emailNoOutbound = await one(sql`
    SELECT count(*)::int AS n FROM contacts c
    WHERE c.source = 'email'
      AND NOT EXISTS (
        SELECT 1 FROM messages m WHERE m.contact_id = c.id AND m.direction = 'outbound'
      )
  `);
  const noreplyNoOutbound = await one(sql`
    SELECT count(*)::int AS n FROM contacts c
    WHERE c.source = 'email'
      AND email IS NOT NULL
      AND (
        lower(split_part(c.email, '@', 1)) ~ '^(noreply|no-reply|no_reply|donotreply|mailer-daemon|postmaster|bounce|notifications?|alerts?|newsletters?)'
        OR lower(split_part(c.email, '@', 2)) ~ '(^|\\.)(notification|notifications|alerts?|newsletters?|noreply|no-reply)(\\.|$)'
      )
      AND NOT EXISTS (
        SELECT 1 FROM messages m WHERE m.contact_id = c.id AND m.direction = 'outbound'
      )
  `);
  const emailOnlyChannel = await one(sql`
    SELECT count(*)::int AS n FROM contacts c
    WHERE c.source = 'email'
      AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.contact_id = c.id AND m.direction = 'outbound')
      AND EXISTS (SELECT 1 FROM conversations v WHERE v.contact_id = c.id AND v.channel = 'email')
      AND NOT EXISTS (SELECT 1 FROM conversations v WHERE v.contact_id = c.id AND v.channel <> 'email')
  `);

  console.log(JSON.stringify({
    totalContacts: total.n,
    sourceEmail: sourceEmail.n,
    sourceEmailInbox: sourceInbox.n,
    emailNoreplyLikeAddress: noreplyLike.n,
    emailSourceNoOutbound: emailNoOutbound.n,
    emailNoreplyLikeAndNoOutbound: noreplyNoOutbound.n,
    emailOnlyChannelNoOutbound: emailOnlyChannel.n,
  }, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
