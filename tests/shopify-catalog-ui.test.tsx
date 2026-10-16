import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { createInstance } from "i18next";
import { ShopifyCatalogView } from "../client/src/components/ShopifyCatalogView";
import { SalesCatalogView } from "../client/src/pages/SalesCatalogView";
import en from "../client/src/locales/en.json";
import es from "../client/src/locales/es.json";
import he from "../client/src/locales/he.json";
(globalThis as any).React = React;
export const uiProduct = {
  id: "fixture-product",
  userId: "tenant-a",
  sourceId: "source-a",
  externalId: "gid://shopify/Product/1",
  title: "Black shoes",
  description: "Leather shoes",
  productType: "Shoes",
  vendor: "Fixture",
  status: "ACTIVE",
  published: true,
  productUrl: "https://fixture-a.myshopify.com/products/shoes",
  aiGuidance: null,
  notes: null,
  merchantTags: [],
  syncedAt: new Date(),
  freshness: "fresh",
  variantCount: 51,
  minPrice: "19.990001",
  maxPrice: "69.990001",
  currency: "USD",
  variants: [
    {
      id: "v",
      externalId: "gid://shopify/ProductVariant/1",
      title: "Black / Size 9",
      sku: "SHOE-9",
      options: [],
      price: "19.990001",
      compareAtPrice: null,
      currency: "USD",
      tracked: true,
      quantity: 5,
      inventoryPolicy: "DENY",
      availableForSale: true,
      requiresComponents: false,
      verifiedAt: new Date(),
      availability: "available",
    },
  ],
  images: [
    { url: "https://cdn.shopify.com/fixture-shoe.png", altText: "Shoes" },
  ],
  collections: [{ id: "summer", title: "Summer footwear" }],
};
export const uiStatus = {
  status: "ready",
  connection: "connected",
  missingScopes: [],
  eligibleProductCount: 10000,
  publishedProductCount: 10000,
  inventoryUnverifiedProductCount: 0,
  inventoryCapability: "aggregate_polling",
  lastSyncAt: new Date().toISOString(),
  freshness: "fresh",
  authorizationEnabled: false,
  sourceId: "source-a",
};
test("localized responsive Shopify catalog distinguishes authorization, freshness, exact price ranges and all variant counts", async () => {
  for (const [lng, resource] of Object.entries({ en, es, he })) {
    assert.deepEqual(
      Object.keys(resource.salesCatalog.commerce).sort(),
      Object.keys(en.salesCatalog.commerce).sort(),
    );
    const i18n = createInstance();
    await i18n.init({
      lng,
      resources: { [lng]: { translation: resource } },
      interpolation: { escapeValue: false },
    });
    const render = (status = uiStatus) =>
      renderToStaticMarkup(
        <I18nextProvider i18n={i18n}>
          <SalesCatalogView>
            <ShopifyCatalogView
              status={status}
              items={[uiProduct]}
              loading={false}
              query=""
              onQuery={() => {}}
              onSync={() => {}}
              syncing={false}
              onSelect={() => {}}
            />
          </SalesCatalogView>
        </I18nextProvider>,
      );
    const html = render();
    assert.match(html, /19.990001 – 69.990001/);
    assert.match(html, /51/);
    assert.ok(html.includes(resource.salesCatalog.commerce.ready));
    assert.ok(html.includes(resource.salesCatalog.commerce.publishedProducts));
    assert.ok(
      html.includes(resource.salesCatalog.commerce.inventoryUnverified),
    );
    assert.ok(html.includes(lng === "he" ? 'dir="rtl"' : 'dir="ltr"'));
    assert.match(html, /sm:grid-cols-2 lg:grid-cols-3/);
    const blocked = render({
      ...uiStatus,
      status: "permission_required",
      missingScopes: ["read_products"],
      authorizationEnabled: false,
      eligibleProductCount: 0,
    });
    assert.ok(blocked.includes(resource.salesCatalog.commerce.releaseRequired));
    assert.doesNotMatch(blocked, /href="\/api\/shopify\/catalog\/authorize"/);
    const authorized = render({
      ...uiStatus,
      status: "permission_required",
      missingScopes: ["read_products"],
      authorizationEnabled: true,
    });
    assert.match(authorized, /href="\/api\/shopify\/catalog\/authorize"/);
  }
});

test("cards show independent localized publication and product-wide availability labels", async () => {
  for (const [lng, resource] of Object.entries({ en, es, he })) {
    const i18n = createInstance();
    await i18n.init({
      lng,
      resources: { [lng]: { translation: resource } },
      interpolation: { escapeValue: false },
    });
    for (const [published, availability] of [
      [true, "available"],
      [true, "out_of_stock"],
      [true, "unavailable"],
      [false, "unavailable"],
    ] as const) {
      const html = renderToStaticMarkup(
        <I18nextProvider i18n={i18n}>
          <ShopifyCatalogView
            items={[
              {
                ...uiProduct,
                published,
                availability,
                variants: [
                  { ...uiProduct.variants[0], availability: "not_published" },
                ],
              },
            ]}
            loading={false}
            query=""
            onQuery={() => {}}
            onSync={() => {}}
            syncing={false}
            onSelect={() => {}}
          />
        </I18nextProvider>,
      );
      assert.ok(
        html.includes(
          resource.salesCatalog.commerce[
            published ? "published" : "unpublished"
          ],
        ),
      );
      assert.ok(html.includes(resource.salesCatalog.commerce[availability]));
      if (published)
        assert.ok(!html.includes(resource.salesCatalog.commerce.not_published));
    }
  }
});
