import { variantAvailability } from "../shared/commerceCatalog";
import { validateCommerceDraft } from "../shared/commerceGrounding";
import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { catalogFixture } from "./shopify-catalog-fixture";
import {
  catalogProducts,
  catalogSources,
  catalogVariants,
  catalogEvents,
  users,
} from "../shared/schema";
import { createCommerceStore } from "../server/salesCatalog/commerceStore";
import { ensureCatalogSource } from "../server/salesCatalog/shopify/installation";
import { createShopifyCatalogSync } from "../server/salesCatalog/shopify/sync";
import { CatalogApiError } from "../server/salesCatalog/shopify/api";
import { catalogReadiness } from "../server/salesCatalog/shopify/readiness";
import { createShopifyLiveProvider } from "../server/aiLiveBusinessData/providers/shopifyProvider";
import {
  fixtureInventoryRequest,
  inventoryDue,
} from "./shopify-inventory-fixture";

async function setup(count = 65) {
  const f = await catalogFixture(),
    db = f.database;
  const source = (await ensureCatalogSource(db, "tenant-a"))!;
  const full = new Date(Date.now() - 2 * 60 * 60_000),
    old = new Date(Date.now() - 20 * 60_000);
  await db
    .update(catalogSources)
    .set({
      status: "ready",
      currency: "USD",
      allowedHosts: ["fixture-a.myshopify.com"],
      grantedScopes: ["read_products", "read_inventory"],
      initialSyncCompletedAt: full,
      lastSyncAt: full,
      requestedAt: full,
      nextAttemptAt: new Date(Date.now() + 86400000),
    })
    .where(eq(catalogSources.id, source.id));
  await db.insert(catalogProducts).values(
    Array.from({ length: count }, (_, i) => ({
      id: `p${i}`,
      userId: "tenant-a",
      sourceId: source.id,
      externalId: `gid://shopify/Product/${i + 1}`,
      title: `Snowboard ${i}`,
      description: "Snowboard",
      searchText: "snowboard",
      status: "ACTIVE",
      published: true,
      complete: true,
      variantCount: 1,
      providerUpdatedAt: full,
    })),
  );
  await db.insert(catalogVariants).values(
    Array.from({ length: count }, (_, i) => ({
      id: `v${i}`,
      userId: "tenant-a",
      sourceId: source.id,
      productId: `p${i}`,
      externalId: `gid://shopify/ProductVariant/${i + 1}`,
      inventoryItemId: `gid://shopify/InventoryItem/${i + 1}`,
      title: "Size 150",
      options: [{ name: "Size", value: "150" }],
      price: "699.95",
      currency: "USD",
      tracked: true,
      quantity: 5,
      inventoryPolicy: "DENY",
      availableForSale: true,
      requiresComponents: false,
      verifiedAt: old,
      providerUpdatedAt: full,
      generation: "full",
    })),
  );
  return { ...f, db, source, full };
}

test("expiry recovers using rotating batches, not full imports; idle stores make no API calls", async () => {
  const f = await setup(),
    { db, source } = f;
  let calls = 0,
    largest = 0;
  const fixture = fixtureInventoryRequest(db);
  const factory =
    (shop: string, token: string) =>
    async (q: string, v?: Record<string, unknown>) => {
      calls++;
      largest = Math.max(largest, (v?.ids as string[]).length);
      assert.doesNotMatch(q, /CatalogIds|CatalogProduct|media\(/);
      return fixture(shop, token)(q, v);
    };
  const store = createCommerceStore(db, factory),
    sync = createShopifyCatalogSync(db, factory);
  try {
    const before = await db.select().from(users);
    assert.equal(await store.eligibleCount("tenant-a", source.id), 0);
    let ready = await catalogReadiness(db, store, "tenant-a");
    assert.equal(ready.publishedProductCount, 65);
    assert.equal(ready.inventoryUnverifiedProductCount, 65);
    await store.markInventoryActivity("tenant-b", source.id);
    assert.equal(await sync.tick(), false);
    await store.markInventoryActivity("tenant-a", source.id);
    assert.equal(await sync.tick(), true);
    assert.equal(calls, 1);
    assert.equal(largest, 50);
    assert.equal(await store.eligibleCount("tenant-a", source.id), 50);
    await inventoryDue(db, source.id);
    await sync.tick();
    assert.equal(calls, 2);
    assert.equal(await store.eligibleCount("tenant-a", source.id), 65);
    ready = await catalogReadiness(db, store, "tenant-a");
    assert.equal(ready.inventoryUnverifiedProductCount, 0);
    assert.equal(ready.freshness, "fresh");
    const [after] = await db
      .select()
      .from(catalogSources)
      .where(eq(catalogSources.id, source.id));
    assert.deepEqual(after.lastSyncAt, f.full);
    assert.equal(after.status, "ready");
    await inventoryDue(db, source.id);
    await sync.tick();
    assert.equal(calls, 2, "fresh working set needs no additional calls");
    await db
      .update(catalogSources)
      .set({
        checkpoint: { inventory: { activeUntil: Date.now() - 1 } },
        nextAttemptAt: new Date(),
      })
      .where(eq(catalogSources.id, source.id));
    await sync.tick();
    assert.equal(
      calls,
      2,
      "expired activity window stops inventory and metadata polling",
    );
    assert.deepEqual(await db.select().from(users), before);
  } finally {
    await f.cleanup();
  }
});

test("live recommendations verify exact variants, fail closed and share durable quota/backoff with the worker", async () => {
  const f = await setup(3),
    { db, source } = f;
  let calls = 0,
    fail = false,
    zero = false,
    throttle = false,
    price = "699.95";
  const fixture = fixtureInventoryRequest(db, (n) => ({
    ...n,
    inventoryQuantity: zero ? 0 : 5,
    price,
    availableForSale: !zero,
  }));
  const factory =
    (shop: string, token: string) =>
    async (q: string, v?: Record<string, unknown>) => {
      calls++;
      if (fail) throw new CatalogApiError("throttled", 60_000);
      return {
        ...(await fixture(shop, token)(q, v)),
        ...(throttle
          ? { __throttle: { currentlyAvailable: 0, restoreRate: 1 } }
          : {}),
      };
    };
  const store = createCommerceStore(db, factory),
    sync = createShopifyCatalogSync(db, factory),
    provider = createShopifyLiveProvider(store, (id) =>
      catalogReadiness(db, store, id),
    );
  try {
    const records = await provider.query({
      userId: "tenant-a",
      message: "Recommend a snowboard",
    });
    assert.equal(records.length, 3);
    assert.equal(calls, 1);
    assert.ok(
      records.every(
        (r) =>
          r.data.purchaseVerified === true &&
          r.data.price === "699.95" &&
          r.data.currency === "USD" &&
          r.data.productUrl === null,
      ),
    );
    assert.deepEqual(
      await provider.query({
        userId: "tenant-a",
        message: "Recommend a snowboard",
      }),
      [],
    );
    assert.equal(calls, 1, "concurrent/replayed reads cannot bypass cooldown");
    await inventoryDue(db, source.id);
    price = "700.000001";
    assert.deepEqual(
      await provider.query({
        userId: "tenant-a",
        message: "Recommend a snowboard under $700",
      }),
      [],
      "a live price increase must still respect the exact budget",
    );
    await inventoryDue(db, source.id);
    zero = true;
    assert.deepEqual(
      await provider.query({
        userId: "tenant-a",
        message: "Recommend a snowboard",
      }),
      [],
    );
    assert.equal(await store.eligibleCount("tenant-a", source.id), 0);
    assert.ok(
      (await store.browse("tenant-a", source.id, {})).items.every(
        (p) => p.published && p.availability === "out_of_stock",
      ),
    );
    // Missed stock-restoration webhook is recovered by inventory-only polling, including sold-out variants.
    zero = false;
    await db
      .update(catalogVariants)
      .set({ verifiedAt: new Date(Date.now() - 20 * 60_000) });
    await inventoryDue(db, source.id);
    await sync.tick();
    assert.equal(await store.eligibleCount("tenant-a", source.id), 3);
    await inventoryDue(db, source.id);
    fail = true;
    assert.deepEqual(
      await provider.query({
        userId: "tenant-a",
        message: "Recommend a snowboard",
      }),
      [],
    );
    const attempted = calls;
    await sync.tick();
    await store.markInventoryActivity("tenant-a", source.id);
    await provider.query({
      userId: "tenant-a",
      message: "Recommend a snowboard",
    });
    assert.equal(calls, attempted);
    const status = await catalogReadiness(db, store, "tenant-a");
    assert.equal(status.eligibleProductCount, 0);
    assert.equal(status.inventoryUnverifiedProductCount, 3);
    fail = false;
    throttle = true;
    await inventoryDue(db, source.id);
    await provider.query({
      userId: "tenant-a",
      message: "Recommend a snowboard",
    });
    const quotaCalls = calls;
    await sync.tick();
    assert.equal(calls, quotaCalls);
    assert.deepEqual(
      await store.verifyForPurchase("tenant-b", source.id, ["v0"]),
      [],
    );
    await inventoryDue(db, source.id);
    await db
      .update(users)
      .set({ shopifyAccessToken: null })
      .where(eq(users.id, "tenant-a"));
    assert.deepEqual(
      await store.verifyForPurchase("tenant-a", source.id, ["v0"]),
      [],
    );
    assert.equal(calls, quotaCalls);
  } finally {
    await f.cleanup();
  }
});

test("durable inventory webhook events refresh only mapped variants without metadata or full product imports", async () => {
  const f = await setup(2),
    { db, source } = f;
  let calls = 0;
  const fixture = fixtureInventoryRequest(db, (n) => ({
    ...n,
    price: "701.23",
    availableForSale: false,
    inventoryQuantity: 0,
  }));
  const factory =
    (shop: string, token: string) =>
    async (q: string, v?: Record<string, unknown>) => {
      calls++;
      assert.match(q, /VerifyInventoryBatch/);
      assert.deepEqual(v?.ids, ["gid://shopify/ProductVariant/1"]);
      return fixture(shop, token)(q, v);
    };
  const store = createCommerceStore(db, factory),
    sync = createShopifyCatalogSync(db, factory);
  try {
    await db.insert(catalogEvents).values({
      userId: "tenant-a",
      sourceId: source.id,
      eventId: "signed-inventory-delivery",
      topic: "inventory_levels/update",
      resourceId: "1",
    });
    await db
      .update(catalogSources)
      .set({ nextAttemptAt: new Date() })
      .where(eq(catalogSources.id, source.id));
    await sync.tick();
    assert.equal(calls, 1);
    const rows = await db.select().from(catalogVariants);
    assert.equal(rows.find((v) => v.id === "v0")!.price, "701.23");
    assert.ok(
      new Date(rows.find((v) => v.id === "v0")!.verifiedAt).getTime() >
        Date.now() - 10000,
    );
    assert.ok(
      new Date(rows.find((v) => v.id === "v1")!.verifiedAt).getTime() <
        Date.now() - 15 * 60_000,
    );
    assert.ok((await db.select().from(catalogEvents))[0].processedAt);
    assert.equal(
      (await store.lookup("tenant-a", source.id, "p0"))!.availability,
      "out_of_stock",
    );
    assert.equal(
      (await store.lookup("tenant-a", source.id, "p1"))!.availability,
      "unavailable",
    );
    const [after] = await db
      .select()
      .from(catalogSources)
      .where(eq(catalogSources.id, source.id));
    assert.deepEqual(after.lastSyncAt, f.full);
    assert.equal(await sync.tick(), false);
    assert.equal(calls, 1);
  } finally {
    await f.cleanup();
  }
});

test("large active catalogs retain a bounded rotating working set across worker restarts", async () => {
  const f = await setup(1001),
    { db, source } = f;
  const seen = new Set<string>();
  let calls = 0;
  const fixture = fixtureInventoryRequest(db);
  const factory =
    (shop: string, token: string) =>
    async (q: string, v?: Record<string, unknown>) => {
      calls++;
      const ids = v!.ids as string[];
      assert.equal(ids.length, 50);
      for (const id of ids) {
        assert.ok(
          !seen.has(id),
          "fresh variants must not displace older unchecked variants",
        );
        seen.add(id);
      }
      return fixture(shop, token)(q, v);
    };
  const store = createCommerceStore(db, factory);
  try {
    await store.markInventoryActivity("tenant-a", source.id);
    assert.equal(
      await store.eligibleCount("tenant-a", source.id),
      0,
      "activity is not verification",
    );
    await createShopifyCatalogSync(db, factory).tick();
    await inventoryDue(db, source.id);
    await createShopifyCatalogSync(db, factory).tick();
    assert.equal(calls, 2);
    assert.equal(seen.size, 100);
    assert.equal(await store.eligibleCount("tenant-a", source.id), 100);
    const status = await catalogReadiness(db, store, "tenant-a");
    assert.equal(status.publishedProductCount, 1001);
    assert.equal(status.inventoryUnverifiedProductCount, 901);
    assert.equal(status.freshness, "unknown_or_stale");
  } finally {
    await f.cleanup();
  }
});

test("snapshot-only product facts cannot authorize purchase recommendations or current stock claims", () => {
  for (const draft of [
    "I recommend this snowboard",
    "This is available",
    "Buy this snowboard",
    "המוצר זמין",
    "Disponible ahora",
  ])
    assert.equal(
      validateCommerceDraft({
        draft,
        productUrls: [],
        inventoryUnverified: true,
      }).ok,
      false,
      draft,
    );
  assert.equal(
    validateCommerceDraft({
      draft: "I recommend this snowboard",
      productUrls: [],
      inventoryUnverified: false,
    }).ok,
    true,
  );
});

test("mismatched live identities and installation changes cannot renew inventory", async () => {
  const f = await setup(1),
    { db, source } = f;
  const before = await db.select().from(catalogVariants);
  let rotate = false;
  const fixture = fixtureInventoryRequest(db);
  const factory =
    (shop: string, token: string) =>
    async (q: string, v?: Record<string, unknown>) => {
      const data = await fixture(shop, token)(q, v);
      if (rotate)
        await db
          .update(users)
          .set({ shopifyAccessToken: "rotated-fixture-token" })
          .where(eq(users.id, "tenant-a"));
      else data.nodes[0].product.id = "gid://shopify/Product/999999";
      return data;
    };
  const store = createCommerceStore(db, factory);
  try {
    assert.deepEqual(
      await store.verifyForPurchase("tenant-a", source.id, ["v0"]),
      [],
    );
    assert.deepEqual(await db.select().from(catalogVariants), before);
    await inventoryDue(db, source.id);
    rotate = true;
    assert.deepEqual(
      await store.verifyForPurchase("tenant-a", source.id, ["v0"]),
      [],
    );
    assert.deepEqual(await db.select().from(catalogVariants), before);
  } finally {
    await f.cleanup();
  }
});

test("foreground verification does not postpone periodic work and queued events cannot starve an overdue sweep", async () => {
  const f = await setup(65),
    { db, source } = f;
  let calls = 0;
  const sizes: number[] = [];
  const fixture = fixtureInventoryRequest(db);
  const factory =
    (shop: string, token: string) =>
    async (q: string, v?: Record<string, unknown>) => {
      calls++;
      sizes.push((v!.ids as string[]).length);
      return fixture(shop, token)(q, v);
    };
  const store = createCommerceStore(db, factory),
    sync = createShopifyCatalogSync(db, factory);
  try {
    await store.markInventoryActivity("tenant-a", source.id);
    const due = Date.now() - 1000;
    const [s] = await db
      .select()
      .from(catalogSources)
      .where(eq(catalogSources.id, source.id));
    await db
      .update(catalogSources)
      .set({
        checkpoint: {
          ...(s.checkpoint as any),
          inventory: {
            ...(s.checkpoint as any).inventory,
            nextAt: due,
            apiAfter: 0,
          },
        },
      })
      .where(eq(catalogSources.id, source.id));
    assert.equal(
      (await store.verifyForPurchase("tenant-a", source.id, ["v0"])).length,
      1,
    );
    const [after] = await db
      .select()
      .from(catalogSources)
      .where(eq(catalogSources.id, source.id));
    assert.equal(
      (after.checkpoint as any).inventory.nextAt,
      due,
      "live demand must not slide the sweep deadline",
    );
    await db.insert(catalogEvents).values({
      userId: "tenant-a",
      sourceId: source.id,
      eventId: "busy-inventory-event",
      topic: "inventory_levels/update",
      resourceId: "1",
    });
    await inventoryDue(db, source.id);
    await sync.tick();
    assert.equal(calls, 2);
    assert.deepEqual(sizes, [1, 50]);
    assert.equal(
      (await db.select().from(catalogEvents))[0].processedAt,
      null,
      "due sweep gets one bounded turn before processing more events",
    );
  } finally {
    await f.cleanup();
  }
});

test("unavailable storefront variants are not called out of stock without verified negative inventory", () => {
  const context = { published: true, sourceHealthy: true };
  const v = {
    tracked: true,
    quantity: 5,
    inventoryPolicy: "DENY",
    availableForSale: false,
    requiresComponents: false,
    verifiedAt: new Date(),
  };
  assert.equal(variantAvailability(v, context), "unknown");
  assert.equal(
    variantAvailability({ ...v, quantity: 0 }, context),
    "out_of_stock",
  );
  assert.equal(
    variantAvailability({ ...v, tracked: false, quantity: 0 }, context),
    "unknown",
  );
  assert.equal(
    variantAvailability(
      { ...v, availableForSale: true, inventoryPolicy: null },
      context,
    ),
    "unknown",
  );
});

test("inventory renewal interleaves with a long catalog pass without restarting its generation or cursor", async () => {
  const f = await setup(65),
    { db, source } = f;
  const fixture = fixtureInventoryRequest(db);
  let calls = 0;
  const factory =
    (shop: string, token: string) =>
    async (q: string, v?: Record<string, unknown>) => {
      calls++;
      assert.match(q, /VerifyInventoryBatch/);
      return fixture(shop, token)(q, v);
    };
  const store = createCommerceStore(db, factory),
    sync = createShopifyCatalogSync(db, factory);
  const progress = {
    mode: "full",
    after: "durable-page-cursor",
    pending: ["gid://shopify/Product/999999"],
    end: false,
    events: [],
    startedAt: new Date().toISOString(),
  };
  try {
    await db
      .update(catalogSources)
      .set({
        status: "syncing",
        generation: "existing-generation",
        nextAttemptAt: new Date(),
        checkpoint: {
          ...progress,
          inventory: {
            activeUntil: Date.now() + 30 * 60_000,
            nextAt: 0,
            apiAfter: 0,
          },
        },
      })
      .where(eq(catalogSources.id, source.id));
    await sync.tick();
    assert.equal(calls, 1);
    assert.equal(await store.eligibleCount("tenant-a", source.id), 50);
    const [after] = await db
      .select()
      .from(catalogSources)
      .where(eq(catalogSources.id, source.id));
    for (const [key, value] of Object.entries(progress))
      assert.deepEqual((after.checkpoint as any)[key], value);
    assert.equal(after.generation, "existing-generation");
    assert.deepEqual(after.lastSyncAt, f.full);
    assert.equal(after.status, "syncing");
  } finally {
    await f.cleanup();
  }
});
