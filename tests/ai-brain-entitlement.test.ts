/**
 * AI Brain is included with effective Pro (paid or trial).
 * Free after trial never inherits a sticky Shopify/Stripe add-on flag.
 * Run: npx tsx --test tests/ai-brain-entitlement.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { growthEngineEligibleForPlan, resolveAIBrainAccess } from "../shared/aiBrainEntitlement";

const now = new Date("2026-08-31T12:00:00.000Z");
const future = new Date("2026-09-14T12:00:00.000Z");
const past = new Date("2026-08-01T12:00:00.000Z");

function baseUser(overrides: Record<string, unknown> = {}) {
  return {
    trialEndsAt: null,
    trialStatus: "none",
    trialPlan: null,
    planOverrideEnabled: false,
    planOverride: null,
    billingPlan: "free",
    subscriptionStatus: "none",
    shopifyShop: null,
    shopifySubscriptionStatus: null,
    shopifyAIBrainEnabled: false,
    aiBrainEntitlementOverrideEnabled: false,
    aiBrainEntitlementOverrideGrant: false,
    email: "user@example.com",
    ...overrides,
  } as Parameters<typeof resolveAIBrainAccess>[0];
}

test("Pro without an AI Brain Stripe item receives AI Brain", () => {
  const result = resolveAIBrainAccess(
    baseUser({ billingPlan: "pro", subscriptionStatus: "active" }),
    { now, liveStripeAddon: false },
  );
  assert.equal(result.hasAIBrain, true);
  assert.equal(result.source, "pro");
});

test("Active Pro trial receives AI Brain", () => {
  const result = resolveAIBrainAccess(
    baseUser({
      billingPlan: "free",
      subscriptionStatus: "none",
      trialPlan: "pro_ai",
      trialStatus: "active",
      trialEndsAt: future,
    }),
    { now, liveStripeAddon: false },
  );
  assert.equal(result.hasAIBrain, true);
  assert.equal(result.source, "trial");
});

test("Expired trial on Free does not receive AI Brain", () => {
  const result = resolveAIBrainAccess(
    baseUser({
      billingPlan: "free",
      trialPlan: "pro_ai",
      trialStatus: "expired",
      trialEndsAt: past,
      shopifyAIBrainEnabled: true,
    }),
    { now, liveStripeAddon: true },
  );
  assert.equal(result.hasAIBrain, false);
  assert.equal(result.source, "none");
});

test("Shopify add-on flags cannot grant Brain to an expired Free account", () => {
  const result = resolveAIBrainAccess(
    baseUser({
      billingPlan: "free",
      shopifyShop: "store.myshopify.com",
      shopifySubscriptionStatus: "cancelled",
      shopifyAIBrainEnabled: true,
      trialStatus: "expired",
      trialEndsAt: past,
    }),
    { now, liveStripeAddon: true },
  );
  assert.equal(result.hasAIBrain, false);
});

test("Admin override still grants or denies Brain", () => {
  assert.equal(
    resolveAIBrainAccess(
      baseUser({
        billingPlan: "free",
        aiBrainEntitlementOverrideEnabled: true,
        aiBrainEntitlementOverrideGrant: true,
      }),
      { now },
    ).hasAIBrain,
    true,
  );
  assert.equal(
    resolveAIBrainAccess(
      baseUser({
        billingPlan: "pro",
        subscriptionStatus: "active",
        aiBrainEntitlementOverrideEnabled: true,
        aiBrainEntitlementOverrideGrant: false,
      }),
      { now },
    ).hasAIBrain,
    false,
  );
});

test("Growth Engine eligibility is Pro-only", () => {
  assert.equal(growthEngineEligibleForPlan("pro"), true);
  assert.equal(growthEngineEligibleForPlan("free"), false);
  assert.equal(growthEngineEligibleForPlan("starter"), false);
});

test("Grandfathered Starter may keep a live Brain add-on", () => {
  const withStripe = resolveAIBrainAccess(
    baseUser({ billingPlan: "starter", subscriptionStatus: "active" }),
    { now, liveStripeAddon: true },
  );
  assert.equal(withStripe.hasAIBrain, true);
  assert.equal(withStripe.source, "stripe");

  const without = resolveAIBrainAccess(
    baseUser({ billingPlan: "starter", subscriptionStatus: "active" }),
    { now, liveStripeAddon: false },
  );
  assert.equal(without.hasAIBrain, false);
});
