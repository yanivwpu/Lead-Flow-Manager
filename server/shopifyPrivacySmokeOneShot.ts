import { createHmac } from "node:crypto";
import type { Pool } from "pg";
import { isPrivacySmokeRunner, validatePrivacySmokeTarget } from "./shopifyPrivacySmokeSafety";

// Fixed logical job identity, independent of deployment IDs and rotating authorization variables.
// Keep its consumed tombstone even after removing all synthetic outbox records.
export const PRIVACY_SMOKE_JOB = "railway-privacy-email-ec2969-v1";
export const PRIVACY_SMOKE_AUTHORIZATION = "SEND ONE STAGING PRIVACY EMAIL TO support@whachatcrm.com";

export function authorizePrivacySmokeOneShot(env = process.env, now = Date.now()) {
  if (!isPrivacySmokeRunner(env)) throw Error("isolated_runner_identity_required");
  if (env.SHOPIFY_PRIVACY_SMOKE_AUTHORIZE !== PRIVACY_SMOKE_AUTHORIZATION)
    throw Error("one_time_authorization_required");
  const expires = Date.parse(env.SHOPIFY_PRIVACY_SMOKE_AUTHORIZATION_EXPIRES_AT || "");
  if (!Number.isFinite(expires) || expires <= now || expires > now + 3600000)
    throw Error("authorization_expired_or_too_long");
  if (env.SHOPIFY_PRIVACY_ALERT_EMAIL_ENABLED !== "false") throw Error("persistent_email_flag_must_be_false");
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32 ||
      env.SESSION_SECRET === "whatsapp-crm-secret-key-change-in-production") throw Error("staging_session_secret_required");
  if (env.SHOPIFY_PRIVACY_S3_DELETE_ENABLED !== "0" || env.SHOPIFY_PRIVACY_EVIDENCE_JSON ||
      env.SHOPIFY_PRIVACY_EVIDENCE_KEY || env.SHOPIFY_PRIVACY_S3_ACCESS_KEY_ID ||
      env.SHOPIFY_PRIVACY_S3_SECRET_ACCESS_KEY || env.SHOPIFY_PRIVACY_S3_SESSION_TOKEN)
    throw Error("destructive_adapters_must_be_disabled");
  // Validate everything before enabling the process-local receiver. Never mutate Railway variables.
  const connectionString = validatePrivacySmokeTarget({ ...env, SHOPIFY_PRIVACY_ALERT_EMAIL_ENABLED: "true" });
  return { connectionString, expires };
}

/** Call ONLY after verifyPrivacySmokeDatabase on this pool. Atomic consumption survives any crash. */
export async function consumePrivacySmokeOneShot(pool: Pool, taskId: string, expires: number) {
  await pool.query(`CREATE TABLE IF NOT EXISTS public.shopify_privacy_smoke_jobs (
    job_key text PRIMARY KEY, task_id uuid NOT NULL, consumed_at timestamptz NOT NULL DEFAULT NOW(),
    result text NOT NULL DEFAULT 'consumed', provider_message_id text
  )`);
  const result = await pool.query(`INSERT INTO public.shopify_privacy_smoke_jobs (job_key,task_id)
    SELECT $1,$2 WHERE NOW() < $3::timestamptz ON CONFLICT (job_key) DO NOTHING RETURNING job_key`,
    [PRIVACY_SMOKE_JOB, taskId, new Date(expires).toISOString()]);
  if (result.rowCount !== 1) throw Error("job_consumed_or_authorization_expired");
}

export async function recordPrivacySmokeOneShot(pool: Pool, taskId: string, result: string, providerMessageId: string | null) {
  await pool.query(`UPDATE public.shopify_privacy_smoke_jobs SET result=$3,provider_message_id=$4
    WHERE job_key=$1 AND task_id=$2`, [PRIVACY_SMOKE_JOB, taskId, result, providerMessageId]);
}

/** Existing Admin token algorithm, scoped to a verified staging DB; never log or persist the token. */
export async function privacySmokeAdminToken(pool: Pool, secret: string) {
  const rows = (await pool.query("SELECT password_hash FROM public.admin_settings WHERE id='admin'")).rows;
  if (rows.length !== 1 || typeof rows[0].password_hash !== "string" || !rows[0].password_hash)
    throw Error("staging_admin_not_initialized");
  return createHmac("sha256", secret).update(rows[0].password_hash).digest("hex");
}

/** One provider invocation per job even on rejection, uncertainty, or accidental internal retry. */
export function oneShotDispatch<T extends (...args: any[]) => Promise<any>>(dispatch: T, expires: number) {
  let attempted = false;
  return async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
    if (attempted || Date.now() >= expires) throw Error("one_shot_send_refused");
    attempted = true; // burn before crossing the provider boundary
    return dispatch(...args);
  };
}
