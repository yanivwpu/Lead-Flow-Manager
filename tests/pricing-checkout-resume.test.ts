/**
 * Resume Stripe checkout after login via /auth?redirect= with validated plan + interval.
 * Run: npx tsx --test tests/pricing-checkout-resume.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  billingIntervalFromSearch,
  buildPricingAuthRedirect,
  buildPricingCheckoutIntentSearch,
  parsePricingCheckoutIntent,
  parsePricingBillingInterval,
  parsePricingCheckoutPlan,
  shouldResumePricingCheckout,
  stripPricingCheckoutParam,
} from "../client/src/lib/pricingCheckoutIntent";
import { resolveStripePlanPriceId } from "../server/stripePlanPriceIds";

const root = process.cwd();

const resumeBase = {
  hasUser: true,
  authLoading: false,
  subscriptionResolved: true,
  isShopify: false,
  billingPlan: "free" as const,
  isActiveProAiTrial: false,
};

test("A–D: logged-out Pro upgrade encodes plan+interval; old Starter URLs do not resume checkout", () => {
  const proCases = [
    { plan: "pro" as const, billingInterval: "monthly" as const },
    { plan: "pro" as const, billingInterval: "yearly" as const },
  ];

  for (const c of proCases) {
    const href = buildPricingAuthRedirect({
      pricingPath: "/pricing",
      plan: c.plan,
      billingInterval: c.billingInterval,
    });
    assert.ok(href.startsWith("/auth?redirect="));
    const redirect = decodeURIComponent(href.slice("/auth?redirect=".length));
    const intent = parsePricingCheckoutIntent(redirect.split("?")[1] || "");
    assert.deepEqual(intent, c);

    assert.equal(
      shouldResumePricingCheckout({ ...resumeBase, intent }),
      true,
    );
  }

  for (const billingInterval of ["monthly", "yearly"] as const) {
    const intent = parsePricingCheckoutIntent(`checkout=starter&billing=${billingInterval}`);
    assert.deepEqual(intent, { plan: "starter", billingInterval });
    assert.equal(
      shouldResumePricingCheckout({ ...resumeBase, intent }),
      false,
      "old Starter checkout URLs must not auto-charge Pro",
    );
  }
});

test("E: already authenticated users do not need checkout intent to checkout", () => {
  const pricing = readFileSync(join(root, "client/src/pages/Pricing.tsx"), "utf8");
  assert.ok(pricing.includes("if (!user)"));
  assert.ok(pricing.includes("buildPricingAuthRedirect"));
  assert.ok(pricing.includes("checkoutMutation.mutate({ planId, interval: billingInterval })"));
  assert.ok(pricing.includes("checkoutIntentHandledRef"));
  assert.ok(pricing.includes("shouldResumePricingCheckout"));
});

test("F: Stripe cancel URL without checkout does not auto-resume", () => {
  const cancelPath = stripPricingCheckoutParam("/pricing?checkout=starter&billing=yearly");
  assert.equal(cancelPath, "/pricing?billing=yearly");
  assert.equal(parsePricingCheckoutIntent(cancelPath.split("?")[1] || ""), null);
  assert.equal(billingIntervalFromSearch("billing=yearly"), "yearly");
  assert.equal(
    shouldResumePricingCheckout({
      ...resumeBase,
      intent: parsePricingCheckoutIntent("billing=yearly"),
    }),
    false,
  );
});

test("G: consumed intent (no checkout param) does not create another checkout", () => {
  assert.equal(parsePricingCheckoutIntent("billing=yearly"), null);
  assert.equal(parsePricingCheckoutIntent(""), null);
  assert.equal(
    shouldResumePricingCheckout({ ...resumeBase, intent: null }),
    false,
  );
});

test("H: malformed plan/billing query does not checkout", () => {
  assert.equal(parsePricingCheckoutPlan("free"), null);
  assert.equal(parsePricingCheckoutPlan("price_123"), null);
  assert.equal(parsePricingBillingInterval("annual"), null);
  assert.equal(parsePricingCheckoutIntent("checkout=starter"), null);
  assert.equal(parsePricingCheckoutIntent("billing=yearly"), null);
  assert.equal(parsePricingCheckoutIntent("checkout=starter&billing=annual"), null);
  assert.equal(parsePricingCheckoutIntent("checkout=free&billing=monthly"), null);
  assert.deepEqual(parsePricingCheckoutIntent("checkout=pro&billing=monthly&priceId=price_hack"), {
    plan: "pro",
    billingInterval: "monthly",
  });
  const env = {
    STRIPE_PRO_MONTHLY_PRICE_ID: "price_trusted_pro_month",
    STRIPE_PRO_YEARLY_PRICE_ID: "price_trusted_pro_year",
  };
  assert.equal(resolveStripePlanPriceId("pro", "monthly", env), "price_trusted_pro_month");
  assert.notEqual(resolveStripePlanPriceId("pro", "monthly", env), "price_hack");
});

test("I: Shopify path does not resume Stripe checkout", () => {
  const intent = parsePricingCheckoutIntent("checkout=pro&billing=monthly");
  assert.equal(
    shouldResumePricingCheckout({ ...resumeBase, isShopify: true, intent }),
    false,
  );
  const pricing = readFileSync(join(root, "client/src/pages/Pricing.tsx"), "utf8");
  assert.ok(pricing.includes("liveShopifyShop"));
  assert.ok(pricing.includes("openShopifyManagedPricing"));
});

test("J: existing same-plan subscriber does not auto-open a duplicate subscription", () => {
  const intent = { plan: "starter" as const, billingInterval: "yearly" as const };
  assert.equal(
    shouldResumePricingCheckout({
      ...resumeBase,
      billingPlan: "starter",
      intent,
    }),
    false,
  );
  assert.equal(
    shouldResumePricingCheckout({
      ...resumeBase,
      billingPlan: "starter",
      intent: { plan: "pro", billingInterval: "monthly" },
    }),
    true,
  );
});

test("Auth still uses existing redirect query param; Price IDs never go in the URL", () => {
  const auth = readFileSync(join(root, "client/src/pages/Auth.tsx"), "utf8");
  assert.ok(auth.includes("params.get('redirect')"));
  assert.ok(auth.includes("navigateAfterAuth(postAuthRedirect)"));

  const href = buildPricingAuthRedirect({
    pricingPath: "/es/pricing",
    plan: "starter",
    billingInterval: "yearly",
  });
  assert.ok(href.includes(encodeURIComponent("/es/pricing?checkout=starter&billing=yearly")));
  assert.ok(!href.includes("price_"));

  const search = buildPricingCheckoutIntentSearch({
    plan: "pro",
    billingInterval: "monthly",
    existingSearch: "utm=1",
  });
  assert.equal(search, "?utm=1&checkout=pro&billing=monthly");
});
