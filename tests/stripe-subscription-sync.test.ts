/**
 * Stripe subscription sync: cancel-at-period-end keeps paid plan;
 * terminal status drops to Free. No local fake-cancel.
 * Run: npx tsx --test tests/stripe-subscription-sync.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildUserUpdatesFromStripeSubscription } from "../server/stripeSubscriptionSync";
import {
  entitlementPlanFromStripePriceIds,
  STARTER_CHECKOUT_RETIRED_CODE,
  AI_BRAIN_ADDON_RETIRED_CODE,
} from "../server/stripePlanPriceIds";

const env = {
  STRIPE_STARTER_MONTHLY_PRICE_ID: "price_starter_month",
  STRIPE_STARTER_YEARLY_PRICE_ID: "price_starter_year",
  STRIPE_PRO_MONTHLY_PRICE_ID: "price_pro_month",
  STRIPE_PRO_YEARLY_PRICE_ID: "price_pro_year",
  STRIPE_AI_BRAIN_MONTHLY_PRICE_ID: "price_brain_month",
};

test("cancel-at-period-end while still active keeps Pro", () => {
  const updates = buildUserUpdatesFromStripeSubscription({
    status: "active",
    cancelAtPeriodEnd: true,
    priceIds: ["price_pro_month"],
    env,
    subscriptionId: "sub_123",
  });
  assert.equal(updates.billingPlan, "pro");
  assert.equal(updates.subscriptionStatus, "active");
  assert.notEqual(updates.billingPlan, "free");
});

test("completed cancellation (canceled) marks local billing Free", () => {
  const updates = buildUserUpdatesFromStripeSubscription({
    status: "canceled",
    cancelAtPeriodEnd: false,
    priceIds: ["price_pro_month"],
    env,
  });
  assert.equal(updates.billingPlan, "free");
  assert.equal(updates.subscriptionStatus, "canceled");
});

test("unpaid / incomplete_expired are terminal", () => {
  for (const status of ["unpaid", "incomplete_expired"] as const) {
    const updates = buildUserUpdatesFromStripeSubscription({
      status,
      priceIds: ["price_pro_month"],
      env,
    });
    assert.equal(updates.billingPlan, "free", status);
  }
});

test("historical Starter and AI Brain price IDs do not crash processing", () => {
  assert.equal(
    entitlementPlanFromStripePriceIds(["price_starter_month", "price_brain_month"], env),
    "starter",
  );
  assert.equal(
    entitlementPlanFromStripePriceIds(["price_pro_month", "price_brain_month"], env),
    "pro",
  );
  assert.doesNotThrow(() =>
    buildUserUpdatesFromStripeSubscription({
      status: "active",
      priceIds: ["price_starter_year", "price_brain_month"],
      env,
    }),
  );
});

test("user-facing cancel routes to Stripe portal and does not locally mark Free", () => {
  const service = readFileSync(join(process.cwd(), "server/subscriptionService.ts"), "utf8");
  assert.ok(service.includes("USE_STRIPE_PORTAL"));
  assert.ok(service.includes("createPortalSession"));
  assert.ok(service.includes("Your plan stays active until Stripe confirms cancellation"));
  assert.match(service, /async cancelSubscription\([\s\S]*createPortalSession/);
  assert.doesNotMatch(
    service.slice(service.indexOf("async cancelSubscription(")),
    /subscriptionPlan:\s*"free"/,
  );

  const settings = readFileSync(join(process.cwd(), "client/src/pages/Settings.tsx"), "utf8");
  assert.ok(!settings.includes('title: "Subscription Canceled"'));
  assert.ok(settings.includes("Manage in Stripe"));
});

test("retired checkout codes remain for Starter and Brain add-on", () => {
  assert.equal(STARTER_CHECKOUT_RETIRED_CODE, "STARTER_NO_LONGER_OFFERED");
  assert.equal(AI_BRAIN_ADDON_RETIRED_CODE, "AI_BRAIN_INCLUDED_IN_PRO");
});
