/**
 * Pricing Pro CTA + internal trial eligibility + paid Stripe checkout.
 * Run: npx tsx --test tests/pricing-trial-cta-checkout.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canStartInternalProAiTrial } from "../shared/trialEntitlements";
import { resolvePricingProCta } from "../shared/pricingProCta";
import {
  shouldResumePricingCheckout,
  shouldStartInternalTrialAfterLogin,
} from "../client/src/lib/pricingCheckoutIntent";
import { getPaidPlanDisplayAmountUsd } from "../shared/pricingEntitlements";
import { stripePriceEnvForPlan } from "../server/stripePlanPriceIds";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const now = new Date("2026-08-31T12:00:00.000Z");

function freeUser(overrides: Record<string, unknown> = {}) {
  return {
    trialEndsAt: null,
    trialStartedAt: null,
    trialStatus: "none" as const,
    trialPlan: null,
    planOverrideEnabled: false,
    planOverride: null,
    billingPlan: "free" as const,
    subscriptionStatus: "active",
    shopifyShop: null,
    shopifySubscriptionStatus: null,
    ...overrides,
  };
}

const expiredTrialUser = freeUser({
  trialEndsAt: new Date("2026-05-31T00:00:00.000Z"),
  trialStartedAt: new Date("2026-05-17T00:00:00.000Z"),
  trialStatus: "expired",
  trialPlan: "pro_ai",
});

const eligibleFreeUser = freeUser();

const paidProUser = freeUser({
  billingPlan: "pro",
  subscriptionStatus: "active",
});

const activeTrialUser = freeUser({
  trialEndsAt: new Date("2026-09-14T00:00:00.000Z"),
  trialStartedAt: new Date("2026-08-31T00:00:00.000Z"),
  trialStatus: "active",
  trialPlan: "pro_ai",
});

const resumeBase = {
  hasUser: true,
  authLoading: false,
  subscriptionResolved: true,
  isShopify: false,
  billingPlan: "free" as const,
  isActiveProAiTrial: false,
  intent: { plan: "pro" as const, billingInterval: "monthly" as const },
};

test("eligible Free user can start the internal trial and sees Start Trial CTA", () => {
  assert.equal(canStartInternalProAiTrial(eligibleFreeUser, now), true);
  assert.equal(
    resolvePricingProCta({
      loggedIn: true,
      isShopify: false,
      isPaidPro: false,
      isActiveProAiTrial: false,
      canStartInternalTrial: true,
    }),
    "start_trial",
  );
  const en = JSON.parse(read("client/src/locales/en.json"));
  assert.equal(en.pricingPage.plans.pro.cta, "Start Your 14-Day Free Trial");

  const trialSvc = read("server/trialEntitlements.ts");
  assert.ok(trialSvc.includes("export async function startInternalProAiTrialForUser"));
  assert.ok(trialSvc.includes("canStartInternalProAiTrial"));
  assert.ok(trialSvc.includes("TRIAL_DAYS"));
  assert.ok(trialSvc.includes('trialPlan: "pro_ai"'));
  assert.ok(!trialSvc.includes("getUncachableStripeClient"));

  const routes = read("server/routes.ts");
  assert.ok(routes.includes("registerSubscriptionCheckoutRoutes(app)"));
  assert.ok(routes.includes("canStartInternalTrial: canStartInternalProAiTrial"));
  const checkoutRoutes = read("server/subscriptionCheckoutRoutes.ts");
  assert.ok(checkoutRoutes.includes('app.post("/api/subscription/start-trial"'));
  assert.ok(checkoutRoutes.includes("startInternalProAiTrialForUser"));

  const pricing = read("client/src/pages/Pricing.tsx");
  assert.ok(pricing.includes('fetch("/api/subscription/start-trial"'));
  assert.ok(pricing.includes('proCtaKind === "start_trial"'));
  assert.ok(pricing.includes("startTrialMutation.mutate()"));
});

test("expired-trial Free user (trialExpiresAt ≈ 2026-05-31) sees Upgrade to Pro and cannot start another trial", () => {
  assert.equal(canStartInternalProAiTrial(expiredTrialUser, now), false);
  assert.equal(
    resolvePricingProCta({
      loggedIn: true,
      isShopify: false,
      isPaidPro: false,
      isActiveProAiTrial: false,
      canStartInternalTrial: false,
    }),
    "upgrade_pro",
  );
  const en = JSON.parse(read("client/src/locales/en.json"));
  assert.equal(en.pricingPage.plans.pro.upgradeCta, "Upgrade to Pro");
  const es = JSON.parse(read("client/src/locales/es.json"));
  assert.equal(typeof es.pricingPage.plans.pro.upgradeCta, "string");
  const he = JSON.parse(read("client/src/locales/he.json"));
  assert.equal(typeof he.pricingPage.plans.pro.upgradeCta, "string");

  const startFn = read("server/trialEntitlements.ts");
  const startBody = startFn.slice(startFn.indexOf("startInternalProAiTrialForUser"));
  assert.ok(startBody.includes('reason: "not_eligible"'));
  assert.ok(!startBody.includes("trialEndsAt.setDate") || startBody.includes("canStartInternalProAiTrial"));

  assert.equal(
    shouldStartInternalTrialAfterLogin({
      ...resumeBase,
      canStartInternalTrial: false,
    }),
    false,
  );
  assert.equal(shouldResumePricingCheckout({ ...resumeBase, canStartInternalTrial: false }), true);
});

test("expired-trial user checkout is paid Pro Stripe ($49/month), not another trial", () => {
  assert.equal(getPaidPlanDisplayAmountUsd("pro", "monthly"), 49);
  assert.equal(stripePriceEnvForPlan("pro", "monthly"), "STRIPE_PRO_MONTHLY_PRICE_ID");

  const service = read("server/subscriptionService.ts");
  const fn = service.slice(service.indexOf("async createCheckoutSession"));
  const body = fn.slice(0, fn.indexOf("async createProPlusAICheckoutSession"));
  assert.ok(body.includes("getUncachableStripeClient"));
  assert.ok(body.includes("resolveStripePlanPriceId(plan, billingInterval)"));
  assert.ok(body.includes("line_items: [{ price: priceId, quantity: 1 }]"));
  assert.ok(body.includes("mode: 'subscription'"));
  assert.ok(body.includes("return { url: session.url }"));
  assert.doesNotMatch(body, /trial_period_days/);
  assert.ok(!body.includes("startInternalProAiTrialForUser"));
  assert.ok(body.includes("Paid Stripe Checkout only"));

  const checkoutRoutes = read("server/subscriptionCheckoutRoutes.ts");
  const checkoutStart = checkoutRoutes.indexOf('app.post("/api/subscription/checkout"');
  const proAiStart = checkoutRoutes.indexOf('app.post("/api/subscription/checkout/pro-ai"');
  assert.ok(checkoutStart > 0 && proAiStart > checkoutStart);
  const checkoutHandler = checkoutRoutes.slice(checkoutStart, proAiStart);
  assert.ok(checkoutHandler.includes("createCheckoutSession"));
  assert.ok(!checkoutHandler.includes("getUncachableStripeClient"));
  assert.ok(!checkoutHandler.includes("startInternalProAiTrialForUser"));
  assert.ok(!checkoutHandler.includes("trial_period_days"));

  const pricing = read("client/src/pages/Pricing.tsx");
  assert.ok(pricing.includes('fetch("/api/subscription/checkout"'));
  assert.ok(pricing.includes("checkoutMutation.mutate({ planId, interval: billingInterval })"));
  assert.ok(pricing.includes("upgradeCta"));
});

test("paid Pro user sees Current Plan", () => {
  assert.equal(canStartInternalProAiTrial(paidProUser, now), false);
  assert.equal(
    resolvePricingProCta({
      loggedIn: true,
      isShopify: false,
      isPaidPro: true,
      isActiveProAiTrial: false,
      canStartInternalTrial: false,
    }),
    "current_plan",
  );
  const en = JSON.parse(read("client/src/locales/en.json"));
  assert.equal(en.pricingPage.plans.currentPlan, "Current Plan");
  const pricing = read("client/src/pages/Pricing.tsx");
  assert.ok(pricing.includes("plans.currentPlan"));
  assert.ok(pricing.includes('proCtaKind === "current_plan"'));
});

test("active Pro trial CTA is keep-pro-after-trial; eligible users resume trial not Stripe", () => {
  assert.equal(canStartInternalProAiTrial(activeTrialUser, now), false);
  assert.equal(
    resolvePricingProCta({
      loggedIn: true,
      isShopify: false,
      isPaidPro: false,
      isActiveProAiTrial: true,
      canStartInternalTrial: false,
    }),
    "keep_pro_after_trial",
  );
  assert.equal(
    shouldResumePricingCheckout({ ...resumeBase, canStartInternalTrial: true }),
    false,
  );
  assert.equal(
    shouldStartInternalTrialAfterLogin({
      ...resumeBase,
      canStartInternalTrial: true,
    }),
    true,
  );
});

test("no undeclared Stripe helper in the production Pro checkout path", () => {
  const service = read("server/subscriptionService.ts");
  assert.match(service, /import \{ getUncachableStripeClient \} from "\.\/stripeClient"/);
  assert.equal(service.includes("function getUncachableStripeClient"), false);
  assert.equal(service.includes("new Stripe("), false);

  const stripeClient = read("server/stripeClient.ts");
  assert.ok(stripeClient.includes("export async function getUncachableStripeClient"));

  const checkoutRoute = read("server/subscriptionCheckoutRoutes.ts");
  const startTrialStart = checkoutRoute.indexOf('app.post("/api/subscription/start-trial"');
  const checkoutStart = checkoutRoute.indexOf('app.post("/api/subscription/checkout"');
  const startTrialHandler = checkoutRoute.slice(startTrialStart, checkoutStart);
  assert.ok(!startTrialHandler.includes("getUncachableStripeClient"));
  assert.ok(!startTrialHandler.includes("stripe"));
  assert.ok(read("server/routes.ts").includes("registerSubscriptionCheckoutRoutes(app)"));
});

test("GHL Marketplace and Shopify rules stay unchanged for trial eligibility", () => {
  assert.equal(
    canStartInternalProAiTrial(eligibleFreeUser, now, { ghlMarketplaceProActive: true }),
    false,
  );
  assert.equal(
    canStartInternalProAiTrial(freeUser({ shopifyShop: "store.myshopify.com" }), now),
    false,
  );
  assert.equal(
    resolvePricingProCta({
      loggedIn: true,
      isShopify: true,
      isPaidPro: true,
      isActiveProAiTrial: false,
      canStartInternalTrial: false,
    }),
    "shopify_manage",
  );
});
