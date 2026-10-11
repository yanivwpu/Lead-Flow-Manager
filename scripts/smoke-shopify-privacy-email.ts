// Deliberately no dotenv/app/worker imports before the environment gate.
import { validatePrivacySmokeTarget, verifyPrivacySmokeDatabase, cleanupPrivacySmokeTask, PRIVACY_SMOKE_TARGET } from "../server/shopifyPrivacySmokeSafety";

async function main() {
let stage = "environment";
let pool: import("pg").Pool | undefined;
let server: import("node:http").Server | undefined;
let taskId: string | undefined;
let cleanupNeeded = false;
let providerCalls = 0;
let providerAccepted = false;
let providerMessageId: string | null = null;
try {
  if (process.argv.slice(2).join(" ") !== "--send-one-synthetic-alert") throw Error("explicit_command_required");
  const connectionString = validatePrivacySmokeTarget();
  if (!process.env.SHOPIFY_PRIVACY_SMOKE_ADMIN_TOKEN) throw Error("staging_admin_token_required");
  const { Pool } = await import("pg");
  pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10000, statement_timeout: 15000 });
  stage = "database_identity";
  const client = await pool.connect();
  try { await verifyPrivacySmokeDatabase(client); } finally { client.release(); }
  const { randomUUID } = await import("node:crypto");
  const { default: express } = await import("express");
  const { registerShopifyPrivacyAlertReceiver, acceptPrivacyAlertEmail, PRIVACY_ALERT_RECEIVER_PATH } =
    await import("../server/shopifyPrivacyAlertEmail");
  const { queuePrivacyExceptionAlerts, deliverPrivacyAlerts } = await import("../server/shopifyExternalErasure");
  const { sendEmailDetailed, resolveResendFromEmail } = await import("../server/email");
  const remote = PRIVACY_SMOKE_TARGET.receiver;
  const adminUrl = new URL("/api/admin/privacy-operations", remote);
  const readAdmin = async () => {
    const response = await fetch(adminUrl, { redirect: "error", signal: AbortSignal.timeout(10000),
      headers: { "x-admin-token": process.env.SHOPIFY_PRIVACY_SMOKE_ADMIN_TOKEN!, "Cache-Control": "no-cache" } });
    if (!response.ok) throw Error("staging_admin_unavailable");
    return response.json();
  };
  stage = "admin_preflight";
  await readAdmin(); // Fail before sending if the actual deployed Admin cannot be checked.
  stage = "unauthorized_receiver";
  const unauth = await fetch(remote, { method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alertId: randomUUID() }) });
  if (unauth.status !== 401) throw Error("unauthorized_request_not_rejected");
  stage = "deployment_email_disabled";
  const disabled = await fetch(remote, { method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.SHOPIFY_PRIVACY_ALERT_TOKEN}`,
      "Idempotency-Key": "shopify-privacy-" + randomUUID() }, body: JSON.stringify({ alertId: randomUUID() }) });
  if (disabled.status !== 503 || (await disabled.json()).error !== "delivery_disabled")
    throw Error("deployment_email_must_remain_disabled");
  taskId = randomUUID();
  stage = "synthetic_queue";
  // Permanent failure is excluded from erasure claims. No selectors, domains, evidence or customer payload.
  cleanupNeeded = true; // Also clean up an insert whose acknowledgement is lost.
  await pool.query(`INSERT INTO shopify_privacy_erasure_tasks
    (id,dedupe_key,status,error_code,deadline_at,next_attempt_at)
    VALUES ($1,$2,'permanent_failure','provider_permanent',NOW()+interval '30 days','infinity')`,
    [taskId, "staging-privacy-smoke:" + taskId]);
  await queuePrivacyExceptionAlerts(taskId, pool);
  const alerts = (await pool.query("SELECT * FROM shopify_privacy_alerts WHERE task_id=$1", [taskId])).rows;
  if (alerts.length !== 1 || alerts[0].reason !== "permanent_failure" || alerts[0].delivered_at)
    throw Error("synthetic_alert_invalid");
  const alertId = alerts[0].id;
  // Freeze the test subject before any worker can dispatch it, including crash/retry.
  await pool.query(`UPDATE shopify_privacy_alerts SET email_payload=$2::jsonb WHERE id=$1 AND task_id=$3`,
    [alertId, JSON.stringify({ taskId, stagingTest: "privacy_smoke_v1", status: "permanent_failure",
      reason: "permanent_failure", actionCode: "provider_permanent",
      deadlineAt: new Date(alerts[0].created_at.getTime() + 30*86400000).toISOString(), from: resolveResendFromEmail() }), taskId]);
  const app = express();
  const receiverEnv = { ...process.env };
  registerShopifyPrivacyAlertReceiver(app, async id => {
    if (id !== alertId) return false;
    return acceptPrivacyAlertEmail(pool!, id, async options => {
      providerCalls++;
      const result = await sendEmailDetailed(options); // Real existing Resend transport; no simulated success.
      if (result.ok && result.providerMessageId) {
        providerAccepted = true; providerMessageId = result.providerMessageId;
      }
      return result;
    });
  }, receiverEnv);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => { server!.once("listening", resolve); server!.once("error", reject); });
  const endpoint = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}${PRIVACY_ALERT_RECEIVER_PATH}`;
  const post = async (key: string, authorized = true) => fetch(endpoint, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
    headers: { "Content-Type": "application/json", "Idempotency-Key": key,
      ...(authorized ? { Authorization: `Bearer ${receiverEnv.SHOPIFY_PRIVACY_ALERT_TOKEN}` } : {}) },
    body: JSON.stringify({ alertId }),
  });
  const key = "shopify-privacy-" + alertId;
  if ((await post(key, false)).status !== 401 || providerCalls !== 0) throw Error("receiver_auth_failed");
  receiverEnv.SHOPIFY_PRIVACY_ALERT_EMAIL_ENABLED = "false";
  if ((await post(key)).status !== 503 || providerCalls !== 0) throw Error("disabled_flag_failed");
  receiverEnv.SHOPIFY_PRIVACY_ALERT_EMAIL_ENABLED = "true";
  const send = async (_payload: unknown, claimedKey: string) => {
    if (claimedKey !== key) throw Error("unexpected_alert_claim");
    const response = await post(claimedKey);
    return response.ok && (await response.json()).accepted === true;
  };
  stage = "worker_resend_acceptance";
  await deliverPrivacyAlerts(send, taskId, pool);
  const row = async () => (await pool!.query("SELECT * FROM shopify_privacy_alerts WHERE id=$1 AND task_id=$2", [alertId, taskId])).rows[0];
  const accepted = await row();
  if (!providerAccepted || !accepted?.email_accepted_at || !accepted.delivered_at ||
      accepted.provider_message_id !== providerMessageId || providerCalls !== 1)
    throw Error("resend_acceptance_unconfirmed");
  stage = "duplicate_prevention";
  await queuePrivacyExceptionAlerts(taskId, pool);
  await deliverPrivacyAlerts(send, taskId, pool);
  // Replay through both receiver and worker after a simulated lost worker acknowledgement.
  if (!(await post(key)).ok) throw Error("accepted_replay_failed");
  await pool.query("UPDATE shopify_privacy_alerts SET delivered_at=NULL,next_attempt_at=NOW() WHERE id=$1 AND task_id=$2", [alertId, taskId]);
  await deliverPrivacyAlerts(send, taskId, pool);
  const replay = await row();
  if (providerCalls !== 1 || !replay.delivered_at || replay.provider_message_id !== providerMessageId ||
      (await pool.query("SELECT count(*)::int n FROM shopify_privacy_alerts WHERE task_id=$1", [taskId])).rows[0].n !== 1)
    throw Error("duplicate_prevention_failed");
  stage = "deployed_admin_privacy";
  const admin = await readAdmin();
  if (!admin.alerts?.some((a: any) => a.id === alertId && a.taskId === taskId &&
      a.status === "permanent_failure" && a.emailStatus === "accepted")) throw Error("admin_alert_missing_or_wrong_status");
  console.log(JSON.stringify({ stage: "verified", taskId, alertId, providerMessageId,
    resendAccepted: true, providerCalls, adminStatus: "accepted", inboxReceiptVerified: false }));
} catch {
  // Never print driver exceptions, provider bodies, URLs, secrets or stack traces.
  console.error(JSON.stringify({ stage, result: "failed", taskId, resendAccepted: providerAccepted,
    providerMessageId, providerCalls, inboxReceiptVerified: false }));
  process.exitCode = 1;
} finally {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  if (pool && cleanupNeeded && taskId) {
    try {
      // Ownership requires BOTH random ID and marker. No historical verification or other jobs are touched.
      await cleanupPrivacySmokeTask(pool, taskId);
      console.log(JSON.stringify({ stage: "cleanup", result: "test_records_removed", taskId }));
    } catch {
      console.error(JSON.stringify({ stage: "cleanup", result: "failed", taskId }));
      process.exitCode = 1;
    }
  }
  await pool?.end();
}

}
void main().catch(() => { console.error(JSON.stringify({ stage: "shutdown", result: "failed" })); process.exitCode = 1; });
