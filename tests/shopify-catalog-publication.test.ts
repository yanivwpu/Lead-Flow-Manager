import {
  fixtureInventoryRequest,
  inventoryDue,
} from "./shopify-inventory-fixture";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { and, eq } from "drizzle-orm";
import { catalogFixture } from "./shopify-catalog-fixture";
import {
  catalogSources,
  catalogProducts,
  catalogVariants,
  users,
  integrations,
} from "../shared/schema";
import { isShopifyProductPublished } from "../server/salesCatalog/shopify/publication";
import { createShopifyCatalogSync } from "../server/salesCatalog/shopify/sync";
import { ensureCatalogSource } from "../server/salesCatalog/shopify/installation";
import { createCommerceStore } from "../server/salesCatalog/commerceStore";
import { createShopifyLiveProvider } from "../server/aiLiveBusinessData/providers/shopifyProvider";
import { catalogReadiness } from "../server/salesCatalog/shopify/readiness";
import {
  registerShopifyCatalogRoutes,
  verifyCatalogVariant,
} from "../server/salesCatalog/shopify/routes";
import { validateCommerceDraft } from "../shared/commerceGrounding";
const connection = (nodes: any[]) => ({
  nodes,
  pageInfo: { hasNextPage: false, endCursor: null },
});

test("2026-01 Online Store publication is independent of public URL and fails closed for unsupported/inactive/future/unknown publication", () => {
  const now = Date.now(),
    published = {
      status: "ACTIVE",
      publishedAt: new Date(now - 1000).toISOString(),
      requiresSellingPlan: false,
    };
  assert.equal(isShopifyProductPublished(published, now), true);
  for (const overrides of [
    { publishedAt: null },
    { publishedAt: undefined },
    { publishedAt: "invalid" },
    { publishedAt: new Date(now + 60000).toISOString() },
    { status: "DRAFT" },
    { status: "ARCHIVED" },
    { status: "UNKNOWN" },
    { requiresSellingPlan: true },
    { requiresSellingPlan: undefined },
  ])
    assert.equal(
      isShopifyProductPublished({ ...published, ...overrides }, now),
      false,
      JSON.stringify(overrides),
    );
});

test("password-protected Online Store products sync, refresh at the same provider version and produce only eligible priced AI recommendations", async () => {
  const f = await catalogFixture(),
    db = f.database,
    store = createCommerceStore(db, fixtureInventoryRequest(db));
  let server: ReturnType<typeof express.prototype.listen> | undefined;
  const date = new Date(Date.now() - 60_000).toISOString();
  const products = new Map<number, any>();
  for (let id = 1; id <= 9; id++) {
    const p: any = {
      id: `gid://shopify/Product/${id}`,
      title: id === 1 ? "The Complete Snowboard" : `Snowboard ${id}`,
      description: "Snowboard with selectable sizes",
      productType: "Snowboards",
      vendor: "Fixture",
      status: "ACTIVE",
      publishedAt: date,
      onlineStoreUrl: null,
      updatedAt: date,
      tags: ["snowboard"],
      requiresSellingPlan: false,
      options: [{ name: "Size", values: ["150", "155", "160", "165", "170"] }],
      variantsCount: { count: id === 1 ? 5 : 1 },
      media: connection([]),
      collections: connection([]),
    };
    p.variants = connection(
      Array.from({ length: p.variantsCount.count }, (_, index) => {
        const n = id * 10 + index;
        return {
          id: `gid://shopify/ProductVariant/${n}`,
          title: `Size ${150 + index * 5}`,
          sku: `SNOW-${n}`,
          selectedOptions: [{ name: "Size", value: String(150 + index * 5) }],
          price: "699.95",
          compareAtPrice: null,
          inventoryPolicy: "DENY",
          inventoryQuantity: 5,
          sellableOnlineQuantity: 5,
          availableForSale: true,
          requiresComponents: false,
          updatedAt: date,
          inventoryItem: {
            id: `gid://shopify/InventoryItem/${n}`,
            tracked: true,
          },
        };
      }),
    );
    if (id === 2) {
      p.publishedAt = null;
      p.onlineStoreUrl = "https://fixture-a.myshopify.com/products/unpublished";
    }
    if (id === 3) p.status = "DRAFT";
    if (id === 4) p.status = "ARCHIVED";
    if (id === 5)
      Object.assign(p.variants.nodes[0], {
        inventoryQuantity: 0,
        sellableOnlineQuantity: 0,
        availableForSale: false,
      });
    if (id === 6) p.requiresSellingPlan = true;
    if (id === 7) p.variants.nodes[0].requiresComponents = true;
    if (id === 8) {
      p.publishedAt = new Date(Date.now() + 3600000).toISOString();
      p.onlineStoreUrl = "https://fixture-a.myshopify.com/products/scheduled";
    }
    if (id === 9) delete p.variants.nodes[0].requiresComponents;
    products.set(id, p);
  }
  let listings = 0;
  const factory =
    (shop: string, token: string) =>
    async (query: string, variables?: Record<string, unknown>) => {
      assert.equal(shop, "fixture-a.myshopify.com");
      assert.equal(token, "fixture-token-a");
      assert.doesNotMatch(query, /mutation|publications\(/);
      if (query.includes("CatalogMeta"))
        return {
          currentAppInstallation: {
            accessScopes: [
              { handle: "read_products" },
              { handle: "read_inventory" },
            ],
          },
          shop: {
            currencyCode: "USD",
            myshopifyDomain: shop,
            primaryDomain: { host: shop },
          },
        };
      if (query.includes("CatalogIds")) {
        listings++;
        return {
          products: connection(
            [...products.values()].map((p) => ({ id: p.id })),
          ),
        };
      }
      if (query.includes("VerifyCatalogVariant"))
        return {
          productVariant: {
            ...products.get(1).variants.nodes[0],
            product: products.get(1),
          },
          shop: { currencyCode: "USD" },
        };
      assert.match(query, /CatalogProduct/);
      return {
        product: products.get(Number(String(variables!.id).split("/").pop())),
      };
    };
  const sync = createShopifyCatalogSync(db, factory);
  try {
    const source = (await ensureCatalogSource(db, "tenant-a"))!;
    const userBefore = await db.select().from(users),
      integrationsBefore = await db.select().from(integrations);
    async function settle() {
      for (let i = 0; i < 10; i++) {
        await sync.tick();
        const [row] = await db
          .select()
          .from(catalogSources)
          .where(eq(catalogSources.id, source.id));
        if (row.status === "ready" && row.initialSyncCompletedAt) return row;
      }
      throw Error("sync did not settle");
    }
    await settle();
    const [snowboard] = await db
      .select()
      .from(catalogProducts)
      .where(
        and(
          eq(catalogProducts.sourceId, source.id),
          eq(catalogProducts.externalId, "gid://shopify/Product/1"),
        ),
      );
    assert.equal(snowboard.published, true);
    assert.equal(
      snowboard.productUrl,
      null,
      "do not invent URLs or use preview links",
    );
    assert.equal(snowboard.variantCount, 5);
    const item = (await store.lookup("tenant-a", source.id, snowboard.id))!;
    assert.ok(
      item.variants.every(
        (v) => v.price === "699.95" && v.availability === "available",
      ),
    );
    assert.equal(
      (await catalogReadiness(db, store, "tenant-a")).eligibleProductCount,
      1,
    );
    assert.equal(await store.eligibleCount("tenant-b", source.id), 0);
    for (const id of [2, 3, 4, 6, 8]) {
      const [p] = await db
        .select()
        .from(catalogProducts)
        .where(
          and(
            eq(catalogProducts.sourceId, source.id),
            eq(catalogProducts.externalId, `gid://shopify/Product/${id}`),
          ),
        );
      assert.equal(p.published, false, `product ${id} must not be published`);
    }
    const provider = createShopifyLiveProvider(store, (userId) =>
      catalogReadiness(db, store, userId),
    );
    const recommendations = await provider.query({
      userId: "tenant-a",
      message: "Recommend a snowboard under $700",
    });
    assert.equal(recommendations.length, 3);
    assert.ok(
      recommendations.every(
        (r) =>
          r.data.productId === snowboard.id &&
          r.data.price === "699.95" &&
          r.data.currency === "USD" &&
          r.data.availability === "available" &&
          r.data.productUrl === null,
      ),
    );
    assert.match(recommendations[0].summary, /Size 150/);
    assert.match(recommendations[0].summary, /Product URL: not configured/);
    assert.deepEqual(
      await provider.query({
        userId: "tenant-b",
        message: "Recommend a snowboard",
      }),
      [],
    );
    assert.equal(
      validateCommerceDraft({
        draft: "See https://fixture-a.myshopify.com/products/guessed",
        productUrls: [],
        inventoryUnverified: false,
      }).ok,
      false,
    );
    const exact = await verifyCatalogVariant(
      db,
      store,
      "tenant-a",
      snowboard.id,
      item.variants[0].id,
      factory,
    );
    assert.equal(exact.availability, "available");
    assert.equal(exact.price, "699.95");
    products.get(1).requiresSellingPlan = true;
    assert.equal(
      (
        await verifyCatalogVariant(
          db,
          store,
          "tenant-a",
          snowboard.id,
          item.variants[0].id,
          factory,
        )
      ).availability,
      "not_published",
    );
    products.get(1).requiresSellingPlan = false;
    // Existing merchant recovery rehydrates equal-version rows; no reinstall, consent or schema repair.
    await store.annotate("tenant-a", source.id, snowboard.id, {
      notes: "Preserve merchant notes",
    });
    await db
      .update(catalogProducts)
      .set({ published: false })
      .where(eq(catalogProducts.id, snowboard.id));
    await db
      .update(catalogSources)
      .set({ lastSyncAt: new Date(Date.now() - 1000) })
      .where(eq(catalogSources.id, source.id));
    await inventoryDue(db, source.id);
    const app = express();
    app.use(express.json());
    registerShopifyCatalogRoutes(app, db, store, async () => ({
      actorUserId: "tenant-a",
      workspaceUserId: "tenant-a",
    }));
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server!.once("listening", resolve));
    const origin = `http://127.0.0.1:${(server.address() as any).port}`;
    assert.equal(
      (
        await fetch(origin + "/api/sales-catalog/commerce/sync", {
          method: "POST",
        })
      ).status,
      202,
    );
    await settle();
    const refreshed = (await store.lookup(
      "tenant-a",
      source.id,
      snowboard.id,
    ))!;
    assert.equal(refreshed.published, true);
    assert.equal(refreshed.notes, "Preserve merchant notes");
    assert.equal(refreshed.id, snowboard.id);
    assert.equal(refreshed.productUrl, null);
    assert.equal((await db.select().from(catalogProducts)).length, 9);
    assert.equal(listings, 2);
    assert.deepEqual(await db.select().from(users), userBefore);
    assert.deepEqual(await db.select().from(integrations), integrationsBefore);
    await db
      .update(catalogVariants)
      .set({ verifiedAt: new Date(Date.now() - 20 * 60000) })
      .where(eq(catalogVariants.productId, snowboard.id));
    assert.equal(await store.eligibleCount("tenant-a", source.id), 0);
    await inventoryDue(db, source.id);
    const recovered = await provider.query({
      userId: "tenant-a",
      message: "Recommend a snowboard",
    });
    assert.equal(
      recovered.length,
      3,
      "expired snapshots can be reverified live, never used directly",
    );
    assert.ok(recovered.every((r) => r.data.purchaseVerified === true));
  } finally {
    if (server)
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    await f.cleanup();
  }
});
