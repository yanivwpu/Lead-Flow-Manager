/** Explicitly isolated real PostgreSQL race contract. Providers are always fake. */
import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { getTableConfig } from "drizzle-orm/pg-core";
import { chats, dripEnrollments, contacts, prospectIntelligence, prospectOutreachQueueItems, flowJobs, noReplyJobs, automationTimerJobs, campaignEnrollments } from "../shared/schema";

const url = process.env.MARKETING_TEST_DATABASE_URL;
test("real PostgreSQL: opt-out wins over waiting workers and retries without pool starvation", { skip: !url, timeout: 20000 }, async () => {
  const parsed = new URL(url!);
  assert(["127.0.0.1", "localhost"].includes(parsed.hostname), "Only a loopback test database is allowed");
  assert.equal(parsed.pathname, "/marketing_phase1_test", "Dedicated marketing_phase1_test database required");
  const schema = "marketing_" + randomUUID().replace(/-/g, "");
  const control = new Pool({ connectionString: url, max: 1 });
  await control.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: url, max: 3, application_name: "marketing-race-fixture", options: `-c search_path=${schema} -c statement_timeout=5000` });
  // Backend termination below is an intentional fault injection. Handle the
  // corresponding client/pool events while asserting the transaction rejection.
  pool.on("error", () => {});
  pool.on("connect", client => client.on("error", () => {}));
  const db = drizzle(pool);
  (globalThis as any).__marketingConcurrency = { db };
  await mkdir("work", { recursive: true });
  const scratch = await mkdtemp(join(process.cwd(), "work", "marketing-concurrency-"));
  const keys = ["NODE_ENV", "APP_ENV", "MARKETING_SENDS_ENABLED", "MARKETING_TEST_RECIPIENT", "MARKETING_PUBLIC_ORIGIN", "MARKETING_OPTOUT_SECRET", "EMAIL_SEND_HOURLY_SOFT_CAP"];
  const previous = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  try {
    await pool.query("CREATE TABLE users(id varchar PRIMARY KEY); CREATE TABLE email_mailboxes(id varchar PRIMARY KEY,workspace_user_id varchar,messages_sent_today integer,messages_sent_hour integer,send_count_day_key text,send_count_hour_key text); INSERT INTO users VALUES ('a'),('b'); INSERT INTO email_mailboxes(id,workspace_user_id) VALUES ('ma','a'),('mb','b');");
    for (const table of [chats, dripEnrollments, contacts, prospectIntelligence, prospectOutreachQueueItems, flowJobs, noReplyJobs, automationTimerJobs, campaignEnrollments]) {
      const config = getTableConfig(table);
      await pool.query(`CREATE TABLE ${config.name} (${config.columns.map(c => `"${c.name}" ${c.getSQLType()}`).join(",")})`);
    }
    await pool.query(await readFile("migrations/0113_marketing_compliance.sql", "utf8"));
    await pool.query("INSERT INTO marketing_sender_profiles VALUES ('a','ma','Sender A','123 Test Road',now(),'a'),('b','mb','Sender B','456 Test Road',now(),'b'); INSERT INTO contacts(id,user_id,email,phone,custom_fields) VALUES ('ca','a','person@example.com','+12025550123','{}'); INSERT INTO prospect_outreach_queue_items(id,workspace_user_id,contact_id,selected_channel,recipient_identity_normalized,queue_status) VALUES ('qa','a','ca','email','person@example.com','queued');");
    Object.assign(process.env, { NODE_ENV: "test", APP_ENV: "staging", MARKETING_SENDS_ENABLED: "staging-only", MARKETING_TEST_RECIPIENT: "person@example.com", MARKETING_PUBLIC_ORIGIN: "https://test.example.com", MARKETING_OPTOUT_SECRET: "isolated postgres test secret at least 32 bytes" });
    const output = join(scratch, "boundary.mjs");
    await build({ stdin: { contents: 'export * from "./server/marketingCompliance/service"; export * from "./server/marketingCompliance/store";', resolveDir: process.cwd(), loader: "ts" }, outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", plugins: [{ name: "isolated-postgres", setup(b) {
      b.onLoad({ filter: /[/\\]drizzle[/\\]db\.ts$/ }, () => ({ contents: "export const db=globalThis.__marketingConcurrency.db;", loader: "ts" }));
    } }] });
    const service = await import(pathToFileURL(output).href);
    let providerCalls = 0;
    let entered!: () => void; let release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const input = { workspace: "a", mailbox: "ma", recipients: ["person@example.com"], text: "Hello" };
    const inFlight = service.withCompliantMarketingEmail(input, async () => { providerCalls++; entered(); await gate; return { success: true }; });
    await started;
    const suppression = service.suppressMarketingIdentity({ workspace: "a", email: "PERSON@example.com", reason: "dnc", source: "race_fixture", scope: "all" });
    let waiting = false;
    for (let i = 0; i < 100; i++) {
      const result = await control.query("SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())");
      if (result.rows[0].n > 0) { waiting = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert(waiting, "opt-out must wait on the real in-flight advisory lock");
    const queuedWorker = service.withCompliantMarketingEmail(input, async () => { providerCalls++; return { success: true }; });
    // Attach rejection handling before releasing the provider to avoid a transient
    // unhandled rejection while the suppression transaction commits.
    const queuedManual = service.withGlobalDncEmailBoundary("a", ["person@example.com"], async () => {providerCalls++;return {success:true}});
    const manualResult = queuedManual.then(() => "sent", () => "blocked");
    const queuedPhone = service.withGlobalDncPhoneBoundary("a", "12025550123", async () => {providerCalls++;return {success:true}});
    const phoneResult = queuedPhone.then(() => "sent", () => "blocked");
    const queuedAdapter = service.withGlobalDncContactBoundary("a", {userId:"a",phone:"12025550123"}, async () => {providerCalls++;return {success:true}});
    const adapterResult = queuedAdapter.then(() => "sent", () => "blocked");
    const workerResult = queuedWorker.then(() => "sent", () => "blocked");
    release();
    await inFlight; await suppression;
    assert.equal(await workerResult, "blocked");
    assert.equal(await manualResult, "blocked", "manual dispatch must serialize with the global opt-out commit");
    assert.equal(await phoneResult, "blocked", "legacy phone dispatch must serialize with global opt-out");
    assert.equal(await adapterResult, "blocked", "adapter dispatch must serialize with global opt-out");
    const retries = await Promise.allSettled(Array.from({ length: 10 }, () => service.withCompliantMarketingEmail(input, async () => { providerCalls++; return { success: true }; })));
    assert(retries.every(r => r.status === "rejected"));
    assert.equal(providerCalls, 1, "only the provider request already in flight may complete");
    assert.equal((await pool.query("SELECT queue_status FROM prospect_outreach_queue_items WHERE id='qa'")).rows[0].queue_status, "skipped");
    let otherTenantCalls = 0;
    await service.withCompliantMarketingEmail({ ...input, workspace: "b", mailbox: "mb" }, async () => { otherTenantCalls++; return { success: true }; });
    assert.equal(otherTenantCalls, 1, "tenant A DNC cannot suppress tenant B");
    const beforeRejection = (await pool.query("SELECT messages_sent_today,messages_sent_hour FROM email_mailboxes WHERE id='mb'")).rows[0];
    const rejection = await service.withCompliantMarketingEmail({ ...input, workspace: "b", mailbox: "mb" }, async () => ({ success: false, error: "503 temporarily unavailable" }));
    assert.equal(rejection.success, false);
    assert.deepEqual((await pool.query("SELECT messages_sent_today,messages_sent_hour FROM email_mailboxes WHERE id='mb'")).rows[0], beforeRejection, "definite provider rejection rolls back quota reservation");
    // A provider success followed by a failed COMMIT is ambiguous, never a
    // normal transient retry. Terminate the real transaction connection here.
    await assert.rejects(service.withCompliantMarketingEmail({ ...input, workspace: "b", mailbox: "mb" }, async message => {
      message.onDispatch();
      const active = await control.query("SELECT pid FROM pg_stat_activity WHERE application_name='marketing-race-fixture' AND state='idle in transaction' AND datname=current_database()");
      assert.equal(active.rows.length, 1);
      await control.query("SELECT pg_terminate_backend($1)", [active.rows[0].pid]);
      return { success: true };
    }), /ambiguous_provider_delivery/);
    process.env.EMAIL_SEND_HOURLY_SOFT_CAP = "1";
    let overCapCalls = 0;
    const overCap = await Promise.allSettled(Array.from({length:4}, () => service.withCompliantMarketingEmail({ ...input, workspace:"b", mailbox:"mb" }, async () => { overCapCalls++; return {success:true}; })));
    assert(overCap.every(result => result.status === "rejected"));
    assert.equal(overCapCalls,0,"waiting workers must recheck the mailbox soft cap at the provider boundary");


  } finally {
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
    delete (globalThis as any).__marketingConcurrency;
    await pool.end(); await control.query(`DROP SCHEMA ${schema} CASCADE`); await control.end();
    await rm(scratch, { recursive: true, force: true });
  }
});
