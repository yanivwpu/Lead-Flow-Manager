import { getEmailChannelCaps } from "../emailChannel/emailChannelConfig";
import { renderProspectOutreachEmailHtml } from "../prospectImport/prospectOutreachEmailHtml";
import { sql } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { addMarketingFooter, assertStagingMarketingRecipient, issueOptOutToken, marketingPublicOrigin, marketingQueueProbeRecipient, readProductionPilotConfig } from "./policy";
import { isMarketingSuppressed, lockMarketingWorkspace } from "./store";

export async function requireMarketingSender(workspace: string, mailbox: string, executor: Pick<typeof db, "execute"> = db) {
  const result = await executor.execute(sql`SELECT brand,postal_address FROM marketing_sender_profiles WHERE workspace_user_id=${workspace} AND mailbox_id=${mailbox} AND verified_at IS NOT NULL`);
  const profile = result.rows[0] as { brand: string; postal_address: string } | undefined;
  if (!profile) throw new Error("Marketing blocked: verify this sender's physical mailing address in Settings → Marketing sender setup.");
  return profile;
}
export async function assertMarketingQueueSetup(workspace: string) {
  // Resolve the sender first: production acceptance requires an exact mailbox
  // and workspace match. An unrelated user's queue cannot be started.
  const result = await db.execute(sql`SELECT id FROM email_mailboxes WHERE workspace_user_id=${workspace} AND is_primary=true LIMIT 1`);
  const mailbox = result.rows[0]?.id;
  if (!mailbox) throw new Error("Marketing blocked: connect a sender mailbox first.");
  const probe = marketingQueueProbeRecipient();
  assertStagingMarketingRecipient(
    [probe], process.env,
    { workspace, mailbox: String(mailbox), phase: "queue" },
  );
  // A pilot cannot resume unrelated paused/queued messages from earlier
  // campaigns. Each queued identity must exactly match the approved list.
  if (process.env.MARKETING_SENDS_ENABLED === "production-pilot") {
    const pilot = readProductionPilotConfig();
    const pending = await db.execute(sql`SELECT contact_id,recipient_identity_normalized
      FROM prospect_outreach_queue_items
      WHERE workspace_user_id=${workspace}
      AND queue_status IN ('queued','paused','sending') LIMIT 50`);
    const invalid = pending.rows.some(row =>
      !pilot.recipients.some(allowed =>
        allowed.contactId === String(row.contact_id) &&
        allowed.email === String(row.recipient_identity_normalized || "").trim().toLowerCase()
      )
    );
    if (invalid) throw new Error("Pilot start blocked: review and remove all non-pilot queued items first");
  }
  marketingPublicOrigin();
  issueOptOutToken({ workspace, email: probe });
  await requireMarketingSender(workspace, String(mailbox));
}
export async function withCompliantMarketingEmail<T>(input: {
  workspace: string; mailbox: string; contactId?: string; recipients: string[]; text: string; html?: string | null;
}, send: (message: { text: string; html: string; unsubscribeUrl: string; onDispatch: () => void }) => Promise<T>): Promise<T> {
  assertStagingMarketingRecipient(
    input.recipients, process.env,
    { workspace: input.workspace, mailbox: input.mailbox, contactId: input.contactId, phase: "send" },
  );
  let dispatched = false;
  let rejected: { value: T } | undefined;
  const definiteRejection = new Error("definite_provider_rejection");
  try {
    return await db.transaction(async tx => {
      await lockMarketingWorkspace(tx, input.workspace);
      const email = input.recipients[0];
      if (process.env.MARKETING_SENDS_ENABLED === "production-pilot") {
        // Under the same workspace lock as the Gmail provider call, enforce
        // one successful outreach email per pre-reviewed contact for the pilot.
        const pilot = readProductionPilotConfig();
        if (!input.contactId || !pilot.recipients.some(r => r.contactId === input.contactId && r.email === email.toLowerCase())) {
          throw new Error("Pilot contact identity not allowlisted");
        }
        const history = await tx.execute(sql`SELECT id FROM prospect_outreach_queue_items
          WHERE workspace_user_id=${input.workspace}
          AND contact_id=${input.contactId}
          AND selected_channel='email' AND queue_status='sent' LIMIT 1`);
        if (history.rows.length) throw new Error("Pilot contact has already received outreach");
      }
      if (await isMarketingSuppressed(input.workspace, email, tx)) throw new Error("Marketing recipient suppressed");
      // Historical duplicate contact flags remain authoritative before backfill.
      const legacy = await tx.execute(sql`SELECT 1 FROM contacts WHERE user_id=${input.workspace} AND lower(trim(email))=lower(trim(${email})) AND (
        custom_fields @> '{"unsubscribed":true}' OR custom_fields @> '{"optOut":true}' OR custom_fields @> '{"doNotContact":true}' OR custom_fields @> '{"campaignOptOut":true}' OR custom_fields @> '{"marketingOptIn":false}') LIMIT 1`);
      if (legacy.rows.length) throw new Error("Marketing recipient suppressed");
      const profile = await requireMarketingSender(input.workspace, input.mailbox, tx);
      const token = issueOptOutToken({ workspace: input.workspace, email });
      const unsubscribeUrl = `${marketingPublicOrigin()}/api/marketing/unsubscribe/${token}`;
      const bodies = addMarketingFooter({ ...input, html: input.html || renderProspectOutreachEmailHtml(input.text), brand: profile.brand, address: profile.postal_address, url: unsubscribeUrl });
      // Recheck/reserve soft caps under the same worker lock. Earlier mailbox
      // probes cannot protect concurrent workers waiting at this boundary.
      const now = new Date().toISOString();
      const day = now.slice(0, 10); const hour = now.slice(0, 13);
      const quota = await tx.execute(sql`SELECT messages_sent_today,messages_sent_hour,send_count_day_key,send_count_hour_key FROM email_mailboxes WHERE id=${input.mailbox} AND workspace_user_id=${input.workspace} FOR UPDATE`);
      const mailbox = quota.rows[0];
      if (!mailbox) throw new Error("Marketing sender mailbox unavailable");
      const dayCount = mailbox.send_count_day_key === day ? Number(mailbox.messages_sent_today || 0) : 0;
      const hourCount = mailbox.send_count_hour_key === hour ? Number(mailbox.messages_sent_hour || 0) : 0;
      const caps = getEmailChannelCaps();
      if (hourCount >= caps.hourlySoftCap) throw new Error("Hourly email send limit reached");
      if (dayCount >= caps.dailySoftCap) throw new Error("Daily email send limit reached");
      await tx.execute(sql`UPDATE email_mailboxes SET messages_sent_today=${dayCount + 1},messages_sent_hour=${hourCount + 1},send_count_day_key=${day},send_count_hour_key=${hour} WHERE id=${input.mailbox} AND workspace_user_id=${input.workspace}`);
      // Provider call stays inside the suppression lock, including token refresh
      // completed by caller. No outbound acknowledgement is sent on opt-out.
      const outcome = await send({ ...bodies, unsubscribeUrl, onDispatch: () => { dispatched = true; } });
      if (outcome && typeof outcome === "object" && "success" in outcome && outcome.success === false) {
        rejected = { value: outcome };
        throw definiteRejection;
      }
      return outcome;
    });
  } catch (error) {
    if (error === definiteRejection && rejected) return rejected.value;
    if (dispatched) throw new Error("ambiguous_provider_delivery: reconcile provider delivery before retry");
    throw error;
  }
}
