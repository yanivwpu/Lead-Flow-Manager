import { inventoryDue } from "./shopify-inventory-fixture";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COMMERCE_CATALOG_SCHEMA_SQL } from "../server/salesCatalog/schemaSql";
import test from "node:test";
import { and, eq, sql } from "drizzle-orm";
import * as tables from "../shared/schema";
import { catalogFixture } from "./shopify-catalog-fixture";
import { createShopifyCatalogSync } from "../server/salesCatalog/shopify/sync";
import {
  ensureCatalogSource,
  resolveCatalogInstallation,
} from "../server/salesCatalog/shopify/installation";
import { createCommerceStore } from "../server/salesCatalog/commerceStore";
import { CatalogApiError } from "../server/salesCatalog/shopify/api";
import {
  variantAvailability,
  verifiedProductUrl,
} from "../shared/commerceCatalog";
import { catalogAuthorizationUrl } from "../server/salesCatalog/shopify/authorization";
import { catalogReadiness } from "../server/salesCatalog/shopify/readiness";
const connect = (nodes: any[], cursor: string | null = null) => ({
  nodes,
  pageInfo: { hasNextPage: !!cursor, endCursor: cursor },
});
const date = "2026-10-14T12:00:00Z";
function variant(id: number, price = "19.990001") {
  return {
    id: `gid://shopify/ProductVariant/${id}`,
    title: `Black size ${id}`,
    sku: `SHOE-${id}`,
    selectedOptions: [
      { name: "Color", value: "Black" },
      { name: "Size", value: String(id) },
    ],
    price,
    compareAtPrice: "29.99",
    inventoryPolicy: "DENY",
    inventoryQuantity: 4,
    sellableOnlineQuantity: 4,
    availableForSale: true,
    requiresComponents: false,
    updatedAt: date,
    inventoryItem: { id: `gid://shopify/InventoryItem/${id}`, tracked: true },
  };
}
function product(id: number) {
  return {
    id: `gid://shopify/Product/${id}`,
    title: "Black shoes",
    description: "Leather shoes",
    productType: "Shoes",
    vendor: "Fixture",
    status: "ACTIVE",
    publishedAt: date,
    onlineStoreUrl: `https://fixture-a.myshopify.com/products/shoes-${id}`,
    updatedAt: date,
    tags: ["footwear"],
    requiresSellingPlan: false,
    options: [{ name: "Color", values: ["Black"] }],
    variantsCount: { count: 1 },
    variants: connect([variant(id)]),
    media: connect([
      {
        id: `gid://shopify/MediaImage/${id}`,
        image: {
          url: `https://cdn.shopify.com/shoes-${id}.png`,
          altText: "Shoes",
        },
      },
    ]),
    collections: connect([
      { id: "gid://shopify/Collection/1", title: "Summer footwear" },
    ]),
  };
}

test("durable initial sync, independent child pagination, incremental refresh, annotations, partial failure and tenant fences", async () => {
  const f = await catalogFixture();
  const db = f.database;
  const store = createCommerceStore(db);
  let scopes = ["read_products", "read_inventory"],
    fail = false,
    deleted = false,
    unpublished = false,
    price = "19.990001",
    version = date;
  let source: any;
  const calls: any[] = [];
  const sync = createShopifyCatalogSync(
    db,
    (_shop, token) => async (query, variables) => {
      assert.equal(token, "fixture-token-a");
      calls.push({ query, variables });
      if (query.includes("CatalogMeta"))
        return {
          currentAppInstallation: {
            accessScopes: scopes.map((handle) => ({ handle })),
          },
          shop: {
            currencyCode: "USD",
            myshopifyDomain: "fixture-a.myshopify.com",
            primaryDomain: { host: "fixture-a.myshopify.com" },
          },
        };
      if (fail) throw new CatalogApiError("throttled", 10);
      if (query.includes("CatalogIds"))
        return { products: connect([{ id: "gid://shopify/Product/1" }]) };
      if (deleted) return { product: null };
      const p = product(1);
      p.updatedAt = version;
      p.variants = connect([variant(1, price)]);
      if (unpublished) p.publishedAt = null as any;
      if (!source.initialSyncCompletedAt) {
        p.variantsCount.count = 51;
        p.variants =
          variables?.variants === "cursor-50"
            ? connect([variant(51)])
            : connect(
                Array.from({ length: 50 }, (_, i) => variant(i + 1)),
                "cursor-50",
              );
        if (variables?.includeMedia === false) delete (p as any).media;
        if (variables?.includeCollections === false)
          delete (p as any).collections;
      }
      return { product: p };
    },
  );
  async function run() {
    [source] = await db
      .select()
      .from(tables.catalogSources)
      .where(eq(tables.catalogSources.id, source.id));
    await db
      .update(tables.catalogSources)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(tables.catalogSources.id, source.id));
    await sync.tick();
    [source] = await db
      .select()
      .from(tables.catalogSources)
      .where(eq(tables.catalogSources.id, source.id));
  }
  try {
    assert.equal(
      (await resolveCatalogInstallation(db, "tenant-a"))?.shop,
      "fixture-a.myshopify.com",
    );
    assert.equal(
      await resolveCatalogInstallation(
        db,
        "tenant-b",
        "fixture-a.myshopify.com",
      ),
      null,
    );
    source = await ensureCatalogSource(db, "tenant-a");
    scopes = ["read_orders"];
    await run();
    assert.equal(source.status, "permission_required");
    assert.equal(
      (
        await store.searchCandidates("tenant-a", {
          sourceId: source.id,
          query: "shoes",
        })
      ).length,
      0,
    );
    assert.equal(
      (await catalogReadiness(db, store, "tenant-a")).initialSyncCompleted,
      false,
    );
    scopes = ["read_products", "read_inventory"];
    await run();
    assert.equal(source.status, "ready");
    assert.ok(source.initialSyncCompletedAt);
    let [p] = await db.select().from(tables.catalogProducts);
    assert.ok(p.complete);
    assert.equal((await db.select().from(tables.catalogVariants)).length, 51);
    assert.equal((await db.select().from(tables.catalogMedia)).length, 1);
    assert.equal((await db.select().from(tables.catalogMemberships)).length, 1);
    assert.ok(
      calls.some(
        (c) =>
          c.variables?.includeMedia === false &&
          c.variables?.variants === "cursor-50",
      ),
    );
    const found = await store.searchCandidates("tenant-a", {
      sourceId: source.id,
      query: "black shoes",
      filters: { maxPrice: "20", currency: "USD" },
    });
    assert.equal(found.length, 1);
    assert.equal(found[0].variants[0].price, "19.990001");
    assert.equal(found[0].collections[0].title, "Summer footwear");
    assert.ok(found[0].variants.length <= 25);
    assert.equal(
      (
        await store.searchCandidates("tenant-b", {
          sourceId: source.id,
          query: "shoes",
        })
      ).length,
      0,
    );
    await store.annotate("tenant-a", source.id, p.id, {
      aiGuidance: "Recommend gently",
      notes: "Merchant-owned",
      merchantTags: ["vip"],
    });
    const event = async (
      id: string,
      topic = "products/update",
      resourceId = "1",
    ) =>
      db
        .insert(tables.catalogEvents)
        .values({
          sourceId: source.id,
          userId: "tenant-a",
          eventId: id,
          topic,
          resourceId,
        })
        .onConflictDoNothing({
          target: [tables.catalogEvents.sourceId, tables.catalogEvents.eventId],
        });
    price = "25.250001";
    version = "2026-10-14T13:00:00Z";
    await event("update");
    await event("update");
    await run();
    [p] = await db.select().from(tables.catalogProducts);
    assert.equal(p.aiGuidance, "Recommend gently");
    assert.equal(p.notes, "Merchant-owned");
    assert.deepEqual(p.merchantTags, ["vip"]);
    assert.equal((await db.select().from(tables.catalogVariants)).length, 1);
    assert.equal(
      (await db.select().from(tables.catalogVariants))[0].price,
      price,
    );
    version = date;
    price = "1.00";
    await event("out-of-order");
    await run();
    assert.equal(
      (await db.select().from(tables.catalogVariants))[0].price,
      "25.250001",
    );
    version = "2026-10-14T14:00:00Z";
    unpublished = true;
    await event("unpublish");
    await run();
    assert.equal(
      (
        await store.searchCandidates("tenant-a", {
          sourceId: source.id,
          query: "shoes",
        })
      ).length,
      0,
    );
    unpublished = false;
    await event("publish");
    await run();
    assert.equal(
      (
        await store.searchCandidates("tenant-a", {
          sourceId: source.id,
          query: "shoes",
        })
      ).length,
      1,
    );
    fail = true;
    await db
      .update(tables.catalogSources)
      .set({ requestedAt: new Date(Date.now() + 1000) })
      .where(eq(tables.catalogSources.id, source.id));
    const failureStarted=Date.now();
    await run();
    assert.equal(source.status, "error");
    // The fixture requests a 10ms throttle delay. Parallel CI can spend longer
    // than that returning the DB row; assert the scheduled delay, not read speed.
    assert.ok(source.nextAttemptAt.getTime() >= failureStarted + 10);
    assert.equal(
      (await db.select().from(tables.catalogProducts))[0].deletedAt,
      null,
    );
    assert.equal(
      (await store.lookup("tenant-a", source.id, p.id))?.variants[0]
        .availability,
      "stale",
    );
    fail = false;
    await run();
    assert.equal(source.status, "ready");
    deleted = true;
    await event("delete", "products/delete");
    await run();
    assert.equal(
      (
        await store.searchCandidates("tenant-a", {
          sourceId: source.id,
          query: "shoes",
        })
      ).length,
      0,
    );
    // No customer/order/message/workflow tables exist in this isolated database. Imports cannot touch them.
    const data = await f.pg.exec(
      "SELECT to_regclass('messages') AS messages, to_regclass('workflows') AS workflows",
    );
    assert.equal(
      (Array.isArray(data) ? data[0] : data).rows?.[0]?.messages,
      null,
    );
  } finally {
    await f.cleanup();
  }
});

test("authoritative availability, exact URLs and least-privilege optional authorization", () => {
  const v = {
    tracked: true,
    quantity: 3,
    inventoryPolicy: "DENY",
    availableForSale: true,
    requiresComponents: false,
    verifiedAt: new Date(),
  };
  const context = { published: true, sourceHealthy: true };
  assert.equal(variantAvailability(v, context), "available");
  assert.equal(
    variantAvailability({ ...v, availableForSale: false }, context),
    "unknown",
  );
  assert.equal(
    variantAvailability(
      { ...v, quantity: 0, inventoryPolicy: "CONTINUE" },
      context,
    ),
    "available",
  );
  assert.equal(
    variantAvailability({ ...v, tracked: false, quantity: null }, context),
    "not_tracked",
  );
  assert.equal(
    variantAvailability({ ...v, quantity: null }, context),
    "unknown",
  );
  assert.equal(
    variantAvailability(v, { ...context, published: false }),
    "not_published",
  );
  assert.equal(
    variantAvailability(v, { ...context, sourceHealthy: false }),
    "stale",
  );
  assert.equal(
    variantAvailability({ ...v, verifiedAt: new Date(0) }, context),
    "stale",
  );
  assert.equal(
    verifiedProductUrl("https://evil.example.invalid/products/a", [
      "fixture-a.myshopify.com",
    ]),
    null,
  );
  assert.equal(
    verifiedProductUrl(
      "https://fixture-a.myshopify.com.evil.example.invalid/products/a",
      ["fixture-a.myshopify.com"],
    ),
    null,
  );
  assert.equal(
    verifiedProductUrl("https://fixture-a.myshopify.com/products/a", [
      "fixture-a.myshopify.com",
    ]),
    "https://fixture-a.myshopify.com/products/a",
  );
  assert.equal(
    catalogAuthorizationUrl("evil.example.invalid", "fixture-client"),
    null,
  );
  const url = new URL(
    catalogAuthorizationUrl("fixture-a.myshopify.com", "fixture-client")!,
  );
  assert.equal(url.hostname, "admin.shopify.com");
  assert.equal(
    url.searchParams.get("optional_scopes"),
    "read_products,read_inventory",
  );
  assert.equal(url.searchParams.get("client_id"), "fixture-client");
});

test("multi-batch import resumes durable work after a worker restart and mid-pass outage without pruning valid products", async () => {
  const f = await catalogFixture();
  const db = f.database;
  try {
    const src = (await ensureCatalogSource(db, "tenant-a"))!;
    let listings = 0,
      failAtEight = false;
    const factory =
      () => async (query: string, vars?: Record<string, unknown>) => {
        if (query.includes("CatalogMeta"))
          return {
            currentAppInstallation: {
              accessScopes: [{ handle: "read_products" }],
            },
            shop: {
              currencyCode: "USD",
              myshopifyDomain: "fixture-a.myshopify.com",
              primaryDomain: { host: "fixture-a.myshopify.com" },
            },
          };
        if (query.includes("CatalogIds")) {
          listings++;
          return {
            products: connect(
              Array.from({ length: 13 }, (_, i) => ({
                id: `gid://shopify/Product/${i + 1}`,
              })),
            ),
          };
        }
        const id = Number(String(vars!.id).split("/").pop());
        if (failAtEight && id === 8) {
          failAtEight = false;
          throw new CatalogApiError("unavailable");
        }
        return { product: product(id) };
      };
    await createShopifyCatalogSync(db, factory).tick();
    let [source] = await db
      .select()
      .from(tables.catalogSources)
      .where(eq(tables.catalogSources.id, src.id));
    assert.equal(source.initialSyncCompletedAt, null);
    assert.equal(source.status, "syncing");
    assert.equal((await db.select().from(tables.catalogProducts)).length, 5);
    const generation = source.generation;
    await db
      .update(tables.catalogSources)
      .set({ requestedAt: new Date() })
      .where(eq(tables.catalogSources.id, src.id));
    failAtEight = true;
    await createShopifyCatalogSync(db, factory).tick();
    [source] = await db
      .select()
      .from(tables.catalogSources)
      .where(eq(tables.catalogSources.id, src.id));
    assert.equal(source.status, "error");
    assert.equal(source.generation, generation);
    assert.equal((await db.select().from(tables.catalogProducts)).length, 7);
    assert.ok((source.checkpoint as any).pending.length > 0);
    await db
      .update(tables.catalogSources)
      .set({ nextAttemptAt: new Date() })
      .where(eq(tables.catalogSources.id, src.id));
    for (let i = 0; i < 4; i++) {
      await createShopifyCatalogSync(db, factory).tick();
      [source] = await db
        .select()
        .from(tables.catalogSources)
        .where(eq(tables.catalogSources.id, src.id));
      if (source.status === "ready") break;
    }
    assert.equal(source.status, "ready");
    assert.ok(source.initialSyncCompletedAt);
    assert.equal(listings, 1);
    assert.equal(await createShopifyCatalogSync(db, factory).tick(), false);
    assert.equal((await db.select().from(tables.catalogProducts)).length, 13);
    assert.ok(
      (await db.select().from(tables.catalogProducts)).every(
        (p) => p.complete && !p.deletedAt,
      ),
    );
    // An older API snapshot in a full reconcile must still mark the newer local record seen.
    await db
      .update(tables.catalogProducts)
      .set({ providerUpdatedAt: new Date("2026-10-15T00:00:00Z") })
      .where(eq(tables.catalogProducts.externalId, "gid://shopify/Product/1"));
    await db
      .update(tables.catalogSources)
      .set({
        requestedAt: new Date(Date.now() + 1000),
        nextAttemptAt: new Date(),
      })
      .where(eq(tables.catalogSources.id, src.id));
    for (let i = 0; i < 5; i++) {
      await createShopifyCatalogSync(db, factory).tick();
      [source] = await db
        .select()
        .from(tables.catalogSources)
        .where(eq(tables.catalogSources.id, src.id));
      if (source.status === "ready") break;
    }
    assert.equal(source.status, "ready");
    assert.equal(
      (
        await db
          .select()
          .from(tables.catalogProducts)
          .where(
            eq(tables.catalogProducts.externalId, "gid://shopify/Product/1"),
          )
      )[0].deletedAt,
      null,
    );
  } finally {
    await f.cleanup();
  }
});

test("startup catalog SQL exactly matches the reviewed additive migration", () => {
  assert.equal(
    COMMERCE_CATALOG_SCHEMA_SQL,
    readFileSync("migrations/0107_shared_commerce_catalog.sql", "utf8"),
  );
});

test("daily reconciliation stays idle between passes, targeted events never list the full catalog, and manual recovery coalesces", async () => {
  const f = await catalogFixture(),
    db = f.database;
  let price = "19.99",
    mappingThrottle = false;
  const requested: string[] = [];
  let listingCalls = 0,
    collectionPages = 0;
  const factory =
    () => async (query: string, vars?: Record<string, unknown>) => {
      if (query.includes("CatalogMeta"))
        return {
          currentAppInstallation: {
            accessScopes: [{ handle: "read_products" }],
          },
          shop: {
            currencyCode: "USD",
            myshopifyDomain: "fixture-a.myshopify.com",
            primaryDomain: { host: "fixture-a.myshopify.com" },
          },
        };
      if (query.includes("CatalogIds")) {
        listingCalls++;
        return {
          products: connect(
            [1, 2].map((id) => ({ id: `gid://shopify/Product/${id}` })),
          ),
        };
      }
      if (query.includes("CatalogInventoryProduct"))
        return {
          inventoryItem: {
            id: vars!.id,
            variant: { product: { id: "gid://shopify/Product/2" } },
          },
          ...(mappingThrottle
            ? { __throttle: { currentlyAvailable: 150, restoreRate: 50 } }
            : {}),
        };
      if (query.includes("CatalogCollectionProducts")) {
        collectionPages++;
        const ids = vars!.after
          ? [51, 52, 53]
          : Array.from({ length: 50 }, (_, i) => i + 1);
        return {
          collection: {
            id: vars!.id,
            products: connect(
              ids.map((id) => ({ id: `gid://shopify/Product/${id}` })),
              vars!.after ? null : "collection-page-2",
            ),
          },
        };
      }
      const id = Number(String(vars!.id).split("/").pop());
      requested.push(String(vars!.id));
      const p = product(id);
      p.variants.nodes[0].price = price;
      return { product: p };
    };
  try {
    const src = (await ensureCatalogSource(db, "tenant-a"))!;
    await createShopifyCatalogSync(db, factory).tick();
    assert.equal(listingCalls, 1);
    const lastFull = new Date(Date.now() - 12 * 60 * 60_000);
    await db
      .update(tables.catalogSources)
      .set({
        lastSyncAt: lastFull,
        requestedAt: lastFull,
        nextAttemptAt: new Date(),
      })
      .where(eq(tables.catalogSources.id, src.id));
    const snapshots = await db.select().from(tables.catalogProducts);
    requested.length = 0;
    const engine = createShopifyCatalogSync(db, factory);
    await engine.tick();
    let [source] = await db
      .select()
      .from(tables.catalogSources)
      .where(eq(tables.catalogSources.id, src.id));
    assert.equal(listingCalls, 1);
    assert.deepEqual(requested, []);
    assert.deepEqual(await db.select().from(tables.catalogProducts), snapshots);
    assert.equal(
      source.nextAttemptAt.getTime(),
      lastFull.getTime() + 24 * 60 * 60_000,
    );
    assert.equal(await engine.tick(), false);
    const event = async (id: string, topic: string, resourceId: string) => {
      await db.insert(tables.catalogEvents).values({
        sourceId: src.id,
        userId: "tenant-a",
        eventId: id,
        topic,
        resourceId,
      });
      await db
        .update(tables.catalogSources)
        .set({ nextAttemptAt: new Date() })
        .where(eq(tables.catalogSources.id, src.id));
    };
    price = "21.000001";
    await event("product", "products/update", "1");
    await event("inventory", "inventory_levels/update", "1");
    await engine.tick();
    assert.deepEqual(requested, ["gid://shopify/Product/1"]);
    assert.equal(listingCalls, 1);
    assert.equal(
      (
        await db
          .select()
          .from(tables.catalogSources)
          .where(eq(tables.catalogSources.id, src.id))
      )[0].lastSyncAt!.getTime(),
      lastFull.getTime(),
    );
    const untouched = (
      await db
        .select()
        .from(tables.catalogProducts)
        .where(eq(tables.catalogProducts.externalId, "gid://shopify/Product/2"))
    )[0];
    assert.deepEqual(
      untouched,
      snapshots.find((p) => p.externalId === untouched.externalId),
    );
    // An unknown inventory mapping stays targeted and obeys the mapping call's quota delay.
    requested.length = 0;
    mappingThrottle = true;
    await event("unknown-stock", "inventory_levels/update", "99");
    await engine.tick();
    [source] = await db
      .select()
      .from(tables.catalogSources)
      .where(eq(tables.catalogSources.id, src.id));
    assert.equal(source.status, "syncing");
    assert.deepEqual((source.checkpoint as any).pending, [
      "gid://shopify/Product/2",
    ]);
    assert.ok(source.nextAttemptAt.getTime() > Date.now());
    assert.equal(await engine.tick(), false);
    assert.equal(listingCalls, 1);
    mappingThrottle = false;
    // Simulate the shared durable quota cooldown expiring before resuming the fixture.
    await inventoryDue(db, src.id);
    await db
      .update(tables.catalogSources)
      .set({ nextAttemptAt: new Date() })
      .where(eq(tables.catalogSources.id, src.id));
    await engine.tick();
    assert.deepEqual(requested, ["gid://shopify/Product/2"]);
    // Collection changes use 50-ID checkpoints, never a global products listing.
    await event("collection", "collections/update", "1");
    await engine.tick();
    [source] = await db
      .select()
      .from(tables.catalogSources)
      .where(eq(tables.catalogSources.id, src.id));
    assert.equal((source.checkpoint as any).mode, "events");
    assert.ok((source.checkpoint as any).pending.length <= 60);
    assert.equal(source.initialSyncCompletedAt !== null, true);
    for (let i = 0; i < 30 && source.status !== "ready"; i++) {
      await createShopifyCatalogSync(db, factory).tick();
      [source] = await db
        .select()
        .from(tables.catalogSources)
        .where(eq(tables.catalogSources.id, src.id));
      assert.ok(((source.checkpoint as any).pending?.length ?? 0) <= 60);
    }
    assert.equal(source.status, "ready");
    assert.equal(collectionPages, 2);
    assert.equal(listingCalls, 1);
    assert.equal(source.lastSyncAt!.getTime(), lastFull.getTime());
    assert.equal((await db.select().from(tables.catalogProducts)).length, 53);
    // Manual recovery runs one full pass. Requests while it is in progress do not restart its generation.
    await db
      .update(tables.catalogSources)
      .set({ requestedAt: new Date(), nextAttemptAt: new Date() })
      .where(eq(tables.catalogSources.id, src.id));
    await engine.tick();
    [source] = await db
      .select()
      .from(tables.catalogSources)
      .where(eq(tables.catalogSources.id, src.id));
    assert.equal(source.status, "ready");
    assert.equal(listingCalls, 2);
    assert.ok(
      source.nextAttemptAt.getTime() >=
        source.lastSyncAt!.getTime() + 24 * 60 * 60_000,
    );
    for (let i = 0; i < 5; i++) assert.equal(await engine.tick(), false);
    assert.equal(listingCalls, 2);
    // At the next daily boundary, exactly one automatic recovery becomes eligible.
    const due = new Date(Date.now() - 24 * 60 * 60_000 - 1000);
    await db
      .update(tables.catalogSources)
      .set({ lastSyncAt: due, requestedAt: due, nextAttemptAt: new Date() })
      .where(eq(tables.catalogSources.id, src.id));
    await engine.tick();
    assert.equal(listingCalls, 3);
    assert.equal(await engine.tick(), false);
  } finally {
    await f.cleanup();
  }
});
