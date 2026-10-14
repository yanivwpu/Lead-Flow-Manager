import assert from "node:assert/strict";
import test from "node:test";
import { businessPackagesProvider } from "../server/aiLiveBusinessData/providers/businessPackagesProvider";
import { shopifyProvider } from "../server/aiLiveBusinessData/providers/shopifyProvider";
import { salesCatalog } from "../server/salesCatalog";
import { storage } from "../server/storage";
import {
  PAYMENT_LINK_HUMAN_APPROVAL_REASON,
  draftContainsCheckoutUrl,
} from "../shared/workspaceOffers";

test("AI provider uses the shared service without changing offer records or payment-link approval", async () => {
  const original = salesCatalog.recommend;
  const offer = {
    id: "offer-gold",
    userId: "merchant",
    internalName: "Gold",
    displayName: "Gold package",
    description: "Support",
    benefits: ["Support"],
    priceDisplay: "$49",
    billingCadence: "month" as const,
    checkoutUrl: "https://checkout.example.invalid/gold",
    followUpUrl: "https://example.invalid/onboarding",
    availability: "available" as const,
    active: true,
    sortOrder: 0,
    category: "Services",
    tags: [],
    aiGuidance: null,
    archivedAt: null,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
  const before = structuredClone(offer);
  let calls = 0;
  salesCatalog.recommend = async (userId, input) => {
    calls++;
    assert.equal(userId, "merchant");
    assert.equal(input.limit, 2);
    return [offer];
  };
  try {
    const rows = await businessPackagesProvider.query({
      userId: "merchant",
      message: "I want to buy Gold package",
      limit: 2,
    });
    assert.equal(calls, 1);
    assert.equal(rows[0].providerId, "businessPackages");
    assert.equal(rows[0].recordType, "offer");
    assert.equal(rows[0].data.packageId, offer.id);
    assert.equal(rows[0].data.priceDisplay, "$49");
    assert.equal(rows[0].data.checkoutUrl, offer.checkoutUrl);
    assert.match(rows[0].summary, /human approval before send/);
    assert.ok(
      draftContainsCheckoutUrl(String(rows[0].data.checkoutUrl), [
        offer.checkoutUrl,
      ]),
    );
    assert.equal(
      PAYMENT_LINK_HUMAN_APPROVAL_REASON,
      "payment_link_requires_human_approval",
    );
    assert.deepEqual(offer, before);
    salesCatalog.recommend = async () => [{ ...offer, checkoutUrl: null }];
    const missing = await businessPackagesProvider.query({
      userId: "merchant",
      message: "Buy Gold package",
    });
    assert.equal(missing[0].data.checkoutUrl, null);
    assert.match(missing[0].summary, /do not invent/i);
  } finally {
    salesCatalog.recommend = original;
  }
});

test("connected Shopify status explicitly distinguishes unimplemented product availability", async () => {
  const original = storage.getUser;
  storage.getUser = async () =>
    ({
      shopifyShop: "fixture.myshopify.com",
      shopifyInstalledAt: new Date(),
    }) as Awaited<ReturnType<typeof original>>;
  try {
    const status = await shopifyProvider.getStatus("merchant");
    assert.equal(status.status, "connected");
    assert.match(status.detail!, /Product catalog unavailable/);
    assert.deepEqual(status.catalogReadiness, {
      connection: "connected",
      catalog: "not_implemented",
    });
    assert.deepEqual(
      await shopifyProvider.query({ userId: "merchant", message: "products" }),
      [],
    );
    storage.getUser = async () => undefined;
    assert.equal(
      (await shopifyProvider.getStatus("merchant")).catalogReadiness
        ?.connection,
      "disconnected",
    );
  } finally {
    storage.getUser = original;
  }
});
