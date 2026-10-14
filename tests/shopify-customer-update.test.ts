import assert from "node:assert/strict";
import test from "node:test";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import express from "express";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { PgDialect, getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { eq, sql } from "drizzle-orm";
import * as schema from "../shared/schema";
import { createShopifyCustomerWebhookHandler } from "../server/shopifyCustomerWebhookHandler";

const secret = "disposable-shopify-fixture";
process.env.DATABASE_URL ||= "postgres://fixture:fixture@127.0.0.1:1/whachat_shopify_test";
process.env.SHOPIFY_API_SECRET = secret;
const shop = "fixture.myshopify.com";
const stamp = (n: number) => `2026-10-13T12:00:${String(n).padStart(2, "0")}Z`;

test("signed customer webhook uses raw bytes, enforces topic/shop and waits for durable work", async t => {
  let processCalls = 0;
  let processEvent: any;
  let failure = false;
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>(r => { entered = r; });
  const hold = new Promise<void>(r => { release = r; });
  const app = express();
  app.use(express.json({ verify: (req: any, _res, raw) => { req.rawBody = raw; } }));
  app.post("/update", createShopifyCustomerWebhookHandler("customers/update", {
    verify(raw, signature) { const expected = createHmac("sha256", secret).update(raw).digest("base64");
      return expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature)); },
    async process(event) { processCalls++; processEvent = event; entered(); await hold;
      if (failure) throw new Error("sensitive fixture database error"); return "updated"; }, emit() {},
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(r => server.once("listening", r));
  const address = server.address() as { port: number };
  const raw = '{ "id": 123, "email": "three@example.invalid", "updated_at": "2026-10-13T12:00:01Z" }';
  const send = (extra: Record<string, string> = {}) => fetch(`http://127.0.0.1:${address.port}/update`, {
    method: "POST", body: raw, headers: { "content-type": "application/json", "x-shopify-shop-domain": shop,
      "x-shopify-topic": "customers/update", "x-shopify-event-id": "event-1",
      "x-shopify-hmac-sha256": createHmac("sha256", secret).update(raw).digest("base64"), ...extra },
  });
  try {
    await t.test("invalid HMAC is rejected before processing", async () => {
      assert.equal((await send({ "x-shopify-hmac-sha256": "invalid" })).status, 401);
      assert.equal((await send({ "x-shopify-hmac-sha256": createHmac("sha256", "another-app-secret").update(raw).digest("base64") })).status, 401);
      assert.equal(processCalls, 0);
    });
    await t.test("invalid shop and wrong topic are rejected", async () => {
      assert.equal((await send({ "x-shopify-shop-domain": "attacker.example" })).status, 400);
      assert.equal((await send({ "x-shopify-topic": "orders/create" })).status, 400);
      assert.equal((await send({ "x-shopify-event-id": "" })).status, 400); assert.equal(processCalls, 0);
    });
    await t.test("valid HMAC and durable acknowledgment", async () => {
      let responded = false;
      const pending = send().then(r => { responded = true; return r; }); await started;
      assert.equal(responded, false); release(); assert.equal((await pending).status, 200);
      assert.equal(processEvent.body.email, "three@example.invalid"); assert.equal(processEvent.shop, shop);
    });
    await t.test("transient failure returns retryable safe error", async () => {
      failure = true; const r = await send(); assert.equal(r.status, 503);
      assert.ok(!(await r.text()).includes("sensitive"));
    });
    await t.test("missing raw bytes cannot authenticate a reconstructed body", async () => {
      let status = 0;
      const handler = createShopifyCustomerWebhookHandler("customers/update", { verify: () => true,
        process: async () => { throw new Error("must not run"); }, emit() {} });
      await handler({ headers: {}, body: JSON.parse(raw) } as any,
        { status(n: number) { status = n; return this; }, json() {} } as any);
      assert.equal(status, 401);
    });
  } finally { await new Promise<void>((r, reject) => server.close(e => e ? reject(e) : r())); }
});

test("PostgreSQL engine customer synchronization regression fixtures", async t => {
  const target = process.env.SHOPIFY_TEST_DATABASE_URL;
  let nativePool: Pool | undefined, admin: Pool | undefined;
  const namespace = "shopify_customer_update_test";
  if (target) {
    const url = new URL(target);
    assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
    assert.equal(url.pathname, "/whachat_shopify_test");
    admin = new Pool({ connectionString: target });
    await admin.query("CREATE SCHEMA " + namespace);
    url.searchParams.set("options", "-c search_path=" + namespace);
    process.env.DATABASE_URL = url.toString();
    nativePool = new Pool({ connectionString: url.toString() });
  }
  const client = nativePool ? { exec: async (query: string) => { await nativePool!.query(query); }, close: async () => { await nativePool!.end(); } } : new PGlite();
  const database = nativePool ? drizzlePostgres(nativePool, { schema }) : drizzle(client as PGlite, { schema });
  const { syncShopifyCustomer: sync, ShopifyCustomerSyncError } = await import("../server/shopifyCustomerSync");
  const dialect = new PgDialect();
  const quote = (v: string) => '"' + v.replaceAll('"', '""') + '"';
  for (const table of [schema.users, schema.integrations, schema.contacts, schema.conversations, schema.activityEvents,
    schema.messages, schema.contactNotes, schema.shopifyPrivacyCustomerLocks, schema.workflows, schema.workflowExecutions]) {
    const cfg = getTableConfig(table as PgTable);
    const columns = cfg.columns.map(c => quote(c.name) + " " + (c.enumValues?.length ? "text" : c.getSQLType()) +
      (c.name === "id" ? " PRIMARY KEY DEFAULT gen_random_uuid()::text" : c.default !== undefined ?
        " DEFAULT " + (typeof c.default === "object" && c.default !== null && "getSQL" in c.default ?
          dialect.sqlToQuery(c.default as any).sql : typeof c.default === "string" ? "'" + c.default.replaceAll("'", "''") + "'" : String(c.default)) : ""));
    await client.exec("CREATE TABLE " + quote(cfg.name) + " (" + columns.join(",") + ")");
  }
  const insertOwner = async (id: string, ownerShop: string, integrationShop = ownerShop) => {
    await database.insert(schema.users).values({ id, name: "Disposable", email: `${id}@example.invalid`, password: "fixture",
      shopifyShop: ownerShop, shopifyAccessToken: "fixture", shopifySubscriptionStatus: "active" });
    await database.insert(schema.integrations).values({ userId: id, type: "shopify", name: "Shopify", isActive: true,
      config: { shop: integrationShop, syncOptions: ["new_customers"] } });
  };
  await insertOwner("owner", shop); await insertOwner("foreign", "foreign.myshopify.com");
  const send = (n: number, body: Record<string, unknown> = {}, topic: "customers/create" | "customers/update" = "customers/update",
    customer = "123", eventId = `event-${customer}-${n}`) => sync({ shop, topic, eventId,
      body: { id: customer, updated_at: stamp(n), ...body } }, database as unknown as typeof import("../drizzle/db").db);
  const rows = () => database.select().from(schema.contacts).where(eq(schema.contacts.userId, "owner")).orderBy(schema.contacts.createdAt, schema.contacts.id);
  try {
    await t.test("update before creation safely creates a quiet contact", async () => {
      assert.equal(await send(2, { first_name: "Webhook", last_name: "Test", email: "three@example.invalid" }), "created");
      const [c] = await rows(); assert.equal(c.email, "three@example.invalid"); assert.equal(c.name, "Webhook Test");
      assert.equal((await database.select().from(schema.messages)).length, 0);
    });
    const [contact] = await rows();
    await database.update(schema.contacts).set({ tag: "Unsubscribed", notes: "Manual note", pipelineStage: "qualified", assignedTo: "owner",
      automationsPaused: true, followUp: "Call next week", customFields: { ...(contact.customFields as any),
        unsubscribed: true, smsSuppressed: true, whatsappSuppressed: true, manual: "retain" } }).where(eq(schema.contacts.id, contact.id));
    const [thread] = await database.select().from(schema.conversations);
    await database.insert(schema.messages).values({ userId: "owner", contactId: contact.id, conversationId: thread.id,
      direction: "inbound", content: "Retained conversation", contentType: "text", status: "delivered" });
    await database.insert(schema.contactNotes).values({ workspaceId: "owner", contactId: contact.id, content: "Retained CRM note" } as any);
    await t.test("later create and duplicate delivery cannot overwrite or add activities", async () => {
      await send(1, { email: "old@example.invalid" }, "customers/create"); await send(2);
      assert.equal((await rows()).length, 1); assert.equal((await rows())[0].email, "three@example.invalid");
      assert.equal((await database.select().from(schema.activityEvents)).length, 1);
    });
    await t.test("name/email/phone change on stable ID without duplication or CRM loss", async () => {
      await send(3, { first_name: "New", last_name: "Name", email: "new@example.invalid", phone: "+1 (555) 555-0123",
        email_marketing_consent: { state: "subscribed", opt_in_level: "confirmed_opt_in" }, sms_marketing_consent: { state: "not_subscribed" } });
      const [c] = await rows(); assert.equal(c.name, "New Name"); assert.equal(c.email, "new@example.invalid"); assert.equal(c.phone, "15555550123");
      assert.equal(c.tag, "Unsubscribed"); assert.equal(c.notes, "Manual note"); assert.equal(c.pipelineStage, "qualified");
      assert.equal(c.assignedTo, "owner"); assert.equal(c.followUp, "Call next week"); assert.equal(c.automationsPaused, true);
      const cf = c.customFields as any; assert.equal(cf.unsubscribed, true); assert.equal(cf.smsSuppressed, true);
      assert.equal(cf.whatsappSuppressed, true); assert.equal(cf.manual, "retain");
      assert.equal(cf.shopifyCustomerSync.consent.email_marketing_consent.state, "subscribed");
      assert.equal((await database.select().from(schema.conversations))[0].id, thread.id);
      assert.equal((await database.select().from(schema.messages)).length, 1);
      assert.equal((await database.select().from(schema.contactNotes)).length, 1);
    });
    await t.test("missing, null, blank and invalid fields preserve valid information and consent", async () => {
      await send(4, { email: null, phone: "", first_name: " ", last_name: null }); await send(5, { email: "invalid", phone: "12" });
      const [c] = await rows(); assert.equal(c.name, "New Name"); assert.equal(c.email, "new@example.invalid"); assert.equal(c.phone, "15555550123");
      assert.equal((c.customFields as any).shopifyCustomerSync.consent.email_marketing_consent.state, "subscribed");
    });
    await t.test("partial names preserve other name component", async () => {
      await send(6, { last_name: "Changed" }); assert.equal((await rows())[0].name, "New Changed");
    });
    await t.test("older and equal-version deliveries are ignored", async () => {
      const count = (await database.select().from(schema.activityEvents)).length;
      await send(4, { email: "stale@example.invalid" }); await send(6, { email: "tie@example.invalid" }, "customers/update", "123", "different-event");
      assert.equal((await rows())[0].email, "new@example.invalid");
      assert.equal((await database.select().from(schema.activityEvents)).length, count);
    });
    await t.test("concurrent create/update/retries converge on one contact", async () => {
      await Promise.all([send(8, { email: "latest@example.invalid" }, "customers/update", "456"),
        send(7, { email: "older@example.invalid" }, "customers/create", "456"), send(8, {}, "customers/update", "456")]);
      const matching = (await rows()).filter(c => (c.customFields as any).shopifyCustomerId === "456");
      assert.equal(matching.length, 1); assert.equal(matching[0].email, "latest@example.invalid");
    });
    await t.test("activity failure rolls back data and watermark, then retry succeeds", async () => {
      await client.exec("CREATE FUNCTION fail_activity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$; CREATE TRIGGER fail_activity BEFORE INSERT ON activity_events FOR EACH ROW EXECUTE FUNCTION fail_activity()");
      await assert.rejects(send(9, { email: "retry@example.invalid" })); assert.equal((await rows())[0].email, "new@example.invalid");
      await client.exec("DROP TRIGGER fail_activity ON activity_events"); await send(9, { email: "retry@example.invalid" });
      assert.equal((await rows())[0].email, "retry@example.invalid");
    });
    await t.test("shop authorization and tenant boundaries reject wrong installation", async () => {
      const [foreign] = await database.insert(schema.contacts).values({ userId: "foreign", name: "Foreign", primaryChannel: "shopify",
        customFields: { shopifyCustomerId: "123" }, email: "foreign@example.invalid" }).returning();
      await send(10, { email: "local@example.invalid" });
      assert.equal((await database.select().from(schema.contacts).where(eq(schema.contacts.id, foreign.id)))[0].email, "foreign@example.invalid");
      await assert.rejects(sync({ shop: "unknown.myshopify.com", topic: "customers/update", eventId: "unknown",
        body: { id: "123", updated_at: stamp(11) } }, database as any), e => e instanceof ShopifyCustomerSyncError && e.status === 403);
      await insertOwner("mismatch", "mismatch.myshopify.com", shop);
      await assert.rejects(sync({ shop: "mismatch.myshopify.com", topic: "customers/update", eventId: "mismatch",
        body: { id: "123", updated_at: stamp(11) } }, database as any), e => e instanceof ShopifyCustomerSyncError && e.status === 403);
    });
    await t.test("redaction tombstone prevents reintroducing changed-email customer", async () => {
      const token = createHmac("sha256", secret).update("shopify-privacy-v1:" + JSON.stringify([shop, "id:789"])).digest("hex");
      await database.insert(schema.shopifyPrivacyCustomerLocks).values({ identityHash: token });
      assert.equal(await send(11, { email: "changed@example.invalid" }, "customers/update", "789"), "suppressed");
      assert.ok(!(await rows()).some(c => (c.customFields as any).shopifyCustomerId === "789"));
    });
    await t.test("invalid source version and unsafe numeric IDs are rejected", async () => {
      await assert.rejects(send(12, { updated_at: "invalid" })); await assert.rejects(send(12, { id: Number.MAX_SAFE_INTEGER + 1 }));
    });
    await t.test("no outreach, campaigns, exports or lifecycle hooks are wired into synchronization", () => {
      const source = readFileSync("server/shopifyCustomerSync.ts", "utf8");
      for (const call of ["dispatchCommerceEventAutomation(", "sendMessage(", "createMessage(", "syncContactToHubSpotIfEnabled(", "storage.createContact(", "storage.updateContact("])
        assert.ok(!source.includes(call));
    });
    await t.test("same-tenant shared email/phone and more than 2000 contacts cannot redirect stable ID", async () => {
      await database.insert(schema.contacts).values(Array.from({ length: 2001 }, (_, n) => ({ userId: "owner", name: `Fixture ${n}`, primaryChannel: "shopify", customFields: {} })));
      const [shared] = await database.insert(schema.contacts).values({ userId: "owner", name: "Another customer", primaryChannel: "shopify",
        email: "shared@example.invalid", phone: "15555550124", customFields: { shopifyCustomerId: "999" } }).returning();
      await send(13, { email: "shared@example.invalid", phone: "15555550124" });
      assert.equal((await database.select().from(schema.contacts).where(eq(schema.contacts.id, contact.id)))[0].email, "shared@example.invalid");
      assert.equal((await database.select().from(schema.contacts).where(eq(schema.contacts.id, shared.id)))[0].name, "Another customer");
      assert.equal((await rows()).filter(c => (c.customFields as any).shopifyCustomerId === "123").length, 1);
      const { findContactForCommerceHints } = await import("../server/commerceEventPipeline");
      const resolved = await findContactForCommerceHints("owner", { shopifyCustomerId: "123", email: "shared@example.invalid", phone: "15555550124" }, "shopify", shop, database as any);
      assert.equal(resolved?.id, contact.id, "orders match the stable ID before shared email/phone, without the 2000-contact cap");
    });
    await t.test("controlled create effects are durable, quiet on updates, and once-only", async () => {
      const { processCustomerEffectEvent: process, customerEffectAdapters, customerEffectFence,
        customerWorkflowSupported, customerHubSpotAuthorized, customerEffectsSuppressed } = await import("../server/shopifyCustomerEffects");
      const { subscriptionService } = await import("../server/subscriptionService");
      const previousLimits = subscriptionService.getUserLimits;
      subscriptionService.getUserLimits = async () => ({ workflowsEnabled: true } as any);
      const originalFetch = globalThis.fetch;
      let exports = 0, workflowRuns = 0, loseResponse = false, failLookup = false;
      globalThis.fetch = async (url, options) => {
        const path = String(url);
        if (path.endsWith("/crm/v3/properties/contacts")) return new Response(JSON.stringify({ results: [] }), { status: 200 });
        if (path.includes("?limit=1")) return new Response("{}", { status: 200 });
        if (path.endsWith("/search")) { if (failLookup) return new Response("{}", { status: 503 });
          return new Response(JSON.stringify({ results: [] }), { status: 200 }); }
        if (path.endsWith("/crm/v3/objects/contacts") && options?.method === "POST") {
          exports++; if (loseResponse) throw new Error("response lost after provider acceptance");
          return new Response(JSON.stringify({ id: "fixture-remote" }), { status: 201 });
        }
        throw new Error("Unexpected provider request");
      };
      const [workflow] = await database.insert(schema.workflows).values({ userId: "owner", name: "Controlled CRM",
        isActive: true, triggerType: "shopify_customer_created", actions: [{ type: "tag", value: "Qualified" }] }).returning();
      await database.insert(schema.workflows).values({ userId: "owner", name: "Disabled CRM", isActive: false,
        triggerType: "shopify_customer_created", actions: [{ type: "tag", value: "Disabled" }] });
      const [hub] = await database.insert(schema.integrations).values({ userId: "owner", type: "hubspot", name: "Disposable HubSpot",
        isActive: true, config: { connectionStatus: "connected", syncOptions: ["sync_contacts"],
          accessToken: "fixture-only", shopifyCustomerExportAuthorized: true } }).returning();
      const fence = nativePool ? customerEffectFence : async (_shop: string, run: () => Promise<any>) => run();
      const adapters = { prepare: async (...args: Parameters<typeof customerEffectAdapters.prepare>) => {
        const prepared = await customerEffectAdapters.prepare(...args);
        if (prepared && args[0].kind === "workflow" && !nativePool) {
          return async (start: () => Promise<void>) => { await start(); workflowRuns++; return "completed" as const; };
        }
        return prepared;
      } };
      const getEvent = async (customer: string) => (await database.select().from(schema.activityEvents))
        .find(a => (a.eventData as any).customerId === customer && a.eventType === "shopify_customer_created")!;
      const run = async (id: string) => process(id, database as any, adapters, fence as any);
      try {
        await send(15, { email: "authorized@example.invalid" }, "customers/create", "30001");
        const event = await getEvent("30001");
        assert.equal((event.eventData as any).customerEffects.length, 2, "only enabled destinations are recorded");
        if (nativePool) await Promise.all([run(event.id), run(event.id)]); else await run(event.id);
        await run(event.id);
        await send(15, {}, "customers/create", "30001");
        await send(16, { email: "updated@example.invalid" }, "customers/update", "30001");
        await run(event.id);
        assert.equal(exports, 1);
        if (nativePool) {
          assert.equal((await database.select().from(schema.workflowExecutions).where(eq(schema.workflowExecutions.workflowId, workflow.id))).length, 1);
          assert.equal((await rows()).find(c => (c.customFields as any).shopifyCustomerId === "30001")!.tag, "Qualified");
        } else assert.equal(workflowRuns, 1);
        assert.equal((await database.select().from(schema.activityEvents)).filter(a => (a.eventData as any).customerId === "30001" && (a.eventData as any).customerEffects).length, 1);
        assert.equal((await rows()).find(c => (c.customFields as any).shopifyCustomerId === "30001")!.email, "updated@example.invalid");

        await database.update(schema.integrations).set({ isActive: false }).where(eq(schema.integrations.id, hub.id));
        await database.update(schema.workflows).set({ isActive: false }).where(eq(schema.workflows.id, workflow.id));
        await send(17, {}, "customers/create", "30002");
        assert.equal((await getEvent("30002")).eventData && ((await getEvent("30002")).eventData as any).customerEffects, undefined);
        assert.equal(exports, 1);
        assert.equal(customerWorkflowSupported({ ...workflow, actions: [{ type: "send_message_template", templateKey: "welcome" }] }), false,
          "marketing/channel authorization is not inferred from a populated email or phone");
        assert.equal(customerEffectsSuppressed({ ...contact, tag: "New", automationsPaused: false, customFields: { smsSuppressed: true } }), true);
        assert.equal(customerHubSpotAuthorized({ connectionStatus: "connected", syncOptions: ["sync_contacts"], accessToken: "fixture-only" }), false);

        await database.update(schema.workflows).set({ isActive: true }).where(eq(schema.workflows.id, workflow.id));
        await send(18, {}, "customers/create", "30003");
        const retryEvent = await getEvent("30003"); let preflights = 0, effects = 0;
        const retryAdapters = { prepare: async () => {
          if (++preflights === 1) throw new Error("temporary read failure");
          return async (start: () => Promise<void>) => { await start(); effects++; return "completed" as const; };
        } };
        await process(retryEvent.id, database as any, retryAdapters, fence as any);
        let fresh = (await database.select().from(schema.activityEvents).where(eq(schema.activityEvents.id, retryEvent.id)))[0];
        assert.equal((fresh.eventData as any).customerEffects[0].status, "pending");
        await database.update(schema.activityEvents).set({ eventData: { ...(fresh.eventData as any), customerEffects:
          (fresh.eventData as any).customerEffects.map((j: any) => ({ ...j, nextAttemptAt: undefined })) } }).where(eq(schema.activityEvents.id, fresh.id));
        await process(retryEvent.id, database as any, retryAdapters, fence as any);
        await process(retryEvent.id, database as any, retryAdapters, fence as any); assert.equal(effects, 1);

        await send(19, {}, "customers/create", "30004"); const uncertain = await getEvent("30004"); let attempts = 0;
        const uncertainAdapters = { prepare: async () => async (start: () => Promise<void>) => { await start(); attempts++; throw new Error("accepted but response lost"); } };
        await process(uncertain.id, database as any, uncertainAdapters, fence as any);
        await process(uncertain.id, database as any, uncertainAdapters, fence as any);
        fresh = (await database.select().from(schema.activityEvents).where(eq(schema.activityEvents.id, uncertain.id)))[0];
        assert.equal((fresh.eventData as any).customerEffects[0].status, "reconciliation_required"); assert.equal(attempts, 1);

        await send(20, {}, "customers/create", "30005"); const suppressed = await getEvent("30005");
        const c = (await rows()).find(c => (c.customFields as any).shopifyCustomerId === "30005")!;
        await database.update(schema.contacts).set({ tag: "Unsubscribed" }).where(eq(schema.contacts.id, c.id));
        await process(suppressed.id, database as any, uncertainAdapters, fence as any); assert.equal(attempts, 1);
        fresh = (await database.select().from(schema.activityEvents).where(eq(schema.activityEvents.id, suppressed.id)))[0];
        assert.equal((fresh.eventData as any).customerEffects[0].status, "skipped");
        await send(21, {}, "customers/create", "30006"); const noPlan = await getEvent("30006");
        subscriptionService.getUserLimits = async () => ({ workflowsEnabled: false } as any);
        await run(noPlan.id);
        fresh = (await database.select().from(schema.activityEvents).where(eq(schema.activityEvents.id, noPlan.id)))[0];
        assert.equal((fresh.eventData as any).customerEffects[0].status, "skipped");
        subscriptionService.getUserLimits = async () => ({ workflowsEnabled: true } as any);
        await send(22, {}, "customers/create", "30007"); const redacted = await getEvent("30007");
        await database.insert(schema.shopifyPrivacyCustomerLocks).values({ identityHash: createHmac("sha256", secret)
          .update("shopify-privacy-v1:" + JSON.stringify([shop, "id:30007"])).digest("hex") });
        await process(redacted.id, database as any, uncertainAdapters, fence as any); assert.equal(attempts, 1);
        fresh = (await database.select().from(schema.activityEvents).where(eq(schema.activityEvents.id, redacted.id)))[0];
        assert.equal((fresh.eventData as any).customerEffects[0].status, "skipped");
        const [messaging] = await database.insert(schema.workflows).values({ userId: "owner", name: "Messaging requires stage two", isActive: true,
          triggerType: "shopify_customer_created", actions: [{ type: "send_message_template", templateKey: "welcome" }] }).returning();
        await send(23, { email: "no-consent@example.invalid", phone: "15555550123" }, "customers/create", "30008");
        const noConsent = await getEvent("30008"); await run(noConsent.id);
        fresh = (await database.select().from(schema.activityEvents).where(eq(schema.activityEvents.id, noConsent.id)))[0];
        assert.equal((fresh.eventData as any).customerEffects.find((j: any) => j.targetId === messaging.id).status, "skipped");
        assert.equal((await database.select().from(schema.messages)).length, 1, "no workflow sends without channel authorization");
        await database.update(schema.workflows).set({ isActive: false }).where(eq(schema.workflows.userId, "owner"));
        await database.update(schema.integrations).set({ isActive: true }).where(eq(schema.integrations.id, hub.id));
        await send(24, { email: "uncertain-export@example.invalid" }, "customers/create", "30009");
        const lost = await getEvent("30009"); loseResponse = true; const beforeExports = exports;
        await run(lost.id); await run(lost.id);
        fresh = (await database.select().from(schema.activityEvents).where(eq(schema.activityEvents.id, lost.id)))[0];
        assert.equal((fresh.eventData as any).customerEffects[0].status, "reconciliation_required");
        assert.equal(exports, beforeExports + 1, "an accepted export with a lost response is never resent"); loseResponse = false;
        await send(25, { email: "retry-export@example.invalid" }, "customers/create", "30010");
        const readFailure = await getEvent("30010"); failLookup = true; await run(readFailure.id);
        assert.equal(exports, beforeExports + 1, "lookup failures must not fall through to contact creation");
        fresh = (await database.select().from(schema.activityEvents).where(eq(schema.activityEvents.id, readFailure.id)))[0];
        assert.equal((fresh.eventData as any).customerEffects[0].status, "pending"); failLookup = false;
        await database.update(schema.activityEvents).set({ eventData: { ...(fresh.eventData as any), customerEffects:
          (fresh.eventData as any).customerEffects.map((j: any) => ({ ...j, nextAttemptAt: undefined })) } }).where(eq(schema.activityEvents.id, fresh.id));
        await run(readFailure.id); await run(readFailure.id); assert.equal(exports, beforeExports + 2);
      } finally { globalThis.fetch = originalFetch; subscriptionService.getUserLimits = previousLimits;
        if (nativePool) await (await import("../drizzle/db")).db.$client.end(); }
    });
    if (nativePool) await t.test("privacy fence on a separate connection blocks delivery until suppression commits", async () => {
      let entered!: () => void, release!: () => void;
      const started = new Promise<void>(r => { entered = r; }); const hold = new Promise<void>(r => { release = r; });
      const redact = database.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${shop}, 0))`);
        entered(); await hold;
        const identityHash = createHmac("sha256", secret).update("shopify-privacy-v1:" + JSON.stringify([shop, "id:987"])).digest("hex");
        await tx.insert(schema.shopifyPrivacyCustomerLocks).values({ identityHash });
      });
      await started;
      let finished = false;
      const delivery = send(14, {}, "customers/update", "987").then(result => { finished = true; return result; });
      await new Promise(r => setTimeout(r, 50)); assert.equal(finished, false);
      release(); await redact; assert.equal(await delivery, "suppressed");
    });
  } finally {
    await client.close();
    if (admin) { await admin.query("DROP SCHEMA " + namespace + " CASCADE"); await admin.end(); }
  }
});
