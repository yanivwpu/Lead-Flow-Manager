/**
 * Pricing → Login → Stripe → Inbox conversion journeys (A–I).
 * Run: npx tsx --test tests/pricing-conversion-flow.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildPricingAuthRedirect,
  consumePricingCheckoutIntentFromLocation,
  hasPricingCheckoutResumeStarted,
  markPricingCheckoutResumeStarted,
  parseAuthRedirectDestination,
  parsePricingCheckoutIntent,
  persistPricingCheckoutIntent,
  resolvePricingCheckoutIntent,
  shouldResumePricingCheckout,
  stripPricingCheckoutParam,
  type IntentStore,
} from "../client/src/lib/pricingCheckoutIntent";
import {
  getLiveShopifyShopFromSearch,
  getPricingSubscriptionApiUrl,
  isShopifyPlanCheckoutBlocked,
} from "../client/src/lib/shopifyLiveShop";
import { sanitizeClientRedirectPath } from "../client/src/lib/postAuthRedirect";
import { PLAN_CHECKOUT_SUCCESS_PATH, consumeUpgradedQueryParam } from "../client/src/lib/upgradeSuccess";
import { shouldShowActivationSetupModal, type ActivationStatusPayload } from "../client/src/lib/activationStatus";
import { buildPostCheckoutSuccessUrl, buildStripeCancelUrl } from "../server/checkoutReturnPath";

const root = process.cwd();
const resumeBase = {
  hasUser: true,
  authLoading: false,
  subscriptionResolved: true,
  isShopify: false,
  billingPlan: "free" as const,
  isActiveProAiTrial: false,
};

function memoryStore(initial: Record<string, string> = {}): IntentStore {
  const data = { ...initial };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

const emptyActivation: ActivationStatusPayload = {
  whatsappConnected: false,
  instagramConnected: false,
  facebookConnected: false,
  metaConnected: false,
  hasAnyMessagingChannel: false,
  hasSentFirstMessage: false,
  checklistComplete: false,
};

test("A–D: logged-out Pro monthly/yearly survive login redirect and auto-resume", () => {
  const cases = [
    { plan: "pro" as const, billingInterval: "monthly" as const },
    { plan: "pro" as const, billingInterval: "yearly" as const },
  ];

  for (const c of cases) {
    const store = memoryStore();
    persistPricingCheckoutIntent(c, store);
    const href = buildPricingAuthRedirect({
      pricingPath: "/pricing",
      plan: c.plan,
      billingInterval: c.billingInterval,
    });
    assert.equal(href, `/auth?redirect=${encodeURIComponent(`/pricing?checkout=${c.plan}&billing=${c.billingInterval}`)}`);

    const dest = parseAuthRedirectDestination(href);
    assert.equal(dest, `/pricing?checkout=${c.plan}&billing=${c.billingInterval}`);
    const assigned = sanitizeClientRedirectPath(dest);
    assert.equal(assigned, dest);

    const fromUrl = parsePricingCheckoutIntent(assigned.split("?")[1] || "");
    assert.deepEqual(fromUrl, c);

    const fromStorage = resolvePricingCheckoutIntent("", store);
    assert.deepEqual(fromStorage, c);

    assert.equal(shouldResumePricingCheckout({ ...resumeBase, intent: fromUrl }), true);
  }

  const pricing = readFileSync(join(root, "client/src/pages/Pricing.tsx"), "utf8");
  assert.ok(pricing.includes("persistPricingCheckoutIntent"));
  assert.ok(pricing.includes("resolvePricingCheckoutIntent"));
  assert.ok(pricing.includes("checkoutMutation.mutate({ planId: intent.plan, interval: intent.billingInterval })"));
  assert.ok(pricing.includes("getPlanCheckoutReturnPaths"));
  assert.ok(pricing.includes("subscriptionFetched || subscriptionError"));
  assert.ok(!pricing.includes("hint || isShopify"));

  const auth = readFileSync(join(root, "client/src/pages/Auth.tsx"), "utf8");
  assert.ok(auth.includes("navigateAfterAuth(postAuthRedirect)"));
  assert.ok(!auth.includes("setLocation(postAuthRedirect)"));
});

test("E: Stripe cancel returns to Pricing without checkout and does not auto-resume", () => {
  const origin = "https://app.whachatcrm.com";
  const cancelPath = stripPricingCheckoutParam("/pricing?checkout=starter&billing=yearly");
  assert.equal(cancelPath, "/pricing?billing=yearly");
  assert.equal(buildStripeCancelUrl(origin, cancelPath), "https://app.whachatcrm.com/pricing?billing=yearly");
  assert.equal(parsePricingCheckoutIntent("billing=yearly"), null);
  assert.equal(
    shouldResumePricingCheckout({
      ...resumeBase,
      intent: parsePricingCheckoutIntent("billing=yearly"),
    }),
    false,
  );

  const store = memoryStore();
  persistPricingCheckoutIntent({ plan: "starter", billingInterval: "yearly" }, store);
  markPricingCheckoutResumeStarted(store);
  consumePricingCheckoutIntentFromLocation("/pricing?checkout=starter&billing=yearly", store);
  assert.equal(resolvePricingCheckoutIntent("billing=yearly", store), null);
  assert.equal(hasPricingCheckoutResumeStarted(store), false);
});

test("F: successful plan checkout goes post-checkout → /app/inbox?upgraded=1", () => {
  assert.equal(PLAN_CHECKOUT_SUCCESS_PATH, "/app/inbox?upgraded=1");
  const origin = "https://app.whachatcrm.com";
  assert.equal(
    buildPostCheckoutSuccessUrl(origin, PLAN_CHECKOUT_SUCCESS_PATH),
    "https://app.whachatcrm.com/post-checkout?redirectTo=%2Fapp%2Finbox%3Fupgraded%3D1",
  );

  const pricing = readFileSync(join(root, "client/src/pages/Pricing.tsx"), "utf8");
  assert.ok(pricing.includes("getPlanCheckoutReturnPaths"));
  assert.ok(!pricing.includes("stripPricingCheckoutParam(getCheckoutReturnPaths().redirectTo)"));

  const postCheckout = readFileSync(join(root, "client/src/pages/PostCheckout.tsx"), "utf8");
  assert.ok(postCheckout.includes("Date.now() + 26000"));
  assert.ok(postCheckout.includes("/api/subscription"));
  assert.ok(postCheckout.includes("window.location.assign(redirectTarget)"));
  assert.ok(postCheckout.includes("sanitizeClientRedirectPath"));
});

test("G: incomplete activation still uses existing ActivationSetupModal", () => {
  assert.equal(
    shouldShowActivationSetupModal({
      activationPending: false,
      activation: emptyActivation,
      dismissedThisSession: false,
      shownToday: false,
    }),
    true,
  );
  const layout = readFileSync(join(root, "client/src/pages/AppLayout.tsx"), "utf8");
  assert.ok(layout.includes("ActivationSetupModal"));
  assert.ok(layout.includes("shouldAutoOpenActivationSetupModal"));
  assert.ok(!layout.includes("/get-started"));
});

test("H: activated user does not force the activation modal", () => {
  assert.equal(
    shouldShowActivationSetupModal({
      activationPending: false,
      activation: { ...emptyActivation, hasAnyMessagingChannel: true, whatsappConnected: true },
      dismissedThisSession: false,
      shownToday: false,
    }),
    false,
  );
});

test("I: refresh consumes upgrade toast and does not relaunch checkout", () => {
  const first = consumeUpgradedQueryParam("/app/inbox", "?upgraded=1");
  assert.equal(first.consumed, true);
  assert.equal(first.nextUrl, "/app/inbox");
  const second = consumeUpgradedQueryParam("/app/inbox", "");
  assert.equal(second.consumed, false);

  const layout = readFileSync(join(root, "client/src/pages/AppLayout.tsx"), "utf8");
  assert.ok(layout.includes("consumeUpgradedQueryParam"));
  assert.ok(layout.includes("common.upgradedToast"));
  assert.ok(layout.includes("upgradedToastHandledRef"));

  assert.equal(
    shouldResumePricingCheckout({
      ...resumeBase,
      intent: parsePricingCheckoutIntent("billing=monthly"),
    }),
    false,
  );

  const en = JSON.parse(readFileSync(join(root, "client/src/locales/en.json"), "utf8"));
  assert.equal(en.common.upgradedToast, "You're upgraded! Your new features are ready.");
});

test("Leftover Shopify localStorage does not strip checkout or block Stripe resume", () => {
  assert.equal(getLiveShopifyShopFromSearch(""), undefined);
  assert.equal(getLiveShopifyShopFromSearch("utm=1"), undefined);
  assert.equal(getPricingSubscriptionApiUrl(""), "/api/subscription");
  assert.equal(
    isShopifyPlanCheckoutBlocked(undefined, "?checkout=starter&billing=monthly"),
    false,
  );
  assert.equal(
    isShopifyPlanCheckoutBlocked({ isShopify: false, upgradeProvider: "stripe" }, ""),
    false,
  );
  assert.equal(
    isShopifyPlanCheckoutBlocked({ isShopify: true, upgradeProvider: "shopify" }, ""),
    true,
  );
  assert.equal(
    isShopifyPlanCheckoutBlocked(undefined, "?shop=demo-store.myshopify.com"),
    true,
  );
  assert.equal(
    getPricingSubscriptionApiUrl("?shop=demo-store.myshopify.com"),
    "/api/subscription?shop=demo-store.myshopify.com",
  );

  const pricing = readFileSync(join(root, "client/src/pages/Pricing.tsx"), "utf8");
  assert.ok(pricing.includes("getLiveShopifyShopFromSearch"));
  assert.ok(pricing.includes("getPricingSubscriptionApiUrl"));
  assert.ok(pricing.includes("isShopifyPlanCheckoutBlocked"));
  assert.ok(pricing.includes("liveShopifyShop"));
});

test("Localized pricing auth redirect keeps checkout + billing", () => {
  const href = buildPricingAuthRedirect({
    pricingPath: "/es/pricing",
    plan: "pro",
    billingInterval: "yearly",
  });
  const dest = parseAuthRedirectDestination(href);
  assert.equal(dest, "/es/pricing?checkout=pro&billing=yearly");
  assert.equal(sanitizeClientRedirectPath(dest), dest);
  assert.ok(!href.includes("price_"));
});
