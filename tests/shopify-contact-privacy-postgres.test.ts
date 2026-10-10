import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { eq, sql } from "drizzle-orm";
import * as schema from "../shared/schema";
import { classifyShopifyOwnerEmail } from "../shared/shopifyContactPrivacy";
import { captureShopifyOwnerEmail } from "../server/shopifyContactCapture";

const fixtureEmail = ["contact", "example.invalid"].join("@");
const secondEmail = ["support", "example.invalid"].join("@");

test("real PostgreSQL capture, uninstall/reinstall, scoped redaction, late writes, rollback and external erasure", async () => {
  const target = process.env.SHOPIFY_TEST_DATABASE_URL;
  assert.ok(target, "An explicit disposable Shopify test database is required");
  const url = new URL(target);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
  assert.equal(url.pathname, "/whachat_shopify_test");
  const admin = new Pool({ connectionString: target });
  const namespace = "shopify_contact_privacy_test";
  await admin.query("CREATE SCHEMA " + namespace);
  url.searchParams.set("options", "-c search_path=" + namespace);
  process.env.DATABASE_URL = url.toString();
  process.env.SHOPIFY_API_KEY = "fixture-only";
  process.env.SHOPIFY_API_SECRET = "fixture-only";
  delete process.env.GHL_MARKETPLACE_PRO_PLAN_ID;
  const { db } = await import("../drizzle/db");
  const { persistShopifyOwnerEmailCapture: persist, readShopifySupportContact: read,
    saveShopifySupportContact: save, uninstallShopifyStore: uninstall, withShopifyPrivacyFence: fence, withShopifyMailPrivacyFence: mailFence } =
      await import("../server/shopifyContactService");
  const { redactShopifyStore: redact } = await import("../server/shopifyPrivacyRedaction");
  const { processShopifyExternalErasureTasks: external } = await import("../server/shopifyExternalErasure");
  const tables = [schema.users, schema.chats, schema.contacts, schema.conversations, schema.messages, schema.activityEvents,
    schema.integrations, schema.shopifyShopTrials, schema.shopifyMerchantContacts, schema.shopifyPrivacyErasureTasks,
    schema.workflows, schema.workflowExecutions, schema.webhooks, schema.webhookDeliveries,
    schema.flowJobs, schema.contactNotes, schema.appointments, schema.calendlyCanceledEventTombstones];
  const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
  try {
    for (const table of tables) {
      const config = getTableConfig(table as PgTable);
      const columns = config.columns.map(column => quote(column.name) + " " +
        (column.enumValues?.length ? "text" : column.getSQLType()) +
        (column.name === "id" ? " PRIMARY KEY DEFAULT gen_random_uuid()::text" : ""));
      if (config.name === "shopify_merchant_contacts") columns.push("PRIMARY KEY (user_id)");
      await db.execute(sql.raw("CREATE TABLE " + quote(config.name) + " (" + columns.join(",") + ")"));
    }
    // The fixture enforces actual cascade behavior relied on by the production redaction.
    for (const query of [
      "ALTER TABLE conversations ADD FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE",
      "ALTER TABLE messages ADD FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE",
      "ALTER TABLE messages ADD FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE",
      "ALTER TABLE activity_events ADD FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE",
      "ALTER TABLE activity_events ADD FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE",
    ]) await db.execute(sql.raw(query));
    async function user(id: string, extra: Record<string, unknown> = {}) {
      const [row] = await db.insert(schema.users).values({
        id, name: "Fixture", email: [id, "shopify.whachatcrm.com"].join("@"), password: "fixture-only",
        shopifyShop: id + ".myshopify.com", shopifyAccessToken: "fixture-only", shopifySubscriptionStatus: "pending",
        shopifyInstalledAt: new Date("2026-10-09T12:00:00Z"), billingPlan: "pro", subscriptionPlan: "pro",
        subscriptionStatus: "active", trialStatus: "active", trialStartedAt: new Date("2026-10-09T12:00:00Z"),
        trialEndsAt: new Date("2026-10-23T12:00:00Z"), ...extra,
      } as any).returning();
      return row;
    }
    async function integration(userId: string, shop: string) {
      await db.insert(schema.integrations).values({
        userId, type: "shopify", name: "Shopify", isActive: true,
        config: { shopUrl: shop, retainedOwnerEmail: fixtureEmail }, accessToken: "fixture-only", refreshToken: "fixture-only",
      });
    }
    const initial = await user("fixture");
    const input = { userId: initial.id, shop: initial.shopifyShop!, accessToken: "fixture-only" };
    const logs: string[] = [];
    const captured = await captureShopifyOwnerEmail(input, {
      fetch: async () => classifyShopifyOwnerEmail(fixtureEmail), persist, emit: line => logs.push(line),
    });
    assert.equal(captured.status, "success");
    let [stored] = await db.select().from(schema.users).where(eq(schema.users.id, initial.id));
    assert.ok(stored.shopifyOwnerEmail === fixtureEmail);
    const [report] = await db.select().from(schema.shopifyMerchantContacts).where(eq(schema.shopifyMerchantContacts.userId, initial.id));
    assert.equal(report.captureSource, "shop.email");
    assert.ok(report.captureAt instanceof Date);
    for (const raw of [null, "invalid", ["fixture", "shopify.whachatcrm.com"].join("@")]) {
      await captureShopifyOwnerEmail(input, { fetch: async () => classifyShopifyOwnerEmail(raw), persist, emit: line => logs.push(line) });
      [stored] = await db.select().from(schema.users).where(eq(schema.users.id, initial.id));
      assert.ok(stored.shopifyOwnerEmail === fixtureEmail, "A failed capture must retain an existing valid contact");
    }
    assert.ok(!logs.join("").includes(fixtureEmail));

    assert.ok(await save(initial.id, { action: "confirm", email: secondEmail }));
    assert.ok((await read(initial.id)).suggestedEmail === secondEmail);
    assert.ok(await save(initial.id, { action: "dismiss" }));
    assert.ok((await read(initial.id)).suggestedEmail === secondEmail, "Dismissing a prompt must not erase a confirmed contact");
    assert.ok(await save(initial.id, { action: "remove" }));
    assert.ok(!(await read(initial.id)).confirmed);
    assert.ok(await save(initial.id, { action: "confirm", email: secondEmail }));
    [stored] = await db.select().from(schema.users).where(eq(schema.users.id, initial.id));
    assert.ok(stored.email === initial.email && stored.billingPlan === "pro");
    await integration(initial.id, input.shop);
    await db.insert(schema.shopifyShopTrials).values({
      canonicalShop: input.shop, status: "granted", originalUserId: initial.id,
      trialStartedAt: initial.trialStartedAt, trialEndsAt: initial.trialEndsAt,
    });
    await uninstall(input.shop);
    assert.ok(!(await read(initial.id)).available);
    assert.ok(!await save(initial.id, { action: "confirm", email: fixtureEmail }));
    assert.ok(!await persist(input, classifyShopifyOwnerEmail(fixtureEmail), new Date()));
    [stored] = await db.select().from(schema.users).where(eq(schema.users.id, initial.id));
    assert.ok(stored.shopifyOwnerEmail === fixtureEmail);
    assert.equal(stored.trialEndsAt?.getTime(), initial.trialEndsAt?.getTime());
    assert.equal((await db.select().from(schema.shopifyShopTrials)).length, 1);
    assert.ok((await db.select().from(schema.integrations))[0].isActive === false);
    await db.update(schema.users).set({ shopifyAccessToken: "fixture-only", shopifySubscriptionStatus: "active",
      billingPlan: "pro", subscriptionPlan: "pro", subscriptionStatus: "active" }).where(eq(schema.users.id, initial.id));
    await db.update(schema.integrations).set({ isActive: true }).where(eq(schema.integrations.userId, initial.id));
    assert.ok((await read(initial.id)).confirmed);
    [stored] = await db.select().from(schema.users).where(eq(schema.users.id, initial.id));
    assert.equal(stored.trialEndsAt?.getTime(), initial.trialEndsAt?.getTime());
    assert.equal((await db.select().from(schema.shopifyShopTrials)).length, 1);

    const [imported] = await db.insert(schema.contacts).values({ userId: initial.id, name: "Fixture imported", source: "shopify",
      email: fixtureEmail, customFields: { shopifyCustomerId: "1", lastCommerceSource: "shopify",
      lastCommerceMetadata: { shop: input.shop, email: fixtureEmail } } }).returning();
    const [mixed] = await db.insert(schema.contacts).values({ userId: initial.id, name: "Independent", source: "manual",
      whatsappId: "fixture-independent", email: fixtureEmail, primaryChannel: "shopify",
      customFields: { independent: "keep", shopifyCustomerId: "2", lastCommerceSource: "shopify",
        lastCommerceMetadata: { shop: input.shop, email: fixtureEmail }, commerceThreadKey: "shopify:2" } }).returning();
    const [thread] = await db.insert(schema.conversations).values({ userId: initial.id, contactId: imported.id, channel: "shopify" }).returning();
    const [independentThread] = await db.insert(schema.conversations).values({ userId: initial.id, contactId: mixed.id, channel: "whatsapp" }).returning();
    await db.insert(schema.messages).values({ userId: initial.id, contactId: imported.id, conversationId: thread.id,
      direction: "inbound", content: "Fixture order", externalMessageId: "shopify:fixture" });
    await db.insert(schema.messages).values({ userId: initial.id, contactId: mixed.id, conversationId: independentThread.id,
      direction: "inbound", content: "Independent message" });
    await db.insert(schema.activityEvents).values({ userId: initial.id, contactId: mixed.id, eventType: "shopify_customer_created",
      eventData: { shop: input.shop, email: fixtureEmail } });
    const [workflow] = await db.insert(schema.workflows).values({ userId: initial.id, name: "Fixture" }).returning();
    await db.insert(schema.workflowExecutions).values({ workflowId: workflow.id, conversationId: thread.id,
      triggerData: { trigger: "shopify_order_created", metadata: { email: fixtureEmail } } });
    const [hook] = await db.insert(schema.webhooks).values({ userId: initial.id, name: "Fixture", url: "fixture",
      secret: "fixture-only", events: [] }).returning();
    await db.insert(schema.webhookDeliveries).values({ webhookId: hook.id, event: "shopify_customer_created",
      payload: { email: fixtureEmail }, responseBody: fixtureEmail });
    await db.insert(schema.flowJobs).values({ userId: initial.id, contactId: mixed.id, conversationId: thread.id,
      flowId: "fixture", nodeId: "fixture", runAt: new Date(), payload: { source: "shopify", email: fixtureEmail } });

    // A genuine failed transaction must preserve contacts and enqueue no false completion.
    await db.execute(sql.raw("CREATE FUNCTION reject_fixture_redaction() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.shopify_subscription_status = 'redacted' THEN RAISE EXCEPTION 'fixture redaction failure'; END IF; RETURN NEW; END $$"));
    await db.execute(sql.raw("CREATE TRIGGER reject_fixture_redaction BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION reject_fixture_redaction()"));
    await assert.rejects(redact(input.shop));
    assert.equal((await db.select().from(schema.shopifyPrivacyErasureTasks)).length, 0);
    assert.equal((await db.select().from(schema.contacts)).length, 2);
    await db.execute(sql.raw("DROP TRIGGER reject_fixture_redaction ON users"));

    const result = await redact(input.shop);
    assert.ok(result.databaseErased && result.externalErasurePending);
    [stored] = await db.select().from(schema.users).where(eq(schema.users.id, initial.id));
    assert.ok(stored.shopifyOwnerEmail === null && stored.shopifyShop === null && stored.shopifyAccessToken === null);
    assert.ok(stored.email !== initial.email);
    assert.equal(stored.billingPlan, "pro");
    assert.equal(stored.trialEndsAt?.getTime(), initial.trialEndsAt?.getTime());
    for (const table of [schema.integrations, schema.shopifyMerchantContacts, schema.shopifyShopTrials,
      schema.activityEvents, schema.workflowExecutions, schema.webhookDeliveries, schema.flowJobs])
      assert.equal((await db.select().from(table)).length, 0);
    const [remaining] = await db.select().from(schema.contacts);
    assert.equal(remaining.id, mixed.id);
    assert.ok(remaining.email === null);
    assert.equal((remaining.customFields as any).independent, "keep");
    assert.ok(!JSON.stringify(remaining.customFields).includes(fixtureEmail));
    assert.equal((await db.select().from(schema.messages)).length, 1);
    assert.equal((await db.select().from(schema.conversations)).length, 1);
    assert.ok(!(await read(initial.id)).available);
    assert.ok(!await persist(input, classifyShopifyOwnerEmail(fixtureEmail), new Date()));
    assert.ok(!await save(initial.id, { action: "confirm", email: fixtureEmail }));
    assert.equal((await db.select().from(schema.shopifyMerchantContacts)).length, 0);
    await redact(input.shop); // webhook redelivery is safe
    assert.equal((await db.select().from(schema.messages)).length, 1);

    // Legacy partial redaction: retained integration maps the row even after shopifyShop was cleared.
    const partial = await user("partial", { shopifyShop: null, shopifyOwnerEmail: fixtureEmail });
    await integration(partial.id, "partial.myshopify.com");
    await redact("partial.myshopify.com");
    const [clearedPartial] = await db.select().from(schema.users).where(eq(schema.users.id, partial.id));
    assert.ok(clearedPartial.shopifyOwnerEmail === null);

    // A delayed old-shop request cannot erase the current store's contact or paid access.
    const other = await user("current", { shopifyOwnerEmail: secondEmail });
    await integration(other.id, "old.myshopify.com");
    await integration(other.id, other.shopifyShop!);
    const [oldContact] = await db.insert(schema.contacts).values({ userId: other.id, name: "Old fixture", source: "shopify",
      email: fixtureEmail, customFields: { lastCommerceSource: "shopify", lastCommerceMetadata: { shop: "old.myshopify.com", email: fixtureEmail } } }).returning();
    const [currentContact] = await db.insert(schema.contacts).values({ userId: other.id, name: "Current fixture", source: "shopify",
      email: secondEmail, customFields: { lastCommerceSource: "shopify", lastCommerceMetadata: { shop: other.shopifyShop, email: secondEmail } } }).returning();
    await redact("old.myshopify.com");
    assert.equal((await db.select().from(schema.contacts).where(eq(schema.contacts.id, oldContact.id))).length, 0);
    assert.equal((await db.select().from(schema.contacts).where(eq(schema.contacts.id, currentContact.id))).length, 1);
    const [untouched] = await db.select().from(schema.users).where(eq(schema.users.id, other.id));
    assert.ok(untouched.shopifyOwnerEmail === secondEmail && untouched.shopifyShop === other.shopifyShop);

    // Fenced in-flight ingestion finishes before erasure, and late arrivals cannot recreate data.
    await db.update(schema.users).set({ shopifyAccessToken: "fixture-only", shopifySubscriptionStatus: "active" }).where(eq(schema.users.id, other.id));
    let entered!: () => void; const started = new Promise<void>(r => { entered = r; });
    let release!: () => void; const hold = new Promise<void>(r => { release = r; });
    const ingest = fence(other.shopifyShop!, async () => {
      entered(); await hold;
      await db.insert(schema.shopifyMerchantContacts).values({ userId: other.id, canonicalShop: other.shopifyShop!, supportEmail: secondEmail });
    });
    await started;
    const erase = redact(other.shopifyShop!);
    release();
    await Promise.all([ingest, erase]);
    let late = false;
    await fence(other.shopifyShop!, async () => { late = true; });
    assert.ok(!late);
    let staleMail = false;
    await mailFence(other.id, other.shopifyShop!, async () => { staleMail = true; return true; });
    assert.ok(!staleMail);
    assert.equal((await db.select().from(schema.shopifyMerchantContacts)).length, 0);

    // A startup/migration backfill must not reconstruct shop mappings from neutral redacted identities.
    await db.execute(sql.raw(readFileSync("migrations/0084_shopify_shop_trials.sql", "utf8")));
    assert.equal((await db.select().from(schema.shopifyShopTrials)).length, 0);
    const beforeExternal = (await db.select().from(schema.shopifyPrivacyErasureTasks)).length;
    assert.ok(beforeExternal > 0);
    const pending = await external({ eraseAndVerify: async () => ({ verified: false }) });
    assert.equal(pending.completed, 0);
    assert.equal((await db.select().from(schema.shopifyPrivacyErasureTasks)).length, beforeExternal);
    await external({ eraseAndVerify: async () => { throw new Error("fixture failure"); } });
    assert.equal((await db.select().from(schema.shopifyPrivacyErasureTasks)).length, beforeExternal);
    const completed = await external({ eraseAndVerify: async window => {
      assert.ok(window.to instanceof Date);
      assert.ok(!JSON.stringify(window).includes(fixtureEmail));
      return { verified: true };
    } });
    assert.equal(completed.completed, beforeExternal);
    assert.equal((await db.select().from(schema.shopifyPrivacyErasureTasks)).length, 0);
  } finally {
    await (db as any).$client.end();
    await admin.query("DROP SCHEMA " + namespace + " CASCADE");
    await admin.end();
  }
});
