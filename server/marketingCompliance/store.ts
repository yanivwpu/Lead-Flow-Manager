import { sql } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { normalizeMarketingEmail, normalizeMarketingPhone, normalizeStoredMarketingPhone } from "./policy";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function lockMarketingWorkspace(tx: Tx, workspace: string) {
  // Same lock is held through the provider call. A committed opt-out wins over
  // all later send attempts, across workers and duplicate contact IDs.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`marketing:${workspace}`}, 0))`);
}
export async function isMarketingSuppressed(workspace: string, email: string, executor: Pick<Tx, "execute"> = db): Promise<boolean> {
  const normalized = normalizeMarketingEmail(email);
  const result = await executor.execute(sql`SELECT 1 FROM marketing_suppressions WHERE workspace_user_id=${workspace} AND email_normalized=${normalized} LIMIT 1`);
  return result.rows.length > 0;
}
export async function suppressMarketingIdentity(input: { workspace: string; email?: string; phone?: string; reason: string; source: string; scope?: "email" | "all" }) {
  const email = input.email ? normalizeMarketingEmail(input.email) : null;
  const phone = input.phone ? normalizeMarketingPhone(input.phone) : null;
  if (!email && !phone) throw new Error("Suppression identity required");
  const scope = input.scope || "all";
  const optOut = !["bounce", "invalid_recipient"].includes(input.reason);
  await db.transaction(async tx => {
    await lockMarketingWorkspace(tx, input.workspace);
    const keys = new Set<string>();
    if (email) keys.add(email);
    if (phone) keys.add(`phone:${phone}`);
    let matches = sql`false`;
    // Expand linked identities under the same lock so deletion of one duplicate
    // cannot erase a global DNC relation already observed on another contact.
    let previousSize = -1;
    while (previousSize !== keys.size) {
      previousSize = keys.size;
      const emails = [...keys].filter(k => !k.startsWith("phone:"));
      const phones = [...keys].filter(k => k.startsWith("phone:")).map(k => k.slice(6));
      const emailMatch = emails.length ? sql`lower(trim(email)) IN (${sql.join(emails.map(k => sql`${k}`), sql`,`)})` : sql`false`;
      const phoneMatch = phones.length ? sql`regexp_replace(phone,'[^0-9]','','g') IN (${sql.join(phones.map(k => sql`${k.slice(1)}`), sql`,`)})` : sql`false`;
      matches = sql`user_id=${input.workspace} AND (${emailMatch} OR ${phoneMatch})`;
      if (scope !== "all") break;
      const linked = await tx.execute(sql`SELECT email,phone FROM contacts WHERE ${matches}`);
      for (const row of linked.rows as Array<{ email?: string; phone?: string }>) {
        try { if (row.email) keys.add(normalizeMarketingEmail(row.email)); } catch {}
        try { if (row.phone) keys.add(`phone:${normalizeStoredMarketingPhone(row.phone)}`); } catch {}
      }
    }
    for (const key of keys) await tx.execute(sql`INSERT INTO marketing_suppressions (workspace_user_id,email_normalized,scope,reason,source)
      VALUES (${input.workspace},${key},${scope},${input.reason},${input.source})
      ON CONFLICT (workspace_user_id,email_normalized) DO UPDATE SET scope=CASE WHEN marketing_suppressions.scope='all' THEN 'all' ELSE EXCLUDED.scope END`);
    // All matching contacts, not just the original recipient contact ID.
    await tx.execute(sql`UPDATE contacts SET custom_fields=COALESCE(custom_fields,'{}'::jsonb) ||
      jsonb_build_object('suppressed',true,'suppressionScope',${scope}::text,'suppressionReason',${input.reason}::text,'suppressionSource',${input.source}::text,'suppressedAt',COALESCE(custom_fields->>'suppressedAt',now()::text)) || ${optOut ? JSON.stringify(scope === "all" ? {unsubscribed:true,campaignOptOut:true,doNotContact:true} : {emailUnsubscribed:true}) : '{}'}::jsonb
      WHERE ${matches}`);
    await tx.execute(sql`UPDATE prospect_outreach_queue_items SET queue_status='skipped',last_error='marketing_suppressed',updated_at=now()
      WHERE workspace_user_id=${input.workspace} AND queue_status IN ('queued','pending','paused','sending','processing','retry') AND
      (${scope}='all' OR selected_channel='email') AND (recipient_identity_normalized=${email} OR recipient_identity_normalized=${phone} OR contact_id IN (SELECT id FROM contacts WHERE ${matches}))`);
    // Existing workflow/follow-up jobs have no trustworthy marketing purpose
    // classification. Cancel those attached to the identity; new transactional
    // sends remain available through the ordinary manual/transactional path.
    if (scope === "all") {
      for (const table of ["flow_jobs", "no_reply_jobs"] as const) {
        await tx.execute(sql`UPDATE ${sql.identifier(table)} SET status='skipped'
          WHERE user_id=${input.workspace} AND status IN ('pending','running') AND contact_id IN
          (SELECT id FROM contacts WHERE ${matches})`);
      }
      await tx.execute(sql`UPDATE campaign_enrollments SET status='cancelled',next_run_at=NULL,updated_at=now()
        WHERE user_id=${input.workspace} AND status IN ('active','paused') AND contact_id IN
        (SELECT id FROM contacts WHERE ${matches})`);
      await tx.execute(sql`UPDATE automation_timer_jobs SET status='skipped',last_error='marketing_suppressed'
        WHERE user_id=${input.workspace} AND status IN ('pending','running') AND payload->>'contactId' IN
        (SELECT id FROM contacts WHERE ${matches})`);
      const suppressedPhones = [...keys].filter(k => k.startsWith("phone:")).map(k => k.slice(7));
      if (suppressedPhones.length) await tx.execute(sql`UPDATE drip_enrollments SET status='cancelled',next_send_at=NULL WHERE status IN ('active','paused') AND chat_id IN
        (SELECT id FROM chats WHERE user_id=${input.workspace} AND regexp_replace(whatsapp_phone,'[^0-9]','','g') IN (${sql.join(suppressedPhones.map(k => sql`${k}`), sql`,`)}))`);
      await tx.execute(sql`UPDATE contacts SET follow_up=NULL,follow_up_date=NULL WHERE ${matches}`);
    }
    await tx.execute(sql`UPDATE prospect_intelligence SET lifecycle_status='archived',archived_at=COALESCE(archived_at,now()),archive_reason=COALESCE(archive_reason,'other'),archive_note=COALESCE(archive_note,'Marketing suppressed'),updated_at=now() WHERE contact_id IN
      (SELECT id FROM contacts WHERE ${matches}) AND COALESCE(lifecycle_status,'active')='active'`);
  });
}

export async function isContactDurablySuppressed(contact: { userId: string; email?: string | null; phone?: string | null }, channel: string, executor: Pick<Tx, "execute"> = db): Promise<boolean> {
  const keys: string[] = [];
  try { if (contact.email) keys.push(normalizeMarketingEmail(contact.email)); } catch {}
  try { if (contact.phone) keys.push(`phone:${normalizeStoredMarketingPhone(contact.phone)}`); } catch {}
  if (!keys.length) return false;
  const result = await executor.execute(sql`SELECT 1 FROM marketing_suppressions WHERE workspace_user_id=${contact.userId} AND email_normalized IN (${sql.join(keys.map(k => sql`${k}`), sql`,`)}) AND (scope='all' OR ${channel}='email') LIMIT 1`);
  return result.rows.length > 0;
}

export async function batchSuppressedContactIds(workspace: string, contacts: Array<{ id: string; email?: string | null; phone?: string | null }>): Promise<Set<string>> {
  const keys = new Map<string, string[]>();
  for (const c of contacts) {
    const values: string[] = [];
    try { if (c.email) values.push(normalizeMarketingEmail(c.email)); } catch {}
    try { if (c.phone) values.push(`phone:${normalizeStoredMarketingPhone(c.phone)}`); } catch {}
    keys.set(c.id, values);
  }
  const identities = [...new Set([...keys.values()].flat())];
  if (!identities.length) return new Set();
  const rows = await db.execute(sql`SELECT email_normalized FROM marketing_suppressions WHERE workspace_user_id=${workspace} AND email_normalized IN (${sql.join(identities.map(k => sql`${k}`), sql`,`)})`);
  const suppressed = new Set(rows.rows.map(r => String(r.email_normalized)));
  return new Set(contacts.filter(c => keys.get(c.id)?.some(key => suppressed.has(key))).map(c => c.id));
}

export class MarketingSuppressionError extends Error {
  constructor() { super("Recipient has a durable global do-not-contact request"); }
}

/** Order manual/transactional email with global DNC commits, without email-only blocks. */
export async function withGlobalDncEmailBoundary<T>(workspace: string, recipients: string[], send: () => Promise<T>): Promise<T> {
  return db.transaction(async tx => {
    await lockMarketingWorkspace(tx, workspace);
    for (const email of recipients) if (await isContactDurablySuppressed({userId:workspace,email}, "global", tx)) throw new MarketingSuppressionError();
    return send();
  });
}

/** Serialize direct legacy phone dispatch with the same workspace opt-out lock. */
export async function withGlobalDncPhoneBoundary<T>(workspace: string, phone: string, send: () => Promise<T>): Promise<T> {
  return db.transaction(async tx => {
    await lockMarketingWorkspace(tx, workspace);
    if (await isContactDurablySuppressed({userId:workspace,phone:normalizeStoredMarketingPhone(phone)}, "global", tx)) throw new MarketingSuppressionError();
    return send();
  });
}

/** Adapter credentials/configuration must be prepared before entering this lock. */
export async function withGlobalDncContactBoundary<T>(workspace: string, contact: {userId: string; email?: string | null; phone?: string | null}, send: () => Promise<T>): Promise<T> {
  if (contact.userId !== workspace) throw new Error("Contact not found");
  return db.transaction(async tx => {
    await lockMarketingWorkspace(tx, workspace);
    if (await isContactDurablySuppressed(contact, "global", tx)) throw new MarketingSuppressionError();
    return send();
  });
}
