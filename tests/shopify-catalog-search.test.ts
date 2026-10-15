import assert from "node:assert/strict";
import test from "node:test";
import { eq, sql } from "drizzle-orm";
import { catalogFixture } from "./shopify-catalog-fixture";
import {
  catalogSources,
  catalogProducts,
  catalogVariants,
} from "../shared/schema";
import { ensureCatalogSource } from "../server/salesCatalog/shopify/installation";
import { createCommerceStore } from "../server/salesCatalog/commerceStore";

test("indexed connected search across 10000 products is bounded, deterministic, exact-price filtered and tenant isolated", async () => {
  const f = await catalogFixture();
  const db = f.database;
  const store = createCommerceStore(db);
  try {
    const source = (await ensureCatalogSource(db, "tenant-a"))!;
    const other = (await ensureCatalogSource(db, "tenant-b"))!;
    await db
      .update(catalogSources)
      .set({
        status: "ready",
        grantedScopes: ["read_products", "read_inventory"],
        initialSyncCompletedAt: new Date(),
        lastSyncAt: new Date(),
      })
      .where(eq(catalogSources.id, source.id));
    const products = Array.from({ length: 10000 }, (_, i) => ({
      id: `product-${String(i).padStart(5, "0")}`,
      userId: "tenant-a",
      sourceId: source.id,
      externalId: `gid://shopify/Product/${i + 1}`,
      title: i === 2500 ? "Blue running shoes" : "Running shoes",
      description: "Brand shoes",
      status: i === 2501 ? "DRAFT" : "ACTIVE",
      published: i !== 2502,
      complete: true,
      productUrl: `https://fixture-a.myshopify.com/products/shoes-${i}`,
      productType: "Shoes",
      vendor: "Fixture",
      options: [],
      providerTags: [],
      providerUpdatedAt: new Date(),
      syncedAt: new Date(),
      searchText: `running shoes blue sku-${String(i).padStart(5, "0")} summer footwear`,
      variantCount: 1,
    }));
    const variants = products.map((p, i) => ({
      id: `variant-${String(i).padStart(5, "0")}`,
      userId: p.userId,
      sourceId: p.sourceId,
      productId: p.id,
      externalId: `gid://shopify/ProductVariant/${i + 1}`,
      title: "Blue size 9",
      sku: `SKU-${String(i).padStart(5, "0")}`,
      price: i % 2 ? "100.000001" : "99.999999",
      currency: "USD",
      tracked: true,
      quantity: 5,
      inventoryPolicy: "DENY",
      availableForSale: true,
      providerUpdatedAt: new Date(),
      verifiedAt: new Date(),
      generation: "fixture",
    }));
    for (let i = 0; i < products.length; i += 200) {
      await db.insert(catalogProducts).values(products.slice(i, i + 200));
      await db.insert(catalogVariants).values(variants.slice(i, i + 200));
    }
    await db.execute(sql`ANALYZE catalog_products`);
    await db.execute(sql`ANALYZE catalog_variants`);
    const start = performance.now();
    const input = {
      sourceId: source.id,
      query: "running shoes",
      limit: 100,
      filters: { maxPrice: "100.000000", currency: "USD" },
    };
    const a = await store.searchCandidates("tenant-a", input);
    const elapsed = performance.now() - start;
    assert.equal(a.length, 100);
    assert.deepEqual(
      (await store.searchCandidates("tenant-a", input)).map((p) => p.id),
      a.map((p) => p.id),
    );
    assert.ok(a.every((p) => p.variants.every((v) => v.price === "99.999999")));
    assert.ok(a.every((p) => p.status === "ACTIVE" && p.published));
    assert.equal(
      (
        await store.searchCandidates("tenant-a", {
          sourceId: source.id,
          query: "SKU-02500",
        })
      )[0].id,
      "product-02500",
    );
    assert.equal(
      (
        await store.searchCandidates("tenant-a", {
          sourceId: source.id,
          query: "SKU-02501",
        })
      ).length,
      0,
    );
    assert.equal(
      (
        await store.searchCandidates("tenant-a", {
          sourceId: source.id,
          query: "SKU-02502",
        })
      ).length,
      0,
    );
    assert.equal((await store.searchCandidates("tenant-b", input)).length, 0);
    assert.equal(
      (
        await store.searchCandidates("tenant-a", {
          sourceId: other.id,
          query: "shoes",
        })
      ).length,
      0,
    );
    await assert.rejects(
      store.searchCandidates("tenant-a", { ...input, limit: 101 }),
    );
    // PostgreSQL's planner may choose a bitmap combination or the GIN path; verify the actual indexed search pattern.
    const plan = await db.execute(
      sql`EXPLAIN (FORMAT JSON) SELECT id FROM catalog_products WHERE user_id='tenant-a' AND source_id=${source.id} AND to_tsvector('simple',search_text) @@ plainto_tsquery('simple','sku-02500') ORDER BY id LIMIT 25`,
    );
    assert.match(JSON.stringify(plan), /catalog_product_search/);
    console.info(
      JSON.stringify({
        catalogFixtureProducts: 10000,
        candidateLimit: 100,
        searchMilliseconds: Math.round(elapsed),
        indexedPlan: true,
      }),
    );
    await assert.rejects(
      db
        .insert(catalogProducts)
        .values({ ...products[0], id: "cross-tenant", sourceId: other.id }),
      (error: any) => /foreign key|violates/i.test(String(error.cause?.message)),
    );
  } finally {
    await f.cleanup();
  }
});
