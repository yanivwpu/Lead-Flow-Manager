import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { eq } from "drizzle-orm";
import { catalogFixture } from "./shopify-catalog-fixture";
import {
  catalogSources,
  catalogProducts,
  catalogVariants,
} from "../shared/schema";
import { ensureCatalogSource } from "../server/salesCatalog/shopify/installation";
import { createCommerceStore } from "../server/salesCatalog/commerceStore";
import {
  registerShopifyCatalogRoutes,
  verifyCatalogVariant,
} from "../server/salesCatalog/shopify/routes";

test("merchant HTTP uses existing owner access, rejects provider edits, throttles sync, pages variants and verifies an exact variant beyond the first page", async () => {
  const f = await catalogFixture();
  const db = f.database,
    store = createCommerceStore(db);
  let server: ReturnType<typeof express.prototype.listen> | undefined;
  try {
    const source = (await ensureCatalogSource(db, "tenant-a"))!;
    await db
      .update(catalogSources)
      .set({
        status: "ready",
        currency: "USD",
        allowedHosts: ["fixture-a.myshopify.com"],
        grantedScopes: ["read_products"],
        initialSyncCompletedAt: new Date(),
        lastSyncAt: new Date(),
      })
      .where(eq(catalogSources.id, source.id));
    await db
      .insert(catalogProducts)
      .values({
        id: "p",
        userId: "tenant-a",
        sourceId: source.id,
        externalId: "gid://shopify/Product/1",
        title: "Shoes",
        status: "ACTIVE",
        published: true,
        complete: true,
        variantCount: 51,
        searchText: "shoes",
        providerUpdatedAt: new Date(),
      });
    await db
      .insert(catalogVariants)
      .values(
        Array.from({ length: 51 }, (_, i) => ({
          id: `v${i}`,
          userId: "tenant-a",
          sourceId: source.id,
          productId: "p",
          externalId: `gid://shopify/ProductVariant/${String(i).padStart(3, "0")}`,
          title: `Size ${i}`,
          price: String(i + 19) + ".990001",
          currency: "USD",
          quantity: 5,
          tracked: true,
          inventoryPolicy: "DENY",
          availableForSale: true,
          providerUpdatedAt: new Date(),
          verifiedAt: new Date(),
          generation: "fixture",
        })),
      );
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const id = req.header("x-fixture-user");
      if (id) req.user = { id } as any;
      next();
    });
    registerShopifyCatalogRoutes(app, db, store);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server!.once("listening", resolve));
    const root = `http://127.0.0.1:${(server.address() as any).port}`;
    const call = (
      path: string,
      user = "tenant-a",
      method = "GET",
      body?: unknown,
    ) =>
      fetch(root + path, {
        method,
        headers: {
          ...(user ? { "x-fixture-user": user } : {}),
          "content-type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const base = "/api/sales-catalog/commerce";
    assert.equal((await call(`${base}/products`, "")).status, 401);
    assert.equal((await call(`${base}/products/p`, "tenant-b")).status, 404);
    const page = await (await call(`${base}/products`)).json();
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].minPrice, "19.990001");
    assert.equal(page.items[0].maxPrice, "69.990001");
    assert.equal(page.items[0].variantCount, 51);
    assert.equal(page.items[0].variants.length, 25);
    assert.doesNotMatch(
      JSON.stringify(page),
      /fixture-token|shopifyAccessToken/,
    );
    assert.equal(
      (await call(`${base}/products/p`, "tenant-a", "PATCH", { price: "1.00" }))
        .status,
      400,
    );
    assert.equal(
      (
        await call(`${base}/products/p`, "tenant-a", "PATCH", {
          aiGuidance: "Ask their size",
          notes: "Merchant-owned",
          merchantTags: ["featured"],
        })
      ).status,
      200,
    );
    assert.equal(
      (await store.lookup("tenant-a", source.id, "p"))!.aiGuidance,
      "Ask their size",
    );
    let cursor: string | null = null;
    const ids: string[] = [];
    do {
      const r = await call(
        `${base}/products/p/variants${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      assert.equal(r.status, 200);
      const page = await r.json();
      assert.ok(page.items.length <= 25);
      ids.push(...page.items.map((v: any) => v.id));
      cursor = page.nextCursor;
    } while (cursor);
    assert.equal(new Set(ids).size, 51);
    assert.equal(ids.length, 51);
    assert.equal(
      (await call(`${base}/products/p/variants`, "tenant-b")).status,
      404,
    );
    assert.equal(
      (await call(`${base}/sync`, "tenant-a", "POST", {})).status,
      202,
    );
    assert.equal(
      (await call(`${base}/sync`, "tenant-a", "POST", {})).status,
      429,
    );
    const before = process.env.SHOPIFY_CATALOG_AUTH_ENABLED;
    delete process.env.SHOPIFY_CATALOG_AUTH_ENABLED;
    assert.equal((await call("/api/shopify/catalog/authorize")).status, 409);
    if (before) process.env.SHOPIFY_CATALOG_AUTH_ENABLED = before;
    const result = await verifyCatalogVariant(
      db,
      store,
      "tenant-a",
      "p",
      "v50",
      () => async (_q, vars) => {
        assert.equal(vars!.id, "gid://shopify/ProductVariant/050");
        return {
          shop: { currencyCode: "USD" },
          productVariant: {
            id: vars!.id,
            price: "70.000001",
            inventoryItem: { tracked: true },
            inventoryQuantity: 0,
            availableForSale: true,
            inventoryPolicy: "CONTINUE",
            requiresComponents: false,
            product: {
              id: "gid://shopify/Product/1",
              status: "ACTIVE",
              publishedAt: new Date().toISOString(),
              onlineStoreUrl: "https://fixture-a.myshopify.com/products/shoes",
              requiresSellingPlan: false,
            },
          },
        };
      },
    );
    assert.equal(result.price, "70.000001");
    assert.equal(result.availability, "available");
    await assert.rejects(
      verifyCatalogVariant(
        db,
        store,
        "tenant-b",
        "p",
        "v50",
        () => async () => {
          throw Error("Must not call provider across tenants");
        },
      ),
      /variant_not_owned/,
    );
  } finally {
    if (server)
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    await f.cleanup();
  }
});
