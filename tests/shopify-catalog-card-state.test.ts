import { fixtureInventoryRequest } from "./shopify-inventory-fixture";
import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { catalogFixture } from "./shopify-catalog-fixture";
import {
  catalogSources,
  catalogProducts,
  catalogVariants,
} from "../shared/schema";
import { ensureCatalogSource } from "../server/salesCatalog/shopify/installation";
import { createCommerceStore } from "../server/salesCatalog/commerceStore";
import { createShopifyLiveProvider } from "../server/aiLiveBusinessData/providers/shopifyProvider";
import { catalogReadiness } from "../server/salesCatalog/shopify/readiness";
import { buildTurnEvidenceBundle } from "../shared/turnEvidence";
import { validateGroundedClaims } from "../shared/factGrounding";
import { validateCommerceDraft } from "../shared/commerceGrounding";

test("all-variant summary separates publication, out of stock, unavailable and a purchasable variant beyond the preview", async () => {
  const f = await catalogFixture(),
    db = f.database,
    store = createCommerceStore(
      db,
      fixtureInventoryRequest(db, (n) =>
        n.product.id === "gid://shopify/Product/stale" ? null : n,
      ),
    );
  try {
    const source = (await ensureCatalogSource(db, "tenant-a"))!;
    await db
      .update(catalogSources)
      .set({
        status: "ready",
        currency: "USD",
        grantedScopes: ["read_products", "read_inventory"],
        initialSyncCompletedAt: new Date(),
        lastSyncAt: new Date(),
      })
      .where(eq(catalogSources.id, source.id));
    const states = [
      "mixed",
      "sold-out",
      "unknown",
      "unsupported",
      "stale",
      "incomplete",
      "unpublished",
      "draft",
      "archived",
      "no-price",
      "no-currency",
    ];
    for (const id of states) {
      await db.insert(catalogProducts).values({
        id,
        userId: "tenant-a",
        sourceId: source.id,
        externalId: `gid://shopify/Product/${id}`,
        title: `Snowboard ${id}`,
        searchText: "snowboard",
        description: "Provider description",
        status:
          id === "draft" ? "DRAFT" : id === "archived" ? "ARCHIVED" : "ACTIVE",
        published: id !== "unpublished",
        complete: id !== "incomplete",
        variantCount: id === "mixed" ? 51 : 1,
        productUrl: null,
        providerUpdatedAt: new Date(),
        syncedAt: new Date(),
      });
      await db.insert(catalogVariants).values(
        Array.from({ length: id === "mixed" ? 51 : 1 }, (_, index) => ({
          id: `${id}-${index}`,
          userId: "tenant-a",
          sourceId: source.id,
          productId: id,
          externalId: `gid://shopify/ProductVariant/${id}-${String(index).padStart(3, "0")}`,
          title: `Size ${index}`,
          sku: `SKU-${index}`,
          options: [{ name: "Size", value: String(index) }],
          price: id === "no-price" ? null : "699.95",
          currency: id === "no-currency" ? null : "USD",
          tracked: true,
          quantity: id === "sold-out" || (id === "mixed" && index < 50) ? 0 : 5,
          availableForSale:
            id === "unknown"
              ? null
              : id !== "sold-out" && !(id === "mixed" && index < 50),
          requiresComponents: id === "unsupported",
          inventoryPolicy: "DENY",
          generation: "fixture",
          providerUpdatedAt: new Date(),
          verifiedAt: new Date(Date.now() - (id === "stale" ? 20 * 60_000 : 0)),
        })),
      );
    }
    const items = (await store.browse("tenant-a", source.id, {})).items;
    const byId = new Map(items.map((p) => [p.id, p]));
    assert.equal(byId.get("mixed")!.variants.length, 25);
    assert.ok(
      byId
        .get("mixed")!
        .variants.every((v) => v.availability === "out_of_stock"),
    );
    assert.equal(
      byId.get("mixed")!.availability,
      "available",
      "variant 51 is purchasable",
    );
    assert.equal(byId.get("sold-out")!.published, true);
    assert.equal(byId.get("sold-out")!.availability, "out_of_stock");
    for (const id of [
      "unknown",
      "unsupported",
      "stale",
      "incomplete",
      "unpublished",
      "draft",
      "archived",
    ])
      assert.equal(byId.get(id)!.availability, "unavailable", id);
    assert.deepEqual((await store.browse("tenant-b", source.id, {})).items, []);

    const provider = createShopifyLiveProvider(store, (userId) =>
      catalogReadiness(db, store, userId),
    );
    const records = await provider.query({
      userId: "tenant-a",
      message: "Recommend a snowboard",
    });
    assert.equal(records.length, 1);
    assert.deepEqual(records[0].data, {
      productId: "mixed",
      variantId: "mixed-50",
      externalProductId: "gid://shopify/Product/mixed",
      externalVariantId: "gid://shopify/ProductVariant/mixed-050",
      displayName: "Snowboard mixed / Size 50",
      price: "699.95",
      currency: "USD",
      availability: "available",
      freshness: "fresh",
      purchaseVerified: true,
      productUrl: null,
      images: [],
      options: [{ name: "Size", value: "50" }],
      active: true,
    });
    const bundle = buildTurnEvidenceBundle({
      userId: "tenant-a",
      retrieved: [],
      liveRecords: records,
    });
    assert.equal(
      validateGroundedClaims({
        draft: "Snowboard mixed / Size 50 costs USD 699.95.",
        retrieved: [],
        bundle,
      }).ok,
      true,
    );
    assert.equal(
      validateGroundedClaims({
        draft: "Snowboard mixed costs USD 19.95.",
        retrieved: [],
        bundle,
      }).ok,
      false,
    );
    for (const draft of [
      "Here is your checkout link",
      "Buy at https://fixture-a.myshopify.com/products/invented",
    ])
      assert.equal(
        validateCommerceDraft({
          draft,
          productUrls: [],
          inventoryUnverified: false,
        }).ok,
        false,
      );
    await db
      .update(catalogSources)
      .set({ currency: null })
      .where(eq(catalogSources.id, source.id));
    assert.deepEqual(
      await provider.query({
        userId: "tenant-a",
        message: "Recommend a snowboard",
      }),
      [],
    );
  } finally {
    await f.cleanup();
  }
});
