import type { Pool, PoolClient } from "pg";

// Control-plane inventory verified for this dedicated staging project. No name heuristics.
export const PRIVACY_SMOKE_TARGET = Object.freeze({
  project: "1d22ff35-a259-4977-9375-377dda1cdd2b",
  environment: "43e4c163-6da9-4be5-ad93-0a3534234613",
  service: "7663b193-b936-41cd-a810-a4940d9912fc",
  databaseService: "88d5aec0-1cf7-4fe1-9084-5745a97736bd",
  databaseServiceName: "Postgres-JSIn",
  databaseReference: "${{Postgres-JSIn.DATABASE_URL}}",
  host: "postgres.railway.internal",
  receiver: "https://whachatcrm-staging-app-staging.up.railway.app/api/internal/shopify/privacy-alerts",
});

export function validatePrivacySmokeTarget(env = process.env) {
  if (env.SHOPIFY_PRIVACY_SMOKE_TEST !== "1") throw Error("explicit_invocation_required");
  if (env.RAILWAY_PROJECT_ID !== PRIVACY_SMOKE_TARGET.project ||
      env.RAILWAY_ENVIRONMENT_ID !== PRIVACY_SMOKE_TARGET.environment ||
      env.RAILWAY_SERVICE_ID !== PRIVACY_SMOKE_TARGET.service ||
      env.RAILWAY_ENVIRONMENT_NAME !== "staging") throw Error("railway_identity_rejected");
  let url: URL;
  try { url = new URL(env.DATABASE_URL!); } catch { throw Error("database_target_rejected"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      url.hostname !== PRIVACY_SMOKE_TARGET.host || url.pathname !== "/railway" ||
      (url.port && url.port !== "5432") || url.search || url.hash ||
      !url.username || !url.password) throw Error("database_target_rejected");
  // Independently obtained via SSH to databaseService, never inferred from DATABASE_URL.
  if (!/^[1-9][0-9]{15,19}$/.test(env.SHOPIFY_PRIVACY_SMOKE_DATABASE_SYSTEM_ID || ""))
    throw Error("independent_database_identity_required");
  if (env.SHOPIFY_PRIVACY_ALERT_URL !== PRIVACY_SMOKE_TARGET.receiver)
    throw Error("receiver_target_rejected");
  if (env.SHOPIFY_PRIVACY_ALERT_EMAIL_ENABLED !== "true")
    throw Error("email_flag_disabled");
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL ||
      !/^[A-Za-z0-9_-]{32,256}$/.test(env.SHOPIFY_PRIVACY_ALERT_TOKEN || ""))
    throw Error("email_configuration_incomplete");
  if (!/^(?:(?:WhachatCRM|WhaChatCRM) <noreply@crm\.whachatcrm\.com>|noreply@crm\.whachatcrm\.com)$/.test(env.RESEND_FROM_EMAIL))
    throw Error("smoke_sender_not_allowlisted");
  return url.toString();
}

export async function cleanupPrivacySmokeTask(pool: Pool, taskId: string) {
  if (!/^[a-f0-9-]{36}$/.test(taskId)) throw Error("cleanup_id_rejected");
  await pool.query("DELETE FROM shopify_privacy_erasure_tasks WHERE id=$1 AND dedupe_key=$2 AND status='permanent_failure'",
    [taskId, "staging-privacy-smoke:" + taskId]);
  if ((await pool.query("SELECT 1 FROM shopify_privacy_erasure_tasks WHERE id=$1", [taskId])).rowCount)
    throw Error("cleanup_incomplete");
}

/** Read-only verification on the very connection used for test writes. */
export async function verifyPrivacySmokeDatabase(client: PoolClient, env = process.env) {
  validatePrivacySmokeTarget(env);
  const context = (await client.query(`SELECT current_database() database, current_schema() schema,
    inet_server_addr()::text address, system_identifier::text system_id FROM pg_control_system()`)).rows[0];
  if (context?.database !== "railway" || context.schema !== "public" || !context.address ||
      /^(127\.|::ffff:127\.|::1$|0\.0\.0\.0$|::$)/i.test(context.address) ||
      context.system_id !== env.SHOPIFY_PRIVACY_SMOKE_DATABASE_SYSTEM_ID)
    throw Error("database_identity_rejected");
  const marker = (await client.query("SELECT version, baseline_sha256 FROM public.whachat_staging_schema_bootstrap")).rows;
  if (marker.length !== 1 || marker[0].version !== 1 || !/^[a-f0-9]{64}$/.test(marker[0].baseline_sha256))
    throw Error("staging_bootstrap_marker_rejected");
  const ready = (await client.query(`SELECT to_regclass('public.shopify_privacy_current_issues') IS NOT NULL ready,
    count(*) FILTER (WHERE column_name IN ('email_payload','provider_message_id','email_accepted_at','email_uncertain','email_reconciliation_required'))::int columns
    FROM information_schema.columns WHERE table_schema='public' AND table_name='shopify_privacy_alerts'`)).rows[0];
  if (!ready?.ready || ready.columns !== 5) throw Error("privacy_schema_not_ready");
}
