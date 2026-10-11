import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { REQUIRED_PRIVACY_CHECKS, type PrivacyAdapter } from "../server/shopifyPrivacyVerification";

test("PostgreSQL worker races, leases, retries, checkpoints, complete verification and deduplicated exception delivery", async () => {
  const target = process.env.SHOPIFY_TEST_DATABASE_URL;
  assert.ok(target, "Explicit disposable PostgreSQL is required"); const url = new URL(target);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname)); assert.equal(url.pathname, "/whachat_shopify_test");
  const admin = new Pool({ connectionString: target }); const namespace = "shopify_privacy_worker_test";
  await admin.query(`CREATE SCHEMA ${namespace}`); url.searchParams.set("options", `-c search_path=${namespace}`); process.env.DATABASE_URL = url.toString();
  const { db } = await import("../drizzle/db"); const pool = db.$client;
  const { processShopifyExternalErasureTasks: run, claimPrivacyTask: claim, savePrivacyCheck: save, renewPrivacyLease: renew,
    queuePrivacyExceptionAlerts: alert, deliverPrivacyAlerts: deliver, readPrivacyOperationsStatus: status } = await import("../server/shopifyExternalErasure");
  const verified: PrivacyAdapter = async () => ({ verified: true, evidence: { method: "deletion", evidenceDigest: "a".repeat(64), verifiedAt: new Date().toISOString() } });
  const insert = async (id: string, extra = "") => pool.query(`INSERT INTO shopify_privacy_erasure_tasks(id) VALUES($1) ${extra}`, [id]);
  try {
    await pool.query(`CREATE TABLE shopify_privacy_erasure_tasks(id varchar PRIMARY KEY DEFAULT gen_random_uuid(), requested_at timestamp NOT NULL DEFAULT NOW(),scope_from timestamp,scope_to timestamp NOT NULL DEFAULT NOW(),status text NOT NULL DEFAULT 'pending_external',completed_at timestamp)`);
    await pool.query(readFileSync("migrations/0105_shopify_privacy_automation.sql", "utf8"));
    await pool.query(readFileSync("migrations/0105_shopify_privacy_automation.sql", "utf8"));
    await pool.query(readFileSync("migrations/0106_shopify_privacy_alert_email.sql", "utf8"));
    await pool.query(readFileSync("migrations/0106_shopify_privacy_alert_email.sql", "utf8"));
    await insert("race");
    const calls: string[] = [];
    await Promise.all(Array.from({ length: 6 }, () => run(async (t, check, signal) => { calls.push(check); return verified(t, check, signal); })));
    assert.equal(calls.length, REQUIRED_PRIVACY_CHECKS.length); assert.equal(new Set(calls).size, calls.length);
    assert.equal((await pool.query("SELECT status FROM shopify_privacy_erasure_tasks WHERE id='race'")).rows[0].status, "verified_complete");
    await insert("lease"); const first = await claim(); assert.equal(first?.id, "lease");
    await pool.query("UPDATE shopify_privacy_erasure_tasks SET lease_expires_at=NOW()-interval '1 second' WHERE id='lease'");
    const second = await claim(); assert.notEqual(first!.token, second!.token);
    assert.equal(await save("lease", first!.token, "railway_logs", {}), false); assert.equal(await renew("lease", first!.token), false);
    assert.equal(await renew("lease", second!.token), true);
    await pool.query("UPDATE shopify_privacy_erasure_tasks SET lease_expires_at=NOW()-interval '1 second' WHERE id='lease'");
    let failed = true;
    await run(async (t, check, signal) => check === "mail_processor" && failed ? { verified: false, code: "provider_retry" } : verified(t, check, signal));
    const partial = (await pool.query("SELECT * FROM shopify_privacy_erasure_tasks WHERE id='lease'")).rows[0];
    assert.equal(partial.status, "retrying"); assert.equal(Object.keys(partial.checks).length, 5); assert.equal(partial.attempts, 1);
    assert.ok(partial.next_attempt_at > new Date()); assert.equal(partial.completed_at, null);
    assert.equal((await run(verified)).completed, 0, "retry must respect backoff");
    failed = false; await pool.query("UPDATE shopify_privacy_erasure_tasks SET next_attempt_at=NOW() WHERE id='lease'");
    const retried: string[] = []; await run(async (t,c,s) => { retried.push(c); return verified(t,c,s); }); assert.deepEqual(retried, ["mail_processor"]);
    await insert("bare_ack"); await run(async () => ({ verified: true } as any));
    assert.equal((await pool.query("SELECT status FROM shopify_privacy_erasure_tasks WHERE id='bare_ack'")).rows[0].status, "blocked");
    await insert("retry");
    for (let attempt = 0; attempt < 8; attempt++) {
      await pool.query("UPDATE shopify_privacy_erasure_tasks SET next_attempt_at=NOW() WHERE id='retry'");
      await run(async () => { throw Error("personal address MUST NOT persist"); });
    }
    const terminal = (await pool.query("SELECT * FROM shopify_privacy_erasure_tasks WHERE id='retry'")).rows[0];
    assert.equal(terminal.status, "permanent_failure"); assert.equal(terminal.attempts, 8); assert.equal(terminal.error_code, "provider_retry");
    assert.ok(!JSON.stringify(terminal).includes("MUST NOT"));
    await insert("forbidden"); await run(async () => ({ verified: false, code: "provider_permanent" }));
    assert.equal((await pool.query("SELECT status FROM shopify_privacy_erasure_tasks WHERE id='forbidden'")).rows[0].status, "permanent_failure");
    await insert("retention"); await run(async () => ({ verified: false, code: "retention_wait", retryAt: new Date(Date.now()+86400000*2) }));
    const retained = (await pool.query("SELECT * FROM shopify_privacy_erasure_tasks WHERE id='retention'")).rows[0];
    assert.equal(retained.status, "pending_external"); assert.equal(retained.completed_at, null); assert.equal(retained.attempts, 0);
    await insert("missing"); await run(async () => ({ verified: false, code: "missing_configuration" }));
    await insert("access"); await pool.query("UPDATE shopify_privacy_erasure_tasks SET request_kind='access_request',status='blocked' WHERE id='access'");
    await insert("deadline"); await pool.query("UPDATE shopify_privacy_erasure_tasks SET deadline_at=NOW()+interval '2 days', next_attempt_at=NOW()+interval '1 day' WHERE id='deadline'");
    await Promise.all([alert(), alert(), alert()]);
    assert.equal((await pool.query("SELECT count(*)::int n FROM shopify_privacy_alerts WHERE task_id='missing'")).rows[0].n, 1);
    assert.equal((await pool.query("SELECT count(*)::int n FROM shopify_privacy_alerts WHERE task_id='retry'")).rows[0].n, 1);
    assert.equal((await pool.query("SELECT count(*)::int n FROM shopify_privacy_alerts WHERE task_id='deadline'")).rows[0].n, 1);
    await pool.query("UPDATE shopify_privacy_erasure_tasks SET deadline_at=NOW()-interval '1 second' WHERE id='deadline'"); await alert(); await alert();
    assert.equal((await pool.query("SELECT count(*)::int n FROM shopify_privacy_alerts WHERE task_id='deadline'")).rows[0].n, 2);
    const keys: string[] = []; await Promise.all([deliver(async (payload,key) => { keys.push(key); assert.ok(payload.actionRequired); return true; }), deliver(async (_p,key) => { keys.push(key); return true; })]);
    assert.equal(keys.length, new Set(keys).size);
    await deliver(async () => { assert.fail("delivered alerts cannot repeat"); return false; });
    await insert("delivery_failure"); await pool.query("UPDATE shopify_privacy_erasure_tasks SET status='blocked',error_code='missing_configuration',next_attempt_at=NOW()+interval '1 day' WHERE id='delivery_failure'"); await alert();
    const retryKeys: string[] = [];
    await deliver(async (_payload,key) => { retryKeys.push(key); throw Error("provider secret must not persist"); });
    await deliver(async () => { assert.fail("delivery backoff must be respected"); return true; });
    await pool.query("UPDATE shopify_privacy_alerts SET next_attempt_at=NOW() WHERE delivered_at IS NULL");
    await deliver(async (_payload,key) => { retryKeys.push(key); return true; });
    assert.equal(retryKeys.length,2); assert.equal(retryKeys[0],retryKeys[1], "a timed-out delivery must retry the same idempotency key");
    const snapshot = await status(); assert.equal(snapshot.counts.verified_complete, 2); assert.equal(snapshot.counts.overdue, 1);
    assert.ok(!JSON.stringify(snapshot).includes("scope_from"));
    const denied = await run(async () => { assert.fail("permanent failure and access requests must not be processed"); return { verified: false, code: "provider_permanent" }; }); assert.equal(denied.completed, 0);
    // A transaction failure cannot create a detached task or alert.
    const client = await pool.connect(); try { await client.query("BEGIN"); await client.query("INSERT INTO shopify_privacy_erasure_tasks(id) VALUES('rollback')"); await client.query("ROLLBACK"); } finally { client.release(); }
    assert.equal((await pool.query("SELECT count(*)::int n FROM shopify_privacy_erasure_tasks WHERE id='rollback'")).rows[0].n, 0);
  } finally { await pool.end(); await admin.query(`DROP SCHEMA ${namespace} CASCADE`); await admin.end(); }
});
