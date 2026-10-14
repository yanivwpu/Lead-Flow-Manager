import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { productionSmokeConfig, verifyProductionSmokeDatabase, verifyProductionSmokeReceiver, verifyProductionSmokeSender,
  consumeProductionSmoke, recordProductionSmoke, productionSmokeDelivery, PRODUCTION_SMOKE_ID, PRODUCTION_SMOKE_AUTH } from "../server/shopifyPrivacyProductionSmoke";
const ids = [1,2,3,4,5,6].map(n => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`);
const env = {
  RAILWAY_PROJECT_ID: ids[0], PRIVACY_SMOKE_PROJECT_ID: ids[0], RAILWAY_ENVIRONMENT_ID: ids[1], PRIVACY_SMOKE_ENVIRONMENT_ID: ids[1],
  RAILWAY_SERVICE_ID: ids[2], PRIVACY_SMOKE_RUNNER_ID: ids[2], PRIVACY_SMOKE_APP_ID: ids[3], PRIVACY_SMOKE_DATABASE_SERVICE_ID: ids[4],
  RAILWAY_SERVICE_NAME: "production-privacy-email-once", RAILWAY_ENVIRONMENT_NAME: "production",
  PRIVACY_SMOKE_AUTHORIZE: PRODUCTION_SMOKE_AUTH, PRIVACY_SMOKE_EXPIRES_AT: new Date(Date.now()+1800000).toISOString(),
  SHOPIFY_PRIVACY_ALERT_EMAIL_ENABLED: "false", SHOPIFY_PRIVACY_S3_DELETE_ENABLED: "0",
  RESEND_API_KEY: "fixture-send-secret", PRIVACY_SMOKE_RESEND_VERIFY_KEY: "fixture-read-secret", PRIVACY_SMOKE_RESEND_DOMAIN_ID: ids[5],
  PRIVACY_SMOKE_SENDER_APPROVAL: "VERIFIED SENDING KEY AUTHORIZED FOR noreply@crm.whachatcrm.com",
  RESEND_FROM_EMAIL: "WhachatCRM <noreply@crm.whachatcrm.com>", SHOPIFY_PRIVACY_ALERT_TOKEN: "t".repeat(48),
  PRIVACY_SMOKE_APPROVED_APP_ORIGIN: "https://production.example.invalid", PRIVACY_SMOKE_RECEIVER_URL: "https://production.example.invalid/api/internal/shopify/privacy-alerts",
  PRIVACY_SMOKE_DATABASE_HOST: "private.example.invalid", PRIVACY_SMOKE_DATABASE_URL: "postgres://fixture:fixture@private.example.invalid/railway",
  PRIVACY_SMOKE_DATABASE_SYSTEM_ID: "123456789",
};
test("production gates require independently supplied identities and explicit approval, with no mutation", () => {
  const original = { ...env }; assert.equal(productionSmokeConfig(env).receiver, env.PRIVACY_SMOKE_RECEIVER_URL); assert.deepEqual(env, original);
  for (const key of Object.keys(env)) assert.throws(() => productionSmokeConfig({ ...env, [key]: "" }), key);
  for (const patch of [
    { RAILWAY_ENVIRONMENT_NAME: "staging" }, { RAILWAY_SERVICE_ID: ids[3], PRIVACY_SMOKE_RUNNER_ID: ids[3] },
    { PRIVACY_SMOKE_RUNNER_ID: ids[4], RAILWAY_SERVICE_ID: ids[4] }, { SHOPIFY_PRIVACY_ALERT_EMAIL_ENABLED: "true" },
    { DATABASE_URL: env.PRIVACY_SMOKE_DATABASE_URL }, { SESSION_SECRET: "fixture" }, { SHOPIFY_PRIVACY_EVIDENCE_KEY: "fixture" },
    { SHOPIFY_PRIVACY_S3_DELETE_ENABLED: "1" }, { RESEND_FROM_EMAIL: "personal@example.invalid" },
    { PRIVACY_SMOKE_RECEIVER_URL: "https://different.example.invalid/api/internal/shopify/privacy-alerts" },
    { PRIVACY_SMOKE_RECEIVER_URL: env.PRIVACY_SMOKE_RECEIVER_URL + "?token=fixture" },
    { PRIVACY_SMOKE_APPROVED_APP_ORIGIN: "http://production.example.invalid" },
    { PRIVACY_SMOKE_EXPIRES_AT: new Date(Date.now()-1).toISOString() },
    { PRIVACY_SMOKE_EXPIRES_AT: new Date(Date.now()+7200000).toISOString() },
  ]) assert.throws(() => productionSmokeConfig({ ...env, ...patch }));
});
test("CLI fails closed before network/DB access without authorization and hides secrets", (t) => {
  const clean = { ...process.env, ...env, PRIVACY_SMOKE_AUTHORIZE: "", DATABASE_URL: "" };
  const result = spawnSync(process.execPath, ["--import","tsx","scripts/smoke-shopify-privacy-production.ts","--send-one-production-test"],
    { env: clean, encoding: "utf8", timeout: 10000 });
  if ((result.error as NodeJS.ErrnoException)?.code === "EPERM") { t.skip("sandbox blocks child processes; exercised by CI"); return; }
  assert.equal(result.status,1); const report = JSON.parse(result.stderr.trim());
  assert.equal(report.stage,"configuration"); assert.equal(report.providerCalls,0);
  for (const secret of [env.RESEND_API_KEY,env.SHOPIFY_PRIVACY_ALERT_TOKEN,env.PRIVACY_SMOKE_DATABASE_URL])
    assert.ok(!result.stderr.includes(secret));
});
test("production receiver rejects anonymous/wrong auth and must authenticate while remaining disabled", async () => {
  let calls = 0;
  const request = (async (_url: any, init: any) => {
    assert.equal(init.redirect,"error"); const auth = init.headers.Authorization; calls++;
    assert.equal(JSON.parse(init.body).alertId,PRODUCTION_SMOKE_ID);
    return new Response(JSON.stringify({ error: auth === `Bearer ${env.SHOPIFY_PRIVACY_ALERT_TOKEN}` ? "delivery_disabled" : "unauthorized" }),
      { status: auth === `Bearer ${env.SHOPIFY_PRIVACY_ALERT_TOKEN}` ? 503 : 401 });
  }) as typeof fetch;
  await verifyProductionSmokeReceiver(env.PRIVACY_SMOKE_RECEIVER_URL, env.SHOPIFY_PRIVACY_ALERT_TOKEN, request); assert.equal(calls,3);
  for (const status of [200,302,401,500]) await assert.rejects(verifyProductionSmokeReceiver(env.PRIVACY_SMOKE_RECEIVER_URL,
    env.SHOPIFY_PRIVACY_ALERT_TOKEN, (async () => new Response('{}',{status})) as typeof fetch));
});
test("sender requires live verified sending domain; missing read permission is a hard stop", async () => {
  const domain = { id: ids[5], name: "crm.whachatcrm.com", status: "verified", capabilities: { sending: "enabled" } };
  await verifyProductionSmokeSender(env, (async (_url: any, init: any) => {
    assert.equal(init.redirect,"error"); assert.equal(init.headers.Authorization,`Bearer ${env.PRIVACY_SMOKE_RESEND_VERIFY_KEY}`);
    return Response.json(domain);
  }) as typeof fetch);
  for (const body of [{ ...domain, name: "other.example.invalid" },{ ...domain, status:"pending" },{ ...domain, capabilities: {sending:"disabled"} },{}])
    await assert.rejects(verifyProductionSmokeSender(env, (async () => Response.json(body)) as typeof fetch));
  await assert.rejects(verifyProductionSmokeSender(env, (async () => new Response('{}',{status:403})) as typeof fetch));
});
test("database identity and excessive runner privilege fail before durable consumption", async () => {
  const pool = (identity: string, unsafe: boolean) => ({query: async (sql: string) => ({ rows: sql.includes('pg_control_system') ?
    [{database:'railway',schema:'public',system_id:identity}] : sql.includes('pg_roles') ? [{unsafe}] : [{ready:true}] })}) as unknown as Pool;
  await verifyProductionSmokeDatabase(pool(env.PRIVACY_SMOKE_DATABASE_SYSTEM_ID,false),env);
  await assert.rejects(verifyProductionSmokeDatabase(pool('different',false),env));
  await assert.rejects(verifyProductionSmokeDatabase(pool(env.PRIVACY_SMOKE_DATABASE_SYSTEM_ID,true),env));
});
test("existing PostgreSQL task PK burns one authorization across races, restarts, ambiguity and expiry without DDL in runner", async () => {
  const target = process.env.SHOPIFY_TEST_DATABASE_URL;
  const local = target ? undefined : new PGlite();
  let real: Pool | undefined;
  if (target) {
    const url = new URL(target); assert.ok(['localhost','127.0.0.1'].includes(url.hostname)); assert.equal(url.pathname,'/whachat_shopify_test');
    real = new Pool({connectionString:target,options:"-c search_path=production_privacy_smoke_test"});
  }
  const query = async (sql: string, args?: any[]) => {
    if (real) return real.query(sql,args);
    const r = args ? await local!.query(sql,args) : (await local!.exec(sql)).at(-1)!; return {rows:r.rows,rowCount:r.affectedRows};
  };
  const pool = {query} as unknown as Pool;
  const namespace = 'production_privacy_smoke_test';
  try {
    await query(`CREATE SCHEMA ${namespace}`); await query(`SET search_path=${namespace}`);
    await query(`CREATE TABLE shopify_privacy_erasure_tasks(id varchar PRIMARY KEY,requested_at timestamp DEFAULT NOW(),
      scope_from timestamp,scope_to timestamp DEFAULT NOW(),status text DEFAULT 'pending_external',completed_at timestamp)`);
    await query(readFileSync('migrations/0105_shopify_privacy_automation.sql','utf8'));
    // Production SQL explicitly qualifies public. Substitute ONLY within this disposable test adapter.
    const scoped = {query: (sql: string,args?: any[]) => query(sql.replaceAll('public.',namespace+'.'),args)} as unknown as Pool;
    const races = await Promise.allSettled(Array.from({length:8}, () => consumeProductionSmoke(scoped,Date.now()+60000)));
    assert.equal(races.filter(r => r.status==='fulfilled').length,1);
    await assert.rejects(consumeProductionSmoke(scoped,Date.now()+60000), /consumed/);
    const row = (await query('SELECT * FROM shopify_privacy_erasure_tasks')).rows[0];
    assert.equal(row.id,PRODUCTION_SMOKE_ID); assert.ok(row.completed_at); assert.equal(row.status,'smoke_consumed');
    assert.equal(row.request_kind,'privacy_email_smoke'); assert.deepEqual(row.required_checks,[]);
    assert.equal((await query('SELECT count(*)::int n FROM shopify_privacy_erasure_tasks WHERE completed_at IS NULL')).rows[0].n,0);
    assert.equal((await query('SELECT count(*)::int n FROM shopify_privacy_alerts')).rows[0].n,0);
    await recordProductionSmoke(scoped,false,null);
    await assert.rejects(consumeProductionSmoke(scoped,Date.now()+60000)); // rejection/ambiguity never resets the guard
    await recordProductionSmoke(scoped,true,ids[5]);
    assert.equal((await query('SELECT checks FROM shopify_privacy_erasure_tasks')).rows[0].checks.privacyEmailSmoke.providerMessageId,ids[5]);
    await assert.rejects(recordProductionSmoke(scoped,true,null));
    await assert.rejects(recordProductionSmoke(scoped,true,'malformed'));
    // Lost insert acknowledgement still leaves a consumed tombstone after simulated process restart.
    await query('DELETE FROM shopify_privacy_erasure_tasks'); // disposable fixture only
    const lostAck = {query:async (sql: string,args: any[]) => {await scoped.query(sql,args); throw Error('lost acknowledgement');}} as unknown as Pool;
    await assert.rejects(consumeProductionSmoke(lostAck,Date.now()+60000));
    await assert.rejects(consumeProductionSmoke(scoped,Date.now()+60000));
    await query('DELETE FROM shopify_privacy_erasure_tasks');
    await assert.rejects(consumeProductionSmoke(scoped,Date.now()-60000));
    assert.equal((await query('SELECT count(*)::int n FROM shopify_privacy_erasure_tasks')).rows[0].n,0);
    const source = readFileSync('server/shopifyPrivacyProductionSmoke.ts','utf8');
    assert.ok(!/CREATE TABLE|ALTER TABLE|DELETE FROM/.test(source));
  } finally {
    await query(`DROP SCHEMA ${namespace} CASCADE`); await real?.end(); await local?.close();
  }
});


test("delivery burns before provider, never retries rejection/timeout, and restart must reacquire durable guard", async () => {
  for (const outcome of ["accepted", "rejected", "timeout"]) {
    let burned = false, calls = 0;
    const pool = { query: async () => { if (burned) return {rowCount:0}; burned = true; return {rowCount:1}; } } as unknown as Pool;
    const send = async () => { assert.ok(burned); calls++; if (outcome === "timeout") throw Error("secret must not escape"); return outcome === "accepted"; };
    const delivery = productionSmokeDelivery(pool,Date.now()+60000,send);
    assert.equal(await delivery.deliver(ids[0]),false); assert.equal(calls,0);
    const result = await Promise.allSettled(Array.from({length:8}, () => delivery.deliver(PRODUCTION_SMOKE_ID)));
    assert.equal(calls,1); assert.ok(delivery.consumed);
    assert.equal(result[0].status,outcome === "timeout" ? "rejected" : "fulfilled");
    await delivery.deliver(PRODUCTION_SMOKE_ID); assert.equal(calls,1);
    const restart = productionSmokeDelivery(pool,Date.now()+60000,send);
    await assert.rejects(restart.deliver(PRODUCTION_SMOKE_ID)); assert.equal(calls,1);
  }
  const failedPersistence = productionSmokeDelivery({query:async () => {throw Error("commit uncertain");}} as unknown as Pool,
    Date.now()+60000,async () => {assert.fail("must not send on uncertain persistence"); return true;});
  await assert.rejects(failedPersistence.deliver(PRODUCTION_SMOKE_ID));
  assert.equal(await failedPersistence.deliver(PRODUCTION_SMOKE_ID),false);
  const expired = productionSmokeDelivery({query:async () => ({rowCount:1})} as unknown as Pool,Date.now()-1,
    async () => {assert.fail("expiry prevents provider call"); return true;});
  await assert.rejects(expired.deliver(PRODUCTION_SMOKE_ID));
});
