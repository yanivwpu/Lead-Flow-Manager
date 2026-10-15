import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { catalogFixture } from "./shopify-catalog-fixture";
import {
  catalogSources,
  catalogProducts,
  catalogVariants,
} from "../shared/schema";
import { ensureCatalogSource } from "../server/salesCatalog/shopify/installation";
import { createCommerceStore } from "../server/salesCatalog/commerceStore";
import { catalogReadiness } from "../server/salesCatalog/shopify/readiness";
import { createShopifyLiveProvider } from "../server/aiLiveBusinessData/providers/shopifyProvider";
import { buildTurnEvidenceBundle } from "../shared/turnEvidence";
import { validateGroundedClaims } from "../shared/factGrounding";
import { validateCommerceDraft } from "../shared/commerceGrounding";
import {
  resolveLiveBusinessDataDecision,
  buildLiveBusinessDataPromptBlock,
} from "../shared/aiLiveBusinessData";
import {
  createCatalogRequest,
  CatalogApiError,
} from "../server/salesCatalog/shopify/api";

test("product intent overrides generic pricing while named manual packages retain legacy routing", () => {
  for (const message of [
    "Do you have black shoes under $100?",
    "What sizes are available?",
    "Do you have this in blue?",
    "Which product would you recommend?",
    "Is this item in stock?",
    "How much does this specific product cost?",
  ]) {
    const d = resolveLiveBusinessDataDecision({
      message,
      subIntents: ["pricing_question"],
    });
    assert.deepEqual(d.providerIds, ["shopify"], message);
  }
  assert.deepEqual(
    resolveLiveBusinessDataDecision({
      message: "Do you have the Gold package?",
      subIntents: ["pricing_question"],
    }).providerIds,
    ["businessPackages"],
  );
});

test("real bounded AI retrieval, structured decimal grounding, verified URL authority and stale inventory", async () => {
  const f = await catalogFixture();
  const db = f.database,
    store = createCommerceStore(db);
  const provider = createShopifyLiveProvider(store, (userId) =>
    catalogReadiness(db, store, userId),
  );
  try {
    const source = (await ensureCatalogSource(db, "tenant-a"))!;
    assert.equal(
      (await provider.getStatus("tenant-a")).catalogReadiness?.catalog,
      "permission_required",
    );
    assert.deepEqual(
      await provider.query({ userId: "tenant-a", message: "products" }),
      [],
    );
    await db
      .update(catalogSources)
      .set({
        status: "ready",
        currency: "USD",
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
        title: "Black shoes",
        description: "Website text says $999; structured price wins",
        status: "ACTIVE",
        published: true,
        complete: true,
        productUrl: "https://fixture-a.myshopify.com/products/shoes",
        variantCount: 2,
        searchText: "black shoes blue sku-1",
        providerUpdatedAt: new Date(),
      });
    await db
      .insert(catalogVariants)
      .values(
        [1, 2].map((n) => ({
          id: `v${n}`,
          userId: "tenant-a",
          sourceId: source.id,
          productId: "p",
          externalId: `gid://shopify/ProductVariant/${n}`,
          title: `Blue size ${n}`,
          price: n === 1 ? "99.999999" : "100.000001",
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
    const rows = await provider.query({
      userId: "tenant-a",
      message: "Do you have black shoes under $100?",
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].data.variantId, "v1");
    assert.equal(rows[0].data.price, "99.999999");
    assert.equal(
      (await provider.getStatus("tenant-a")).catalogReadiness?.catalog,
      "ready",
    );
    assert.deepEqual(
      await provider.query({ userId: "tenant-b", message: "black shoes" }),
      [],
    );
    const bundle = buildTurnEvidenceBundle({
      userId: "tenant-a",
      retrieved: [],
      liveRecords: rows,
    });
    const item = bundle.items.find(
      (v) => v.sourceType === "canonical_catalog",
    )!;
    assert.ok(item);
    assert.deepEqual(
      item.amounts.map((v) => v.amount),
      ["99.999999"],
    );
    assert.equal(
      validateGroundedClaims({
        draft: "The shoes cost USD 99.999999.",
        retrieved: [],
        bundle,
      }).ok,
      true,
    );
    assert.equal(
      validateGroundedClaims({
        draft: "The shoes cost USD 999.",
        retrieved: [],
        bundle,
      }).ok,
      false,
    );
    assert.match(
      buildLiveBusinessDataPromptBlock(rows).text,
      /Website prices cannot override/,
    );
    const guard = {
      productUrls: [String(rows[0].data.productUrl)],
      inventoryUnverified: true,
    };
    assert.equal(
      validateCommerceDraft({
        ...guard,
        draft:
          "Stock is unverified. See https://fixture-a.myshopify.com/products/shoes",
      }).ok,
      true,
    );
    for (const draft of [
      "Available now",
      "במלאי",
      "Disponible ahora",
      "5 units left",
      "Use https://evil.invalid/shoes",
      "Here is a checkout payment link",
    ])
      assert.equal(validateCommerceDraft({ ...guard, draft }).ok, false, draft);
    await db
      .update(catalogVariants)
      .set({ verifiedAt: new Date(Date.now() - 20 * 60_000) })
      .where(eq(catalogVariants.id, "v1"));
    const stale = await provider.query({
      userId: "tenant-a",
      message: "black shoes under $100",
    });
    assert.equal(stale[0].data.availability, "stale");
    const staleBundle = buildTurnEvidenceBundle({
      userId: "tenant-a",
      retrieved: [],
      liveRecords: stale,
    });
    assert.equal(
      staleBundle.items.find((v) => v.sourceType === "canonical_catalog")!
        .amounts[0].supportsAuto,
      false,
    );
    assert.deepEqual(
      await store.searchCandidates("tenant-a", {
        sourceId: source.id,
        query: "shoes",
        filters: { availability: "available", maxPrice: "100" },
      }),
      [],
    );
    await db
      .update(catalogVariants)
      .set({ verifiedAt: new Date(), quantity: 0, inventoryPolicy: "CONTINUE" })
      .where(eq(catalogVariants.id, "v1"));
    const allowed = await store.searchCandidates("tenant-a", {
      sourceId: source.id,
      query: "shoes",
      filters: { availability: "available", maxPrice: "100" },
    });
    assert.equal(allowed[0].variants[0].availability, "available");
  } finally {
    await f.cleanup();
  }
});

test("bounded API wrapper classifies response and SDK errors without leaking credentials or retrying inline", async () => {
  for (const [error, expected] of [
    [{ errors: [{ extensions: { code: "THROTTLED" } }] }, "throttled"],
    [
      {
        errors: { graphQLErrors: [{ extensions: { code: "ACCESS_DENIED" } }] },
      },
      "access_denied",
    ],
    [{ errors: "secret-token" }, "unavailable"],
  ] as const) {
    let calls = 0;
    const request = createCatalogRequest({
      request: async (_q, opts) => {
        calls++;
        assert.equal(opts.retries, 0);
        return error;
      },
    });
    await assert.rejects(
      request("fixture"),
      (e: any) =>
        e instanceof CatalogApiError &&
        e.code === expected &&
        !e.message.includes("secret-token"),
    );
    assert.equal(calls, 1);
  }
  const request = createCatalogRequest({
    request: async () => {
      throw { response: { code: 429 }, body: { errors: "credential" } };
    },
  });
  await assert.rejects(request("fixture"), (e: any) => e.code === "throttled");
});
