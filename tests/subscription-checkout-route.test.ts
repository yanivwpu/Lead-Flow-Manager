/**
 * Route-level Pro checkout: executes POST /api/subscription/checkout.
 * Mocks the established Stripe factory — never charges live Stripe.
 * Run: npx tsx --test tests/subscription-checkout-route.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import express from "express";
import { storage } from "../server/storage";
import { setUncachableStripeClientFactoryForTests } from "../server/stripeClient";
import { registerSubscriptionCheckoutRoutes } from "../server/subscriptionCheckoutRoutes";
import { canStartInternalProAiTrial } from "../shared/trialEntitlements";
import { resolvePricingProCta } from "../shared/pricingProCta";
import { getPaidPlanDisplayAmountUsd } from "../shared/pricingEntitlements";

const root = process.cwd();
const MONTHLY_PRICE = "price_test_pro_monthly";
const YEARLY_PRICE = "price_test_pro_yearly";
const CHECKOUT_URL = "https://checkout.stripe.com/c/pay/cs_test_expired_pro_49";

const expiredUser = {
  id: "user_expired_trial_2026_05_31",
  email: "expired-trial@example.com",
  shopifyShop: null,
  stripeCustomerId: "cus_existing_expired",
  trialEndsAt: new Date("2026-05-31T00:00:00.000Z"),
  trialStartedAt: new Date("2026-05-17T00:00:00.000Z"),
  trialStatus: "expired" as const,
  trialPlan: "pro_ai",
  billingPlan: "free" as const,
  subscriptionStatus: "none",
  shopifySubscriptionStatus: null,
  planOverrideEnabled: false,
  planOverride: null,
};

type SessionCreateArgs = Record<string, unknown>;

async function withCheckoutApp(
  run: (baseUrl: string, created: SessionCreateArgs[]) => Promise<void>,
) {
  const created: SessionCreateArgs[] = [];
  const origGetUserForSession = storage.getUserForSession.bind(storage);
  const origGetUser = storage.getUser.bind(storage);
  const origUpdateUser = storage.updateUser.bind(storage);

  const prevMonthly = process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
  const prevYearly = process.env.STRIPE_PRO_YEARLY_PRICE_ID;
  process.env.STRIPE_PRO_MONTHLY_PRICE_ID = MONTHLY_PRICE;
  process.env.STRIPE_PRO_YEARLY_PRICE_ID = YEARLY_PRICE;

  storage.getUserForSession = (async () => expiredUser) as typeof storage.getUserForSession;
  storage.getUser = (async () => expiredUser) as typeof storage.getUser;
  storage.updateUser = (async () => expiredUser) as typeof storage.updateUser;

  setUncachableStripeClientFactoryForTests(async () => {
    return {
      customers: {
        create: async () => ({ id: "cus_should_not_create" }),
      },
      checkout: {
        sessions: {
          create: async (params: SessionCreateArgs) => {
            created.push(params);
            return { url: CHECKOUT_URL };
          },
        },
      },
    } as any;
  });

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as { user?: { id: string } }).user = { id: expiredUser.id };
    next();
  });
  registerSubscriptionCheckoutRoutes(app);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr === "object");
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    await run(baseUrl, created);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    storage.getUserForSession = origGetUserForSession;
    storage.getUser = origGetUser;
    storage.updateUser = origUpdateUser;
    setUncachableStripeClientFactoryForTests(null);
    if (prevMonthly === undefined) delete process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
    else process.env.STRIPE_PRO_MONTHLY_PRICE_ID = prevMonthly;
    if (prevYearly === undefined) delete process.env.STRIPE_PRO_YEARLY_PRICE_ID;
    else process.env.STRIPE_PRO_YEARLY_PRICE_ID = prevYearly;
  }
}

test("POST /api/subscription/checkout monthly returns a $49 Pro Stripe URL for expired-trial Free", async () => {
  assert.equal(getPaidPlanDisplayAmountUsd("pro", "monthly"), 49);
  assert.equal(canStartInternalProAiTrial(expiredUser, new Date("2026-08-31T12:00:00.000Z")), false);
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

  await withCheckoutApp(async (baseUrl, created) => {
    const res = await fetch(`${baseUrl}/api/subscription/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: "pro", billingInterval: "monthly" }),
    });
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.url, CHECKOUT_URL);
    assert.equal(created.length, 1);
    const session = created[0]!;
    assert.equal(session.mode, "subscription");
    assert.deepEqual(session.line_items, [{ price: MONTHLY_PRICE, quantity: 1 }]);
    assert.equal((session.subscription_data as { trial_period_days?: number } | undefined)?.trial_period_days, undefined);
    assert.equal("trial_period_days" in session, false);
    assert.equal((session.metadata as { plan?: string }).plan, "pro");
    assert.equal((session.metadata as { billingInterval?: string }).billingInterval, "monthly");
  });
});

test("POST /api/subscription/checkout yearly (resume interval) uses yearly Pro price, not a trial", async () => {
  await withCheckoutApp(async (baseUrl, created) => {
    const res = await fetch(`${baseUrl}/api/subscription/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: "pro", billingInterval: "yearly" }),
    });
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.url, CHECKOUT_URL);
    assert.equal(created[0]!.mode, "subscription");
    assert.deepEqual(created[0]!.line_items, [{ price: YEARLY_PRICE, quantity: 1 }]);
    assert.equal((created[0]!.metadata as { billingInterval?: string }).billingInterval, "yearly");
    assert.equal((created[0]!.subscription_data as { trial_period_days?: number } | undefined)?.trial_period_days, undefined);
  });
});

test("legacy Pro checkout paths also return a paid Pro Stripe URL", async () => {
  await withCheckoutApp(async (baseUrl, created) => {
    const proAi = await fetch(`${baseUrl}/api/subscription/checkout/pro-ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const proAiBody = await proAi.json();
    assert.equal(proAi.status, 200, JSON.stringify(proAiBody));
    assert.equal(proAiBody.url, CHECKOUT_URL);

    const bundle = await fetch(`${baseUrl}/api/subscription/checkout/plan-ai-bundle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "pro" }),
    });
    const bundleBody = await bundle.json();
    assert.equal(bundle.status, 200, JSON.stringify(bundleBody));
    assert.equal(bundleBody.url, CHECKOUT_URL);

    assert.equal(created.length, 2);
    for (const session of created) {
      assert.equal(session.mode, "subscription");
      assert.deepEqual(session.line_items, [{ price: MONTHLY_PRICE, quantity: 1 }]);
      assert.equal((session.subscription_data as { trial_period_days?: number } | undefined)?.trial_period_days, undefined);
    }
  });
});

test("production checkout wiring uses the established Stripe factory in every caller", () => {
  const routes = readFileSync(join(root, "server/routes.ts"), "utf8");
  assert.ok(routes.includes("registerSubscriptionCheckoutRoutes(app)"));

  const checkoutRoutes = readFileSync(join(root, "server/subscriptionCheckoutRoutes.ts"), "utf8");
  assert.ok(checkoutRoutes.includes('app.post("/api/subscription/checkout"'));
  assert.ok(checkoutRoutes.includes("createCheckoutSession"));
  assert.ok(checkoutRoutes.includes("createProPlusAICheckoutSession"));
  assert.ok(checkoutRoutes.includes("createPlanAIBundleCheckoutSession"));
  assert.ok(!checkoutRoutes.includes("getUncachableStripeClient"));
  assert.doesNotMatch(checkoutRoutes, /trial_period_days/);

  const service = readFileSync(join(root, "server/subscriptionService.ts"), "utf8");
  assert.match(service, /import \{ getUncachableStripeClient \} from "\.\/stripeClient"/);

  const callers: string[] = [];
  function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === "dist" || name === "build") continue;
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      if (!name.endsWith(".ts") && !name.endsWith(".tsx")) continue;
      const src = readFileSync(full, "utf8");
      if (!src.includes("getUncachableStripeClient")) continue;
      callers.push(relative(root, full).replaceAll("\\", "/"));
    }
  }
  walk(join(root, "server"));
  walk(join(root, "scripts"));

  for (const rel of callers) {
    if (rel === "server/stripeClient.ts") continue;
    const src = readFileSync(join(root, rel), "utf8");
    assert.match(
      src,
      /import\s*\{[^}]*getUncachableStripeClient[^}]*\}\s*from\s*["'][^"']*stripeClient["']/,
      `${rel} calls getUncachableStripeClient without importing stripeClient`,
    );
    assert.equal(src.includes("function getUncachableStripeClient"), false, rel);
  }
});
