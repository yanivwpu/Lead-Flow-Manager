import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { getTableConfig } from "drizzle-orm/pg-core";
import { eq, sql } from "drizzle-orm";
import { users, shopifyShopTrials } from "../shared/schema";

/** Real atomic-claim regression, isolated schema on a disposable CI PostgreSQL database. */
test("trial claims are atomic, idempotent, fail closed, and preserve paid/reinstall history", async () => {
  const target = process.env.SHOPIFY_TEST_DATABASE_URL;
  assert.ok(target, "SHOPIFY_TEST_DATABASE_URL is required; never use production DATABASE_URL");
  const url = new URL(target);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
  assert.equal(url.pathname, "/whachat_shopify_test");
  const admin = new Pool({ connectionString: target });
  const schemaName = "shopify_trial_test";
  await admin.query(`CREATE SCHEMA ${schemaName}`);
  url.searchParams.set("options", `-c search_path=${schemaName}`);
  process.env.DATABASE_URL = url.toString();
  // These tests have no marketplace configuration or external service access.
  delete process.env.GHL_MARKETPLACE_PRO_PLAN_ID;
  const { db } = await import("../drizzle/db");
  const { claimShopifyShopTrialForInstall: claim } = await import("../server/shopifyShopTrialService");
  const { setShopifyShopTrialLedgerReady: ready } = await import("../server/shopifyShopTrialLedgerReady");
  const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
  function tableDDL(table: typeof users | typeof shopifyShopTrials) {
    const config = getTableConfig(table);
    const columns = config.columns.map(c => {
      // Enum columns are text in this isolated fixture; all relevant production values are retained.
      const type = c.enumValues?.length ? "text" : c.getSQLType();
      return quote(c.name) + " " + type + (c.name === "id" ? " PRIMARY KEY" : "");
    });
    if (config.name === "shopify_shop_trials") {
      columns.push("UNIQUE (canonical_shop)");
      columns.push("FOREIGN KEY (original_user_id) REFERENCES users(id) ON DELETE SET NULL");
    }
    return `CREATE TABLE ${quote(config.name)} (${columns.join(", ")})`;
  }
  try {
    await db.execute(sql.raw(tableDDL(users)));
    await db.execute(sql.raw(tableDDL(shopifyShopTrials)));
    // Fixture defaults needed by the insert performed by the real production claim.
    await db.execute(sql.raw("ALTER TABLE shopify_shop_trials ALTER COLUMN id SET DEFAULT gen_random_uuid()::text"));
    async function create(id: string, patch: Record<string, unknown> = {}) {
      const [row] = await db.insert(users).values({
        id, name: "test", email: id + "@example.test", password: "test-only",
        billingPlan: "free", subscriptionStatus: "active", trialStatus: "none",
        shopifyShop: id + ".myshopify.com", shopifyAccessToken: "test-only",
        shopifySubscriptionStatus: "pending", ...patch,
      } as any).returning();
      return row;
    }
    const now = new Date("2026-10-09T01:37:00Z");
    const initial = await create("first");
    ready(false);
    assert.equal((await claim({ canonicalShop: initial.shopifyShop!, user: initial, now })).reason, "ledger_not_ready");
    assert.equal((await db.select().from(shopifyShopTrials)).length, 0);
    ready(true);
    const results = await Promise.all(Array.from({ length: 6 }, () => claim({
      canonicalShop: initial.shopifyShop!, user: initial, now, requireInstalledShop: true,
    })));
    assert.equal(results.filter(r => r.granted).length, 1);
    const [first] = await db.select().from(users).where(eq(users.id, initial.id));
    assert.equal(first.trialEndsAt?.toISOString(), "2026-10-23T01:37:00.000Z");
    assert.equal((await db.select().from(shopifyShopTrials)).length, 1);

    // Ordinary uninstall/reinstall preserves the original trial and ledger.
    await db.update(users).set({ shopifyAccessToken: null, shopifySubscriptionStatus: "uninstalled" }).where(eq(users.id, first.id));
    assert.equal((await claim({ canonicalShop: first.shopifyShop!, user: first, now, requireInstalledShop: true })).reason, "installation_unavailable");
    await db.update(users).set({ shopifyAccessToken: "reinstalled-test", shopifySubscriptionStatus: "pending" }).where(eq(users.id, first.id));
    assert.equal((await claim({ canonicalShop: first.shopifyShop!, user: first, now: new Date("2026-10-10"), requireInstalledShop: true })).granted, false);
    const [reinstalled] = await db.select().from(users).where(eq(users.id, first.id));
    assert.equal(reinstalled.trialEndsAt?.toISOString(), first.trialEndsAt?.toISOString());

    // Real transaction failure after ledger insertion rolls back both writes; retry can claim once.
    const rollback = await create("rollback");
    await db.execute(sql.raw(`CREATE FUNCTION reject_test_trial() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.id = 'rollback' THEN RAISE EXCEPTION 'test transaction failure'; END IF; RETURN NEW; END $$`));
    await db.execute(sql.raw("CREATE TRIGGER reject_test_trial BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION reject_test_trial()"));
    await assert.rejects(claim({ canonicalShop: rollback.shopifyShop!, user: rollback, now }));
    assert.equal((await db.select().from(shopifyShopTrials).where(eq(shopifyShopTrials.canonicalShop, rollback.shopifyShop!))).length, 0);
    await db.execute(sql.raw("DROP TRIGGER reject_test_trial ON users"));
    assert.equal((await claim({ canonicalShop: rollback.shopifyShop!, user: rollback, now })).granted, true);

    for (const status of ["granted", "backfilled", "blocked_conflict", "blocked_unknown_history"]) {
      const user = await create(status);
      await db.insert(shopifyShopTrials).values({ canonicalShop: user.shopifyShop!, status,
        trialPlan: "pro_ai", trialConsumedAt: now, originalUserId: user.id, createdAt: now, updatedAt: now });
      assert.equal((await claim({ canonicalShop: user.shopifyShop!, user, now })).granted, false);
      const [unchanged] = await db.select().from(users).where(eq(users.id, user.id));
      assert.equal(unchanged.trialEndsAt, null);
    }
    const paid = await create("paid", { billingPlan: "pro", subscriptionStatus: "active",
      shopifySubscriptionStatus: "active", shopifyChargeId: "existing-charge" });
    assert.equal((await claim({ canonicalShop: paid.shopifyShop!, user: paid, now })).granted, false);
    const [stillPaid] = await db.select().from(users).where(eq(users.id, paid.id));
    assert.equal(stillPaid.billingPlan, "pro");
    assert.equal(stillPaid.shopifyChargeId, "existing-charge");
    assert.equal(stillPaid.trialEndsAt, null);

    // The eligibility check uses the locked DB row even if the caller holds an old free snapshot.
    const stale = await create("stale");
    await db.update(users).set({ billingPlan: "pro", subscriptionStatus: "active" }).where(eq(users.id, stale.id));
    assert.equal((await claim({ canonicalShop: stale.shopifyShop!, user: stale, now })).granted, false);
    const [current] = await db.select().from(users).where(eq(users.id, stale.id));
    assert.equal(current.billingPlan, "pro");
    assert.equal(current.trialEndsAt, null);

    // User deletion retains consumption through ON DELETE SET NULL.
    await db.delete(users).where(eq(users.id, first.id));
    const [consumed] = await db.select().from(shopifyShopTrials).where(eq(shopifyShopTrials.canonicalShop, first.shopifyShop!));
    assert.equal(consumed.originalUserId, null);
    const replacement = await create("replacement", { shopifyShop: first.shopifyShop });
    assert.equal((await claim({ canonicalShop: first.shopifyShop!, user: replacement, now })).granted, false);
  } finally {
    ready(false);
    await db.$client.end();
    await admin.query(`DROP SCHEMA ${schemaName} CASCADE`);
    await admin.end();
  }
});
