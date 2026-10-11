import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { db } from "../drizzle/db";
import { configuredPrivacyAdapter } from "./shopifyPrivacyAdapters";
import { REQUIRED_PRIVACY_CHECKS, PRIVACY_ACTIONS, privacyRetryDelay, type PrivacyTask, type PrivacyAdapter, type CheckResult } from "./shopifyPrivacyVerification";

const pool = db.$client;
const LEASE_MS = 300000;
const MAX_RETRIES = 8;
export async function claimPrivacyTask() {
  const token = randomUUID();
  const result = await pool.query(`WITH due AS (
    SELECT id FROM shopify_privacy_erasure_tasks
    WHERE completed_at IS NULL AND request_kind <> 'access_request'
      AND status <> 'permanent_failure' AND next_attempt_at <= NOW()
      AND (lease_expires_at IS NULL OR lease_expires_at <= NOW())
    ORDER BY deadline_at, requested_at, id FOR UPDATE SKIP LOCKED LIMIT 1
  ) UPDATE shopify_privacy_erasure_tasks t SET lease_token=$1, lease_expires_at=NOW()+interval '5 minutes'
    FROM due WHERE t.id=due.id RETURNING t.*`, [token]);
  return result.rows[0] ? { ...result.rows[0], token } as PrivacyTask & { token: string; attempts: number } : null;
}
export async function renewPrivacyLease(id: string, token: string) {
  return (await pool.query(`UPDATE shopify_privacy_erasure_tasks SET lease_expires_at=NOW()+interval '5 minutes'
    WHERE id=$1 AND lease_token=$2 AND lease_expires_at>NOW() AND completed_at IS NULL`, [id, token])).rowCount === 1;
}
export async function savePrivacyCheck(id: string, token: string, check: string, evidence: unknown) {
  return (await pool.query(`UPDATE shopify_privacy_erasure_tasks SET checks=checks || jsonb_build_object($3::text,$4::jsonb)
    WHERE id=$1 AND lease_token=$2 AND lease_expires_at>NOW() AND completed_at IS NULL`, [id, token, check, JSON.stringify(evidence)])).rowCount === 1;
}
function validVerification(result: CheckResult): boolean {
  return result.verified === true && ["deletion", "retention", "not_applicable"].includes(result.evidence?.method) &&
    /^[a-f0-9]{64}$/.test(result.evidence?.evidenceDigest) && Number.isFinite(Date.parse(result.evidence?.verifiedAt)) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result.evidence.verifiedAt) && Date.parse(result.evidence.verifiedAt) <= Date.now();
}
/** Injectable adapters use the same evidence contract as production; a bare verified=true is never completion. */
export async function processShopifyExternalErasureTasks(adapter: PrivacyAdapter = configuredPrivacyAdapter(), limit = 20): Promise<{ pending: number; completed: number }> {
  let completed = 0;
  for (let i = 0; i < Math.min(20, Math.max(1, limit)); i++) {
    const task = await claimPrivacyTask();
    if (!task) break;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    const heartbeat = setInterval(() => {
      renewPrivacyLease(task.id, task.token).then(ok => { if (!ok) controller.abort(); }).catch(() => controller.abort());
    }, LEASE_MS / 10);
    let failures: Extract<CheckResult, { verified: false }>[] = [];
    try {
      // Mandatory checks cannot be removed by changed configuration or an incomplete task manifest.
      const required = [...new Set([...REQUIRED_PRIVACY_CHECKS, ...(Array.isArray(task.required_checks) ? task.required_checks : [])])];
      for (const check of required) {
        if (controller.signal.aborted) break;
        const existing = task.checks?.[check];
        if (existing && validVerification({ verified: true, evidence: existing })) continue;
        let result: CheckResult;
        try {
          // Enforce the timeout even if a broken adapter ignores cancellation; stale workers cannot persist.
          result = await Promise.race([adapter(task, check, controller.signal), new Promise<CheckResult>(resolve => {
            if (controller.signal.aborted) resolve({ verified: false, code: "provider_retry" });
            else controller.signal.addEventListener("abort", () => resolve({ verified: false, code: "provider_retry" }), { once: true });
          })]);
        } catch { result = { verified: false, code: "provider_retry" }; }
        if (result.verified && validVerification(result)) {
          const evidence = { method: result.evidence.method, evidenceDigest: result.evidence.evidenceDigest, verifiedAt: result.evidence.verifiedAt };
          if (!await savePrivacyCheck(task.id, task.token, check, evidence)) { controller.abort(); break; }
          task.checks = { ...task.checks, [check]: evidence };
        } else {
          const allowed = ["missing_configuration", "invalid_evidence", "retention_wait", "provider_retry", "provider_permanent", "unsupported_provider"];
          failures.push(result.verified || !allowed.includes(result.code) ? { verified: false, code: "invalid_evidence" } : result);
        }
      }
      const allVerified = required.every(check => task.checks?.[check] && validVerification({ verified: true, evidence: task.checks[check] }));
      const retry = failures.some(f => f.code === "provider_retry") || controller.signal.aborted;
      const attempts = task.attempts + (retry ? 1 : 0);
      const permanent = failures.some(f => f.code === "provider_permanent") || retry && attempts >= MAX_RETRIES;
      const blocked = failures.find(f => !["provider_retry", "retention_wait"].includes(f.code));
      const status = allVerified ? "verified_complete" : permanent ? "permanent_failure" : blocked ? "blocked" : retry ? "retrying" : "pending_external";
      const code = permanent ? failures.find(f => f.code === "provider_permanent")?.code || "provider_retry" : blocked?.code || (retry ? "provider_retry" : null);
      const retentionAt = failures.filter(f => f.retryAt).map(f => f.retryAt!.getTime());
      const next = new Date(Date.now() + (retry ? privacyRetryDelay(attempts) : blocked ? 3600000 : Math.min(86400000, retentionAt.length ? Math.max(60000, Math.min(...retentionAt) - Date.now()) : 3600000)));
      const finished = await pool.query(`UPDATE shopify_privacy_erasure_tasks SET status=$3,error_code=$4,attempts=$5,
        next_attempt_at=$6,completed_at=CASE WHEN $3='verified_complete' THEN NOW() ELSE NULL END,
        lease_token=NULL,lease_expires_at=NULL WHERE id=$1 AND lease_token=$2 AND lease_expires_at>NOW()`,
        [task.id, task.token, status, code, attempts, next]);
      if (finished.rowCount && allVerified) completed++;
    } finally { clearTimeout(timeout); clearInterval(heartbeat); }
  }
  const remaining = await pool.query("SELECT count(*)::int n FROM shopify_privacy_erasure_tasks WHERE completed_at IS NULL");
  return { pending: remaining.rows[0].n, completed };
}

export async function queuePrivacyExceptionAlerts(taskId?: string, targetPool: Pool = pool) {
  const client = await targetPool.connect();
  try {
    await client.query("BEGIN");
    // Serialize occurrence reconciliation across worker replicas.
    await client.query("SELECT pg_advisory_xact_lock(1060106)");
    await client.query(`UPDATE shopify_privacy_alerts a SET resolved_at=NOW()
      WHERE ($1::text IS NULL OR a.task_id=$1) AND resolved_at IS NULL AND NOT EXISTS (SELECT 1 FROM shopify_privacy_current_issues i
        WHERE i.task_id=a.task_id AND i.reason=a.reason)`, [taskId ?? null]);
    await client.query(`INSERT INTO shopify_privacy_alerts(task_id,reason,status,action_code)
      SELECT task_id,reason,status,CASE WHEN action_code IN ('missing_configuration','invalid_evidence',
        'unsupported_provider','provider_permanent','provider_retry','approaching_deadline','overdue','access_request')
        THEN action_code ELSE 'unsupported_provider' END FROM shopify_privacy_current_issues WHERE ($1::text IS NULL OR task_id=$1)
      ON CONFLICT(task_id,reason) WHERE resolved_at IS NULL DO NOTHING`, [taskId ?? null]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
export type PrivacyAlertPayload = { event: "privacy_intervention_required"; taskId: string; status: string; reason: string; actionRequired: string; deadlineAt: string };
export async function deliverPrivacyAlerts(send?: (payload: PrivacyAlertPayload, key: string) => Promise<boolean>, taskId?: string, targetPool: Pool = pool) {
  if (!send) return; // Durable Admin alert remains available when outbound delivery is unconfigured.
  for (let i = 0; i < 20; i++) {
    const token = randomUUID();
    const claim = await targetPool.query(`WITH due AS (
      SELECT a.id FROM shopify_privacy_alerts a JOIN shopify_privacy_erasure_tasks t ON t.id=a.task_id
      WHERE ($2::text IS NULL OR a.task_id=$2) AND a.delivered_at IS NULL AND a.resolved_at IS NULL AND NOT a.email_reconciliation_required
        AND t.completed_at IS NULL AND a.next_attempt_at<=NOW()
        AND EXISTS (SELECT 1 FROM shopify_privacy_current_issues i WHERE i.task_id=a.task_id AND i.reason=a.reason)
        AND (a.lease_expires_at IS NULL OR a.lease_expires_at<=NOW())
      ORDER BY a.created_at FOR UPDATE OF a SKIP LOCKED LIMIT 1
    ) UPDATE shopify_privacy_alerts a SET lease_token=$1,lease_expires_at=NOW()+interval '1 minute'
      FROM due WHERE a.id=due.id RETURNING a.*`, [token, taskId ?? null]);
    const alert = claim.rows[0]; if (!alert) break;
    const current = (await targetPool.query("SELECT status,deadline_at,completed_at FROM shopify_privacy_erasure_tasks WHERE id=$1", [alert.task_id])).rows[0];
    let ok = false;
    if (!current.completed_at) {
      try { ok = await send({ event: "privacy_intervention_required", taskId: alert.task_id, status: current.status,
        reason: alert.reason, actionRequired: PRIVACY_ACTIONS[alert.action_code] || PRIVACY_ACTIONS.unsupported_provider,
        deadlineAt: current.deadline_at.toISOString() }, `shopify-privacy-${alert.id}`); } catch { /* bounded, no provider response in logs */ }
    }
    await targetPool.query(`UPDATE shopify_privacy_alerts SET delivered_at=CASE WHEN $3 THEN NOW() ELSE delivered_at END,
      attempts=attempts+1,next_attempt_at=NOW()+($4::bigint * interval '1 millisecond'),lease_token=NULL,lease_expires_at=NULL
      WHERE id=$1 AND lease_token=$2 AND lease_expires_at>NOW()`, [alert.id, token, ok, Math.min(3600000,privacyRetryDelay(alert.attempts+1))]);
  }
}
export function configuredPrivacyAlertSender(env = process.env) {
  const endpoint = env.SHOPIFY_PRIVACY_ALERT_URL;
  const token = env.SHOPIFY_PRIVACY_ALERT_TOKEN;
  if (env.SHOPIFY_PRIVACY_ALERT_EMAIL_ENABLED !== "true" || !endpoint || !token || !/^[A-Za-z0-9_-]{32,256}$/.test(token)) return undefined;
  try { const url = new URL(endpoint); if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/api/internal/shopify/privacy-alerts") return undefined; }
  catch { return undefined; }
  return async (payload: PrivacyAlertPayload, key: string) => {
    const response = await fetch(endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify({ alertId: key.replace(/^shopify-privacy-/, "") }) });
    // Receiver must persist the idempotency key; a delivery timeout can occur after receipt.
    if (!response.ok) return false;
    try { return (await response.json()).accepted === true; } catch { return false; }
  };
}
let tickRunning = false;
export async function runShopifyPrivacyTick() {
  if (tickRunning) return { ok: true, skipped: true };
  tickRunning = true;
  try {
    if ((await pool.query("SELECT to_regclass('shopify_privacy_current_issues') IS NOT NULL ready")).rows[0].ready !== true) return { ok: false, skipped: true };
    await queuePrivacyExceptionAlerts();
    await deliverPrivacyAlerts(configuredPrivacyAlertSender());
    await processShopifyExternalErasureTasks(configuredPrivacyAdapter(), 5);
    await queuePrivacyExceptionAlerts();
    await deliverPrivacyAlerts(configuredPrivacyAlertSender());
    return { ok: true, skipped: false };
  } catch { console.error("[ShopifyPrivacy] worker_tick_failed"); return { ok: false, skipped: false }; }
  finally { tickRunning = false; }
}
export async function readPrivacyOperationsStatus() {
  const counts = await pool.query(`SELECT
    count(*) FILTER(WHERE completed_at IS NULL AND deadline_at>NOW() AND status='pending_external')::int pending,
    count(*) FILTER(WHERE completed_at IS NULL AND deadline_at>NOW() AND status='retrying')::int retrying,
    count(*) FILTER(WHERE completed_at IS NULL AND deadline_at>NOW() AND (status IN ('blocked','permanent_failure') OR request_kind='access_request'))::int blocked,
    count(*) FILTER(WHERE completed_at IS NULL AND deadline_at<=NOW())::int overdue,
    count(*) FILTER(WHERE status='verified_complete' AND completed_at IS NOT NULL)::int verified_complete
    FROM shopify_privacy_erasure_tasks`);
  const alerts = await pool.query(`SELECT a.id,a.task_id,a.reason,a.action_code,t.status,t.deadline_at,a.delivered_at,a.email_reconciliation_required
    FROM shopify_privacy_alerts a JOIN shopify_privacy_erasure_tasks t ON t.id=a.task_id
    WHERE t.completed_at IS NULL AND a.resolved_at IS NULL ORDER BY t.deadline_at,a.created_at LIMIT 50`);
  return { counts: counts.rows[0], outboundAlertsConfigured: !!configuredPrivacyAlertSender(), alerts: alerts.rows.map(a => ({
    id: a.id, taskId: a.task_id, reason: a.reason, status: a.status,
    emailStatus: a.email_reconciliation_required ? "reconciliation_required" : a.delivered_at ? "accepted" : "pending", deadlineAt: a.deadline_at.toISOString(),
    actionRequired: PRIVACY_ACTIONS[a.action_code] || PRIVACY_ACTIONS.unsupported_provider,
  })) };
}
