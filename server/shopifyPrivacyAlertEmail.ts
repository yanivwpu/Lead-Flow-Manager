import { verifyPrivacySmokeDatabase } from "./shopifyPrivacySmokeSafety";
import { timingSafeEqual } from "node:crypto";
import express, { type Express, type ErrorRequestHandler } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { PRIVACY_ACTIONS } from "./shopifyPrivacyVerification";
import { resolveResendFromEmail, sendEmailDetailed, WHACHATCRM_SUPPORT_EMAIL } from "./email";

export const PRIVACY_ALERT_RECEIVER_PATH = "/api/internal/shopify/privacy-alerts";
// Resend's provider deduplication expires after 24h. Leave a margin and fail closed.
export const PRIVACY_EMAIL_RETRY_WINDOW_MS = 23 * 3600000;
const uuid = z.string().uuid();
const snapshotSchema = z.object({
  taskId: uuid,
  stagingTest: z.literal("privacy_smoke_v1").optional(),
  status: z.enum(["pending_external", "retrying", "blocked", "permanent_failure"]),
  reason: z.enum(["configuration", "permanent_failure", "access_request", "approaching_deadline", "overdue"]),
  actionCode: z.enum(["missing_configuration", "invalid_evidence", "unsupported_provider", "provider_permanent", "provider_retry", "approaching_deadline", "overdue", "access_request"]),
  deadlineAt: z.string().datetime(),
  from: z.string().min(1).max(254).refine(value => !/[\r\n]/.test(value)),
}).strict();
export type PrivacyEmailSnapshot = z.infer<typeof snapshotSchema>;
export function renderPrivacyAlertEmail(input: PrivacyEmailSnapshot) {
  const s = snapshotSchema.parse(input);
  const category = s.actionCode === "unsupported_provider" ? "unsupported external provider" : s.reason.replaceAll("_", " ");
  const text = [s.stagingTest ? "STAGING TEST — synthetic operation; no merchant/customer data." : "WhachatCRM Shopify privacy alert", `Operation ID: ${s.taskId}`,
    `Issue category: ${category}`, `Deadline (UTC): ${s.deadlineAt}`, `Status: ${s.status}`,
    `Required action: ${PRIVACY_ACTIONS[s.actionCode]}`, "Review this operation in Admin → Privacy."].join("\n");
  // All variable content is allowlisted identifiers, enums and a normalized timestamp.
  return { to: WHACHATCRM_SUPPORT_EMAIL, from: s.from, subject: s.stagingTest ? "STAGING TEST — Shopify Privacy Alert" : `Shopify privacy alert: ${category}`,
    text, html: `<pre>${text}</pre>`, privacyContext: "shopify" as const };
}
type Dispatch = typeof sendEmailDetailed;
export function privacyAlertEmailEnabled(env = process.env) {
  return env.SHOPIFY_PRIVACY_ALERT_EMAIL_ENABLED === "true" && !!env.RESEND_API_KEY &&
    !!env.SHOPIFY_PRIVACY_ALERT_TOKEN && /^[A-Za-z0-9_-]{32,256}$/.test(env.SHOPIFY_PRIVACY_ALERT_TOKEN);
}

/** The authenticated caller can only request delivery of an existing outbox occurrence.
 * A session lock serializes replicas; intent is committed BEFORE contacting Resend.
 * Even a crash after acceptance reuses the immutable body and provider idempotency key.
 */
export async function acceptPrivacyAlertEmail(pool: Pool, alertId: string, dispatch: Dispatch = sendEmailDetailed): Promise<boolean> {
  const client = await pool.connect();
  let locked = false, destroy = false;
  try {
    locked = (await client.query("SELECT pg_try_advisory_lock(hashtextextended($1, 106)) locked", [alertId])).rows[0].locked;
    if (!locked) return false;
    const a = (await client.query(`SELECT a.*, t.deadline_at AT TIME ZONE 'UTC' deadline_at, t.status current_status,
      a.next_attempt_at<=NOW() due,
      a.email_started_at<=NOW()-($2::bigint * interval '1 millisecond') email_window_expired FROM shopify_privacy_alerts a
      JOIN shopify_privacy_erasure_tasks t ON t.id=a.task_id WHERE a.id=$1`, [alertId, PRIVACY_EMAIL_RETRY_WINDOW_MS])).rows[0];
    if (!a) return false;
    if (a.email_accepted_at && a.provider_message_id) return true;
    const active = (await client.query(`SELECT 1 FROM shopify_privacy_current_issues WHERE task_id=$1 AND reason=$2`, [a.task_id, a.reason])).rowCount;
    if (a.resolved_at || !active || a.email_reconciliation_required || !a.due) return false;
    if (a.email_window_expired) {
      await client.query("UPDATE shopify_privacy_alerts SET email_reconciliation_required=true WHERE id=$1", [alertId]);
      return false;
    }
    const snapshot = snapshotSchema.parse(a.email_payload || { taskId: a.task_id, status: a.current_status,
      reason: a.reason, actionCode: a.action_code, deadlineAt: a.deadline_at.toISOString(), from: resolveResendFromEmail() });
    if (snapshot.stagingTest) await verifyPrivacySmokeDatabase(client);
    // Immutable sender/body and a conservative uncertainty marker survive process death.
    await client.query(`UPDATE shopify_privacy_alerts SET email_payload=$2::jsonb,
      email_started_at=COALESCE(email_started_at,NOW()),email_uncertain=true WHERE id=$1`, [alertId, JSON.stringify(snapshot)]);
    let result: Awaited<ReturnType<Dispatch>>;
    try { result = await dispatch({ ...renderPrivacyAlertEmail(snapshot), idempotencyKey: `shopify-privacy-${alertId}` }); }
    catch { result = { ok: false, providerMessageId: null, error: "email_delivery_failed", acceptanceUnknown: true }; }
    if (result.ok && result.providerMessageId) {
      await client.query(`UPDATE shopify_privacy_alerts SET email_accepted_at=NOW(),provider_message_id=$2,
        email_uncertain=false,delivered_at=NOW() WHERE id=$1`, [alertId, result.providerMessageId]);
      return true;
    }
    // Only a definitive rejection with no earlier ambiguous attempt may reopen the retry window.
    if (result.acceptanceUnknown === false && !a.email_uncertain) {
      await client.query("UPDATE shopify_privacy_alerts SET email_started_at=NULL,email_uncertain=false WHERE id=$1", [alertId]);
    }
    return false;
  } finally {
    if (locked) {
      try { await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 106))", [alertId]); }
      catch { destroy = true; }
    }
    client.release(destroy);
  }
}

export function registerShopifyPrivacyAlertReceiver(app: Express, deliver = async (id: string) =>
  acceptPrivacyAlertEmail((await import("../drizzle/db")).db.$client, id), env = process.env) {
  app.post(PRIVACY_ALERT_RECEIVER_PATH, (req, res, next) => {
    res.set("Cache-Control", "no-store");
    const secret = env.SHOPIFY_PRIVACY_ALERT_TOKEN;
    const actual = req.get("Authorization") || "";
    const expected = `Bearer ${secret || ""}`;
    if (!secret || !/^[A-Za-z0-9_-]{32,256}$/.test(secret) || Buffer.byteLength(actual) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) { res.status(401).json({ error: "unauthorized" }); return; }
    if (!privacyAlertEmailEnabled(env)) { res.status(503).json({ error: "delivery_disabled" }); return; }
    next();
  }, express.json({ limit: "1kb", strict: true }), async (req, res) => {
    const parsed = z.object({ alertId: uuid }).strict().safeParse(req.body);
    if (!parsed.success || req.get("Idempotency-Key") !== `shopify-privacy-${parsed.data.alertId}`) {
      res.status(400).json({ error: "invalid_alert" }); return;
    }
    try {
      if (await deliver(parsed.data.alertId)) res.json({ accepted: true });
      else res.status(503).json({ error: "delivery_pending" });
    } catch { res.status(503).json({ error: "delivery_pending" }); }
  });
  const invalidBody: ErrorRequestHandler = (_error, _req, res, _next) => {
    res.status(400).json({ error: "invalid_alert" });
  };
  app.use(PRIVACY_ALERT_RECEIVER_PATH, invalidBody);
}
