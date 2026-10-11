import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import express from "express";
import { Pool } from "pg";

test("authenticated receiver, real PostgreSQL outbox, Resend failures, uncertain retries, replicas and privacy", async () => {
  const target = process.env.SHOPIFY_TEST_DATABASE_URL;
  assert.ok(target, "Explicit disposable PostgreSQL is required");
  const url = new URL(target);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname)); assert.equal(url.pathname, "/whachat_shopify_test");
  const admin = new Pool({ connectionString: target });
  const namespace = "shopify_privacy_email_test";
  await admin.query(`CREATE SCHEMA ${namespace}`);
  url.searchParams.set("options", `-c search_path=${namespace}`);
  process.env.DATABASE_URL = url.toString();
  process.env.RESEND_API_KEY = "fixture-resend-key";
  const env = { SHOPIFY_PRIVACY_ALERT_EMAIL_ENABLED: "true", RESEND_API_KEY: "fixture-resend-key", SHOPIFY_PRIVACY_ALERT_TOKEN: "a".repeat(48) };
  const { db } = await import("../drizzle/db"); const pool = db.$client;
  const { registerShopifyPrivacyAlertReceiver, acceptPrivacyAlertEmail, PRIVACY_ALERT_RECEIVER_PATH, renderPrivacyAlertEmail } = await import("../server/shopifyPrivacyAlertEmail");
  const { queuePrivacyExceptionAlerts: queue, deliverPrivacyAlerts: worker, configuredPrivacyAlertSender, readPrivacyOperationsStatus } = await import("../server/shopifyExternalErasure");
  const app = express();
  registerShopifyPrivacyAlertReceiver(app, id => acceptPrivacyAlertEmail(pool, id), env);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const endpoint = `http://127.0.0.1:${(server.address() as any).port}${PRIVACY_ALERT_RECEIVER_PATH}`;
  const originalFetch = globalThis.fetch;
  let mode = "success", acceptedCount = 0, providerCalls = 0;
  const accepted = new Map<string, string>(); const bodies = new Map<string, string>();
  const post = (id: string, options: { token?: string; body?: unknown; key?: string } = {}) => originalFetch(endpoint, { method: "POST",
    headers: { Authorization: `Bearer ${options.token ?? env.SHOPIFY_PRIVACY_ALERT_TOKEN}`, "Content-Type": "application/json", "Idempotency-Key": options.key ?? `shopify-privacy-${id}` },
    body: JSON.stringify(options.body ?? { alertId: id }) });
  const add = async (patch: { status?: string; code?: string; kind?: string; deadline?: string } = {}) => {
    const id = randomUUID();
    await pool.query(`INSERT INTO shopify_privacy_erasure_tasks(id,status,error_code,request_kind,deadline_at)
      VALUES($1,$2,$3,$4,COALESCE($5::timestamp,NOW()+interval '30 days'))`, [id, patch.status || "blocked", patch.code || "missing_configuration", patch.kind || "store_erasure", patch.deadline || null]);
    await queue();
    return (await pool.query("SELECT id FROM shopify_privacy_alerts WHERE task_id=$1 AND resolved_at IS NULL ORDER BY created_at", [id])).rows.map(a => a.id) as string[];
  };
  const row = async (id: string) => (await pool.query("SELECT * FROM shopify_privacy_alerts WHERE id=$1", [id])).rows[0];
  try {
    await pool.query(`CREATE TABLE shopify_privacy_erasure_tasks(id varchar PRIMARY KEY DEFAULT gen_random_uuid(),requested_at timestamp NOT NULL DEFAULT NOW(),scope_from timestamp,scope_to timestamp NOT NULL DEFAULT NOW(),status text NOT NULL DEFAULT 'pending_external',completed_at timestamp)`);
    for (const migration of ["0105_shopify_privacy_automation", "0106_shopify_privacy_alert_email", "0106_shopify_privacy_alert_email"]) await pool.query(readFileSync(`migrations/${migration}.sql`, "utf8"));
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), "https://api.resend.com/emails", "No live provider or arbitrary URL calls");
      providerCalls++;
      const key = (init!.headers as Record<string,string>)["Idempotency-Key"];
      assert.ok(key.startsWith("shopify-privacy-"));
      const body = String(init!.body);
      if (bodies.has(key)) assert.equal(body, bodies.get(key), "Retries must retain the exact provider body");
      else bodies.set(key, body);
      const parsed = JSON.parse(body); assert.equal(parsed.to, "support@whachatcrm.com");
      for (const field of ["Operation ID:", "Issue category:", "Deadline (UTC):", "Status:", "Required action:"]) assert.ok(parsed.text.includes(field));
      for (const forbidden of ["private@example.com", "secret-token", "merchant.myshopify.com", "SELECT", "Customer Fixture Name"]) {
        assert.ok(!body.includes(forbidden), `Privacy content excludes ${forbidden}`);
      }
      if (mode === "reject") return new Response("private@example.com secret-token", { status: 429 });
      if (mode === "server_error") return new Response("secret-token", { status: 503 });
      if (mode === "malformed") return new Response("{}", { status: 200 });
      if (!accepted.has(key)) { acceptedCount++; accepted.set(key, randomUUID()); }
      if (mode === "timeout_after_acceptance") throw Error("private@example.com secret-token");
      // Give concurrent requests time to contend on the database lock.
      await new Promise(resolve => setTimeout(resolve, 20));
      return Response.json({ id: accepted.get(key) });
    };
    const [id] = await add();
    for (const token of ["", "b".repeat(48), "é" + env.SHOPIFY_PRIVACY_ALERT_TOKEN.slice(1)]) assert.equal((await post(id, { token })).status, 401);
    assert.equal((await post(id, { key: "arbitrary" })).status, 400);
    assert.equal((await post(id, { body: { alertId: id, to: "private@example.com", html: "external content" } })).status, 400);
    assert.equal((await post(id, { body: { alertId: "merchant.myshopify.com" } })).status, 400);
    for (const body of ['{invalid', JSON.stringify({ alertId: id, extra: 'x'.repeat(2048) })]) {
      const response = await originalFetch(endpoint, { method: 'POST', headers: {
        Authorization: `Bearer ${env.SHOPIFY_PRIVACY_ALERT_TOKEN}`, 'Content-Type': 'application/json' }, body });
      assert.equal(response.status, 400); assert.deepEqual(await response.json(), { error: 'invalid_alert' });
    }
    assert.equal(providerCalls, 0);
    assert.equal((await post(randomUUID())).status, 503);
    env.SHOPIFY_PRIVACY_ALERT_EMAIL_ENABLED = "false";
    assert.equal((await post(id)).status, 503); env.SHOPIFY_PRIVACY_ALERT_EMAIL_ENABLED = "true";
    await Promise.all(Array.from({ length: 8 }, () => post(id)));
    assert.equal(acceptedCount, 1); assert.equal(providerCalls, 1);
    assert.ok((await row(id)).delivered_at); assert.ok((await row(id)).provider_message_id);
    assert.equal((await post(id)).status, 200); assert.equal(providerCalls, 1);
    // Durable record handles arbitrary age/restarts after confirmed acceptance.
    await pool.query("UPDATE shopify_privacy_alerts SET email_started_at=NOW()-interval '1 year' WHERE id=$1", [id]);
    assert.equal(await acceptPrivacyAlertEmail(pool, id), true); assert.equal(providerCalls, 1);

    // Simulate a worker losing its acknowledgement/restarting after provider acceptance.
    await pool.query("UPDATE shopify_privacy_alerts SET delivered_at=NULL,lease_expires_at=NOW()-interval '1 minute' WHERE id=$1", [id]);
    await worker(async (_payload,key) => (await post(key.replace("shopify-privacy-", ""))).ok);
    assert.ok((await row(id)).delivered_at); assert.equal(providerCalls, 1);

    const [failedId] = await add(); mode = "reject";
    const beforeFailure = acceptedCount;
    const transport = async (_payload: unknown, key: string) => (await post(key.replace("shopify-privacy-", ""))).ok;
    await worker(transport);
    assert.equal(acceptedCount, beforeFailure); assert.equal((await row(failedId)).delivered_at, null);
    assert.equal((await row(failedId)).email_started_at, null, "Confirmed rejection may retry beyond provider window");
    assert.equal((await row(failedId)).attempts, 1); assert.ok((await row(failedId)).next_attempt_at > new Date());
    const afterFailure = providerCalls; await worker(transport); assert.equal(providerCalls, afterFailure);
    await pool.query("UPDATE shopify_privacy_alerts SET next_attempt_at=NOW() WHERE id=$1", [failedId]); mode = "success";
    await worker(transport); assert.ok((await row(failedId)).delivered_at);

    const [timeoutId] = await add(); mode = "timeout_after_acceptance";
    const beforeTimeout = acceptedCount;
    assert.equal((await post(timeoutId)).status, 503); assert.equal(acceptedCount, beforeTimeout+1);
    assert.equal((await row(timeoutId)).delivered_at, null); assert.equal((await row(timeoutId)).email_uncertain, true);
    // Status/deadline/sender changes cannot change the frozen payload on replay.
    await pool.query("UPDATE shopify_privacy_erasure_tasks SET status='retrying',deadline_at=NOW()+interval '5 days' WHERE id=$1", [(await row(timeoutId)).task_id]);
    process.env.RESEND_FROM_EMAIL = "Different <other@crm.whachatcrm.com>";
    mode = "success"; assert.equal((await post(timeoutId)).status, 503, "A resolved issue must not be sent");
    await pool.query("UPDATE shopify_privacy_erasure_tasks SET status='blocked' WHERE id=$1", [(await row(timeoutId)).task_id]);
    assert.equal((await post(timeoutId)).status, 200); assert.equal(acceptedCount, beforeTimeout+1);

    const [uncertainId] = await add(); mode = "server_error";
    assert.equal((await post(uncertainId)).status, 503); assert.equal((await row(uncertainId)).delivered_at, null);
    await pool.query("UPDATE shopify_privacy_alerts SET email_started_at=NOW()-interval '24 hours' WHERE id=$1", [uncertainId]);
    const beforeExpired = providerCalls; mode = "success";
    assert.equal((await post(uncertainId)).status, 503); assert.equal(providerCalls, beforeExpired);
    assert.equal((await row(uncertainId)).email_reconciliation_required, true);
    assert.ok((await readPrivacyOperationsStatus()).alerts.some(a => a.id === uncertainId && a.emailStatus === "reconciliation_required"));
    const [malformedId] = await add(); mode = "malformed";
    assert.equal((await post(malformedId)).status, 503); assert.equal((await row(malformedId)).delivered_at, null);

    // Every category is rendered from trusted outbox fields; provider/error text is never interpolated.
    const categories = [
      { status: "permanent_failure", code: "provider_permanent" }, { code: "unsupported_provider" },
      { kind: "access_request" }, { status: "pending_external", deadline: new Date(Date.now()+86400000).toISOString() },
      { status: "pending_external", deadline: new Date(Date.now()-86400000).toISOString() },
    ];
    mode = "success";
    for (const patch of categories) for (const categoryId of await add(patch)) assert.equal((await post(categoryId)).status, 200);
    const [poisonId] = await add({ code: "private@example.com secret-token" });
    assert.equal((await post(poisonId)).status, 200); assert.equal((await row(poisonId)).action_code, "unsupported_provider");
    assert.throws(() => renderPrivacyAlertEmail({ taskId: "merchant.myshopify.com" } as any));

    // Unchanged issue across replicas is suppressed; a resolved issue starts a new occurrence.
    const taskId = (await row(id)).task_id;
    await Promise.all([queue(), queue(), queue()]);
    assert.equal((await pool.query("SELECT count(*)::int n FROM shopify_privacy_alerts WHERE task_id=$1", [taskId])).rows[0].n, 1);
    await pool.query("UPDATE shopify_privacy_erasure_tasks SET status='pending_external' WHERE id=$1", [taskId]); await queue();
    assert.ok((await row(id)).resolved_at);
    await pool.query("UPDATE shopify_privacy_erasure_tasks SET status='blocked' WHERE id=$1", [taskId]);
    await Promise.all([queue(), queue(), queue()]);
    const recurrence = (await pool.query("SELECT id FROM shopify_privacy_alerts WHERE task_id=$1 AND resolved_at IS NULL", [taskId])).rows;
    assert.equal(recurrence.length, 1); assert.notEqual(recurrence[0].id, id);
    assert.equal((await post(recurrence[0].id)).status, 200);
    assert.ok(!JSON.stringify((await pool.query("SELECT * FROM shopify_privacy_alerts")).rows).includes("secret-token"));
    // Sender configuration rejects unprotected/non-HTTPS endpoints and is disabled by default.
    assert.equal(configuredPrivacyAlertSender({ ...env, SHOPIFY_PRIVACY_ALERT_URL: "http://example.com" }), undefined);
    assert.equal(configuredPrivacyAlertSender({ ...env, SHOPIFY_PRIVACY_ALERT_EMAIL_ENABLED: "false" }), undefined);
    const send = configuredPrivacyAlertSender({ ...env, SHOPIFY_PRIVACY_ALERT_URL: `https://internal.example${PRIVACY_ALERT_RECEIVER_PATH}` })!;
    globalThis.fetch = async (_input, init) => { assert.deepEqual(JSON.parse(String(init!.body)), { alertId: id }); return Response.json({ accepted: true }); };
    assert.equal(await send({} as any, `shopify-privacy-${id}`), true);
    globalThis.fetch = async () => new Response(null, { status: 204 });
    assert.equal(await send({} as any, `shopify-privacy-${id}`), false, "Only confirmed receiver acceptance is delivery");
  } finally {
    globalThis.fetch = originalFetch; delete process.env.RESEND_FROM_EMAIL;
    await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.end(); await admin.query(`DROP SCHEMA ${namespace} CASCADE`); await admin.end();
  }
});
