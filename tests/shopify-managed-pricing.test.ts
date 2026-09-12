/**
 * Shopify Managed Pricing: Free/Pro for new purchases; Starter/AI Brain remain historical only.
 * Run: npx tsx --test tests/shopify-managed-pricing.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SHOPIFY_BILLING_API_NEW_PURCHASE_PLANS,
  SHOPIFY_BILLING_PLANS,
  createShopifyBillingCharge,
  isShopifyBillingApiPlanForSale,
  mapShopifyPlanFromHints,
  pickPrimaryShopifySubscription,
} from "../server/shopify";
import { buildShopifyManagedPricingUrl } from "../shared/shopifyManagedPricing";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

test("historical SKU table still recognizes Starter $19 and AI Brain Add-on $29", () => {
  assert.equal(SHOPIFY_BILLING_PLANS.Starter.amount, 19);
  assert.equal(SHOPIFY_BILLING_PLANS.Pro.amount, 49);
  assert.equal(SHOPIFY_BILLING_PLANS["AI Brain Add-on"].amount, 29);
  assert.equal(SHOPIFY_BILLING_PLANS.Starter.trialDays, 14);
  assert.equal(SHOPIFY_BILLING_PLANS.Pro.trialDays, 14);
  assert.deepEqual(SHOPIFY_BILLING_API_NEW_PURCHASE_PLANS, ["Pro"]);
  assert.equal(isShopifyBillingApiPlanForSale("Pro"), true);
  assert.equal(isShopifyBillingApiPlanForSale("Starter"), false);
  assert.equal(isShopifyBillingApiPlanForSale("AI Brain Add-on"), false);
});

test("existing Starter and AI Brain subscriptions remain recognizable", () => {
  assert.equal(mapShopifyPlanFromHints("WhachatCRM Starter", null), "starter");
  assert.equal(mapShopifyPlanFromHints("", "starter"), "starter");
  assert.equal(mapShopifyPlanFromHints("WhachatCRM Pro", null), "pro");
  assert.equal(mapShopifyPlanFromHints("", "pro"), "pro");
  assert.equal(mapShopifyPlanFromHints("WhachatCRM Free", "free"), "free");

  const primary = pickPrimaryShopifySubscription([
    { id: "gid://shopify/AppSubscription/brain", name: "WhachatCRM AI Brain add-on", status: "ACTIVE" },
    { id: "gid://shopify/AppSubscription/starter", name: "WhachatCRM Starter", status: "ACTIVE" },
  ]);
  assert.equal(primary?.id, "gid://shopify/AppSubscription/starter");
  assert.equal(mapShopifyPlanFromHints(primary?.name || "", null), "starter");
});

test("Billing API cannot create new Starter or AI Brain Add-on charges", async () => {
  const starter = await createShopifyBillingCharge(
    "demo.myshopify.com",
    "token",
    "Starter",
    "https://app.whachatcrm.com/api/shopify/billing/return",
  );
  assert.equal(starter.ok, false);
  if (!starter.ok) {
    assert.equal(starter.code, "SHOPIFY_LEGACY_PLAN_NOT_FOR_SALE");
  }

  const brain = await createShopifyBillingCharge(
    "demo.myshopify.com",
    "token",
    "AI Brain Add-on",
    "https://app.whachatcrm.com/api/shopify/billing/return",
  );
  assert.equal(brain.ok, false);
  if (!brain.ok) {
    assert.equal(brain.code, "SHOPIFY_LEGACY_PLAN_NOT_FOR_SALE");
  }
});

test("app purchase paths open Managed Pricing and never call appSubscriptionCreate", () => {
  const routes = read("server/shopifyRoutes.ts");
  assert.ok(!routes.includes("createShopifyBillingCharge"));
  assert.match(routes, /appSubscriptionCreate disabled/);
  assert.match(routes, /respondSessionManagedPricing/);
  assert.match(routes, /checkout-web \(managed pricing redirect\)/);

  const checkout = read("client/src/lib/shopifyCheckout.ts");
  assert.match(checkout, /Never calls appSubscriptionCreate/);
  assert.match(checkout, /openShopifyManagedPricing/);
  assert.ok(!checkout.includes("createShopifyBillingCharge"));

  const pricing = read("client/src/pages/Pricing.tsx");
  assert.match(pricing, /if \(planId === "starter"\)/);
  assert.match(pricing, /shopifyCheckoutMutation.mutate\(planId\)/);
  assert.match(pricing, /openShopifyManagedPricing/);
  assert.ok(!pricing.includes("createShopifyBillingCharge"));

  const url = buildShopifyManagedPricingUrl("demo-store.myshopify.com", "whachatcrm");
  assert.equal(
    url,
    "https://admin.shopify.com/store/demo-store/charges/whachatcrm/pricing_plans",
  );
});
