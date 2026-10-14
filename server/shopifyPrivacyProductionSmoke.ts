import type { Pool } from "pg";

// One logical authorization, never derived from deployment IDs or configurable retry keys.
export const PRODUCTION_SMOKE_ID = "8b0b231e-a197-4bda-982a-397ec42b2b0c";
export const PRODUCTION_SMOKE_KEY = "production-privacy-email-once-v1";
export const PRODUCTION_SMOKE_AUTH = "SEND ONE PRODUCTION PRIVACY TEST EMAIL TO support@whachatcrm.com";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function productionSmokeConfig(env = process.env, now = Date.now()) {
  for (const [actual, expected] of [["RAILWAY_PROJECT_ID", "PRIVACY_SMOKE_PROJECT_ID"],
    ["RAILWAY_ENVIRONMENT_ID", "PRIVACY_SMOKE_ENVIRONMENT_ID"], ["RAILWAY_SERVICE_ID", "PRIVACY_SMOKE_RUNNER_ID"]]) {
    if (!uuid.test(env[expected] || "") || env[actual] !== env[expected]) throw Error("runner_identity_rejected");
  }
  if (!uuid.test(env.PRIVACY_SMOKE_APP_ID || "") || !uuid.test(env.PRIVACY_SMOKE_DATABASE_SERVICE_ID || "") ||
      new Set([env.PRIVACY_SMOKE_RUNNER_ID, env.PRIVACY_SMOKE_APP_ID, env.PRIVACY_SMOKE_DATABASE_SERVICE_ID]).size !== 3 ||
      env.RAILWAY_SERVICE_NAME !== "production-privacy-email-once" || env.RAILWAY_ENVIRONMENT_NAME !== "production")
    throw Error("runner_isolation_rejected");
  const expires = Date.parse(env.PRIVACY_SMOKE_EXPIRES_AT || "");
  if (env.PRIVACY_SMOKE_AUTHORIZE !== PRODUCTION_SMOKE_AUTH || !Number.isFinite(expires) || expires <= now || expires > now + 3600000)
    throw Error("authorization_rejected");
  if (env.SHOPIFY_PRIVACY_ALERT_EMAIL_ENABLED !== "false" || env.SHOPIFY_PRIVACY_S3_DELETE_ENABLED !== "0" ||
      ["DATABASE_URL", "SESSION_SECRET", "SHOPIFY_API_SECRET", "SHOPIFY_PRIVACY_REQUEST_KEY", "SHOPIFY_PRIVACY_EVIDENCE_KEY",
        "SHOPIFY_PRIVACY_EVIDENCE_JSON", "SHOPIFY_PRIVACY_S3_ACCESS_KEY_ID", "SHOPIFY_PRIVACY_S3_SECRET_ACCESS_KEY",
        "SHOPIFY_PRIVACY_S3_SESSION_TOKEN"].some(key => !!env[key])) throw Error("unsafe_runner_configuration");
  if (!env.RESEND_API_KEY || !env.PRIVACY_SMOKE_RESEND_VERIFY_KEY || !uuid.test(env.PRIVACY_SMOKE_RESEND_DOMAIN_ID || "") ||
      env.PRIVACY_SMOKE_SENDER_APPROVAL !== "VERIFIED SENDING KEY AUTHORIZED FOR noreply@crm.whachatcrm.com" ||
      !/^(?:WhachatCRM <noreply@crm\.whachatcrm\.com>|noreply@crm\.whachatcrm\.com)$/.test(env.RESEND_FROM_EMAIL || "") ||
      !/^[A-Za-z0-9_-]{32,256}$/.test(env.SHOPIFY_PRIVACY_ALERT_TOKEN || "")) throw Error("sender_or_token_unverified");
  const receiver = new URL(env.PRIVACY_SMOKE_RECEIVER_URL || "");
  const origin = new URL(env.PRIVACY_SMOKE_APPROVED_APP_ORIGIN || "");
  if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password ||
      receiver.origin !== origin.origin || receiver.protocol !== "https:" || receiver.username || receiver.password ||
      receiver.pathname !== "/api/internal/shopify/privacy-alerts" || receiver.search || receiver.hash)
    throw Error("receiver_target_rejected");
  const database = new URL(env.PRIVACY_SMOKE_DATABASE_URL || "");
  if (!["postgres:", "postgresql:"].includes(database.protocol) || !env.PRIVACY_SMOKE_DATABASE_HOST ||
      database.hostname !== env.PRIVACY_SMOKE_DATABASE_HOST || database.pathname !== "/railway" ||
      database.search || database.hash || (database.port && database.port !== "5432") || !database.username || !database.password ||
      !/^\d+$/.test(env.PRIVACY_SMOKE_DATABASE_SYSTEM_ID || "")) throw Error("database_target_rejected");
  return { receiver: receiver.href, expires, connectionString: database.href };
}

export async function verifyProductionSmokeDatabase(pool: Pool, env = process.env) {
  const row = (await pool.query(`SELECT current_database() database, current_schema() schema,
    system_identifier::text system_id FROM pg_control_system()`)).rows[0];
  if (row?.database !== "railway" || row.schema !== "public" || row.system_id !== env.PRIVACY_SMOKE_DATABASE_SYSTEM_ID)
    throw Error("database_identity_rejected");
  const privilege = (await pool.query(`SELECT r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls
      OR has_database_privilege(current_database(),'CREATE') OR has_schema_privilege('public','CREATE')
      OR has_table_privilege('public.shopify_privacy_erasure_tasks','DELETE')
      OR has_table_privilege('public.shopify_privacy_erasure_tasks','TRUNCATE')
      OR has_column_privilege('public.shopify_privacy_erasure_tasks','status','UPDATE') unsafe
    FROM pg_roles r WHERE rolname=current_user`)).rows[0];
  if (!privilege || privilege.unsafe) throw Error("restricted_runner_role_required");
  // No application/customer reads and no DDL. Existing unique constraints must be valid.
  const ready = (await pool.query(`SELECT EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=i.indkey[0]
    WHERE i.indrelid='public.shopify_privacy_erasure_tasks'::regclass AND i.indisprimary AND i.indisvalid
      AND i.indnkeyatts=1 AND a.attname='id') ready`)).rows[0];
  if (!ready?.ready) throw Error("durable_guard_unavailable");
}

export async function verifyProductionSmokeReceiver(receiver: string, token: string, request = fetch) {
  const post = (authorization?: string) => request(receiver, { method: "POST", redirect: "error",
    signal: AbortSignal.timeout(10000), headers: { "Content-Type": "application/json",
      "Idempotency-Key": `shopify-privacy-${PRODUCTION_SMOKE_ID}`, ...(authorization ? { Authorization: authorization } : {}) },
    body: JSON.stringify({ alertId: PRODUCTION_SMOKE_ID }) });
  for (const auth of [undefined, "Bearer invalid-test-token"]) {
    if ((await post(auth)).status !== 401) throw Error("receiver_authentication_failed");
  }
  const authenticated = await post(`Bearer ${token}`);
  if (authenticated.status !== 503 || (await authenticated.json()).error !== "delivery_disabled")
    throw Error("production_email_must_remain_disabled");
}

export async function verifyProductionSmokeSender(env = process.env, request = fetch) {
  const response = await request(`https://api.resend.com/domains/${env.PRIVACY_SMOKE_RESEND_DOMAIN_ID}`, {
    redirect: "error", signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${env.PRIVACY_SMOKE_RESEND_VERIFY_KEY}` } });
  if (!response.ok) throw Error("sender_verification_unavailable");
  const domain = await response.json();
  if (domain.id !== env.PRIVACY_SMOKE_RESEND_DOMAIN_ID || domain.name !== "crm.whachatcrm.com" ||
      domain.status !== "verified" || domain.capabilities?.sending !== "enabled") throw Error("sender_domain_unverified");
}

/** An acknowledged autocommit insert burns the authorization before any provider call.
 * If the commit acknowledgement is lost, the caller must stop. A restart cannot resend.
 * Keep this completed synthetic tombstone indefinitely; no actual privacy request is queued.
 */
export async function consumeProductionSmoke(pool: Pool, expires: number) {
  const result = await pool.query(`INSERT INTO public.shopify_privacy_erasure_tasks
    (id,dedupe_key,request_kind,status,completed_at,deadline_at,next_attempt_at,required_checks,checks)
    SELECT $1,$2,'privacy_email_smoke','smoke_consumed',NOW(),NOW(),'infinity','[]'::jsonb,
      '{"privacyEmailSmoke":{"result":"consumed"}}'::jsonb
    WHERE NOW() < $3::timestamptz ON CONFLICT DO NOTHING RETURNING id`,
    [PRODUCTION_SMOKE_ID, PRODUCTION_SMOKE_KEY, new Date(expires).toISOString()]);
  if (result.rowCount !== 1) throw Error("authorization_consumed_or_expired");
}

export async function recordProductionSmoke(pool: Pool, accepted: boolean, messageId: string | null) {
  if (accepted !== !!messageId || (messageId && !uuid.test(messageId))) throw Error("invalid_receipt");
  const result = await pool.query(`UPDATE public.shopify_privacy_erasure_tasks SET checks=$3::jsonb
    WHERE id=$1 AND dedupe_key=$2 AND request_kind='privacy_email_smoke'
      AND status='smoke_consumed' AND completed_at IS NOT NULL RETURNING id`,
    [PRODUCTION_SMOKE_ID, PRODUCTION_SMOKE_KEY, JSON.stringify({ privacyEmailSmoke: {
      result: accepted ? "accepted" : "acceptance_unconfirmed", providerMessageId: messageId } })]);
  if (result.rowCount !== 1) throw Error("receipt_not_recorded");
}

/** The persistent insert and local burn both precede the only allowed provider invocation. */
export function productionSmokeDelivery(pool: Pool, expires: number, send: () => Promise<boolean>) {
  let attempted = false, consumed = false, accepted = false;
  return {
    get consumed() { return consumed; },
    async deliver(id: string) {
      if (id !== PRODUCTION_SMOKE_ID) return false;
      if (attempted) return accepted;
      attempted = true;
      await consumeProductionSmoke(pool, expires);
      consumed = true;
      if (Date.now() >= expires) throw Error("authorization_expired");
      accepted = await send();
      return accepted;
    },
  };
}
