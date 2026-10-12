import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import { authorizePrivacySmokeOneShot, consumePrivacySmokeOneShot, recordPrivacySmokeOneShot,
  privacySmokeAdminToken, oneShotDispatch, PRIVACY_SMOKE_AUTHORIZATION, PRIVACY_SMOKE_JOB } from "../server/shopifyPrivacySmokeOneShot";
import { PRIVACY_SMOKE_TARGET as T, validatePrivacySmokeTarget } from "../server/shopifyPrivacySmokeSafety";

const runner = "eacde122-6779-45c8-8a88-1e3518c2a473";
const env = {
  SHOPIFY_PRIVACY_SMOKE_MODE: "railway-one-shot-v1", SHOPIFY_PRIVACY_SMOKE_TEST: "1",
  SHOPIFY_PRIVACY_SMOKE_RUNNER_SERVICE_ID: runner, RAILWAY_SERVICE_ID: runner,
  RAILWAY_SERVICE_NAME: "staging-privacy-email-once", RAILWAY_PROJECT_ID: T.project,
  RAILWAY_ENVIRONMENT_ID: T.environment, RAILWAY_ENVIRONMENT_NAME: "staging",
  DATABASE_URL: "postgresql://fixture:fixture@postgres.railway.internal:5432/railway",
  SHOPIFY_PRIVACY_SMOKE_DATABASE_SYSTEM_ID: T.databaseSystemId,
  SHOPIFY_PRIVACY_ALERT_URL: T.receiver, SHOPIFY_PRIVACY_ALERT_EMAIL_ENABLED: "false",
  RESEND_API_KEY: "fixture", RESEND_FROM_EMAIL: "WhachatCRM <noreply@crm.whachatcrm.com>",
  SHOPIFY_PRIVACY_ALERT_TOKEN: "a".repeat(48), SESSION_SECRET: "s".repeat(48),
  SHOPIFY_PRIVACY_S3_DELETE_ENABLED: "0", SHOPIFY_PRIVACY_SMOKE_AUTHORIZE: PRIVACY_SMOKE_AUTHORIZATION,
  SHOPIFY_PRIVACY_SMOKE_AUTHORIZATION_EXPIRES_AT: new Date(Date.now()+1800000).toISOString(),
};

test("runner CLI fails before DB/provider access without authorization and cannot use the legacy command", () => {
  for (const [args, patch] of [
    [["--railway-one-shot"], { SHOPIFY_PRIVACY_SMOKE_AUTHORIZE: "" }],
    [["--railway-one-shot"], { RAILWAY_ENVIRONMENT_NAME: "production" }],
    [["--railway-one-shot"], { SHOPIFY_PRIVACY_SMOKE_DATABASE_SYSTEM_ID: "7695281403431092284" }],
    [["--send-one-synthetic-alert"], { SHOPIFY_PRIVACY_ALERT_EMAIL_ENABLED: "true", SHOPIFY_PRIVACY_SMOKE_ADMIN_TOKEN: "fixture" }],
  ] as const) {
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/smoke-shopify-privacy-email.ts", ...args],
      { env: { ...process.env, ...env, ...patch }, encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(result.stderr.trim());
    assert.equal(report.stage, "environment"); assert.equal(report.providerCalls, 0);
    assert.equal(report.resendAccepted, false);
    assert.ok(!result.stderr.includes(env.SESSION_SECRET));
    assert.ok(!result.stderr.includes(env.SHOPIFY_PRIVACY_ALERT_TOKEN));
  }
});

test("isolated runner is explicitly allowlisted; authorization cannot mutate persistent configuration", () => {
  const original = { ...env };
  assert.equal(authorizePrivacySmokeOneShot(env).connectionString, env.DATABASE_URL);
  assert.deepEqual(env, original);
  for (const key of Object.keys(env)) assert.throws(() => authorizePrivacySmokeOneShot({ ...env, [key]: "" }), key);
  for (const patch of [
    { RAILWAY_SERVICE_ID: T.service, SHOPIFY_PRIVACY_SMOKE_RUNNER_SERVICE_ID: T.service },
    { RAILWAY_SERVICE_ID: T.databaseService, SHOPIFY_PRIVACY_SMOKE_RUNNER_SERVICE_ID: T.databaseService },
    { RAILWAY_SERVICE_ID: randomUUID() }, { RAILWAY_SERVICE_NAME: "web" },
    { RAILWAY_PROJECT_ID: randomUUID() }, { RAILWAY_ENVIRONMENT_ID: randomUUID() },
    { RAILWAY_ENVIRONMENT_NAME: "production" }, { SHOPIFY_PRIVACY_ALERT_EMAIL_ENABLED: "true" },
    { SHOPIFY_PRIVACY_SMOKE_AUTHORIZE: "yes" }, { SHOPIFY_PRIVACY_SMOKE_DATABASE_SYSTEM_ID: "7695281403431092284" },
    { SHOPIFY_PRIVACY_SMOKE_AUTHORIZATION_EXPIRES_AT: new Date(Date.now()-1000).toISOString() },
    { SHOPIFY_PRIVACY_SMOKE_AUTHORIZATION_EXPIRES_AT: new Date(Date.now()+7200000).toISOString() },
    { SESSION_SECRET: "whatsapp-crm-secret-key-change-in-production" },
    { SHOPIFY_PRIVACY_S3_DELETE_ENABLED: "1" }, { SHOPIFY_PRIVACY_EVIDENCE_JSON: "[]" },
    { SHOPIFY_PRIVACY_S3_ACCESS_KEY_ID: "fixture" },
  ]) assert.throws(() => authorizePrivacySmokeOneShot({ ...env, ...patch }));
  assert.equal(validatePrivacySmokeTarget({ ...env, SHOPIFY_PRIVACY_ALERT_EMAIL_ENABLED: "true" }), env.DATABASE_URL);
});

test("one-shot send accepts a provider message ID and burns attempts on rejection or ambiguity", async () => {
  process.env.RESEND_API_KEY = "fixture-resend-key";
  const { sendEmailDetailed } = await import("../server/email");
  const originalFetch = globalThis.fetch;
  const options = { to: "support@whachatcrm.com", subject: "STAGING TEST — Shopify Privacy Alert",
    text: "Synthetic operation", html: "<pre>Synthetic operation</pre>", privacyContext: "shopify" as const,
    idempotencyKey: "shopify-privacy-" + randomUUID() };
  try {
    for (const mode of ["accepted", "rejected", "ambiguous", "malformed"] as const) {
      let calls = 0;
      const messageId = randomUUID();
      globalThis.fetch = async (input, init) => {
        assert.equal(String(input), "https://api.resend.com/emails"); calls++;
        const body = JSON.parse(String(init?.body)); assert.equal(body.to, "support@whachatcrm.com");
        assert.equal(body.subject, options.subject);
        if (mode === "ambiguous") throw Error("provider secret must not escape");
        if (mode === "rejected") return new Response("rejected", { status: 429 });
        return Response.json(mode === "accepted" ? { id: messageId } : {});
      };
      const dispatch = oneShotDispatch(sendEmailDetailed, Date.now()+60000);
      const result = await dispatch(options);
      assert.equal(result.ok, mode === "accepted");
      assert.equal(result.providerMessageId, mode === "accepted" ? messageId : null);
      if (mode === "ambiguous" || mode === "malformed") assert.equal(result.acceptanceUnknown, true);
      await assert.rejects(dispatch(options), /one_shot_send_refused/);
      assert.equal(calls, 1);
    }
    let calls = 0;
    await assert.rejects(oneShotDispatch(async () => { calls++; }, Date.now()-1)(), /one_shot_send_refused/);
    assert.equal(calls, 0);
    const throwing = oneShotDispatch(async () => { calls++; throw Error("provider failed"); }, Date.now()+60000);
    await assert.rejects(throwing()); await assert.rejects(throwing(), /one_shot_send_refused/); assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("real PostgreSQL consumption is atomic and survives cleanup, failure and redeploy", async () => {
  const target = process.env.SHOPIFY_TEST_DATABASE_URL;
  assert.ok(target, "Explicit disposable PostgreSQL is required");
  const url = new URL(target);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
  assert.equal(url.pathname, "/whachat_shopify_test");
  const pool = new Pool({ connectionString: target });
  const taskId = randomUUID();
  try {
    // All test DDL is on the disposable DB, never staging.
    await pool.query("CREATE TABLE public.admin_settings(id text PRIMARY KEY, password_hash text)");
    await assert.rejects(privacySmokeAdminToken(pool, env.SESSION_SECRET), /staging_admin_not_initialized/);
    await pool.query("INSERT INTO public.admin_settings VALUES ('admin','fixture-hash')");
    assert.equal(await privacySmokeAdminToken(pool, env.SESSION_SECRET), createHmac("sha256", env.SESSION_SECRET).update("fixture-hash").digest("hex"));
    // Initialize once before racing inserts (DDL initialization itself may safely fail closed on contention).
    await assert.rejects(consumePrivacySmokeOneShot(pool, randomUUID(), Date.now()-1), /job_consumed_or_authorization_expired/);
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => consumePrivacySmokeOneShot(pool, taskId, Date.now()+60000)));
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    const before = (await pool.query("SELECT * FROM public.shopify_privacy_smoke_jobs WHERE job_key=$1", [PRIVACY_SMOKE_JOB])).rows[0];
    assert.equal(before.task_id, taskId); assert.equal(before.result, "consumed");
    await recordPrivacySmokeOneShot(pool, randomUUID(), "verified", "wrong-owner");
    assert.equal((await pool.query("SELECT result FROM public.shopify_privacy_smoke_jobs")).rows[0].result, "consumed");
    await recordPrivacySmokeOneShot(pool, taskId, "failed", null);
    // New operation ID, new deployment and new authorization cannot reset this logical job.
    await assert.rejects(consumePrivacySmokeOneShot(pool, randomUUID(), Date.now()+60000), /job_consumed_or_authorization_expired/);
    assert.equal((await pool.query("SELECT count(*)::int n FROM public.shopify_privacy_smoke_jobs")).rows[0].n, 1);
  } finally {
    await pool.query("DROP TABLE IF EXISTS public.shopify_privacy_smoke_jobs, public.admin_settings");
    await pool.end();
  }
});
