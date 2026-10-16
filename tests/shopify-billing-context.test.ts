import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { build } from "esbuild";
import vm from "node:vm";
import { storage } from "../server/storage";
import {
  getEffectivePlanForUser,
  canStartInternalProAiTrial,
} from "../shared/trialEntitlements";

const expired = {
  id: "owner-a",
  shopifyShop: "owner-a.myshopify.com",
  shopifyAccessToken: "fixture-token",
  billingPlan: "free",
  subscriptionStatus: "active",
  shopifySubscriptionStatus: "pending",
  trialStatus: "expired",
  trialPlan: "pro_ai",
  trialEndsAt: new Date("2026-06-03"),
  trialStartedAt: new Date("2026-05-20"),
  planOverrideEnabled: false,
  planOverride: null,
};

test("real managed pricing route recovers canonical shop without hints; expired trial and billing remain unchanged", async () => {
  const { default: router } = await import("../server/shopifyRoutes");
  let row: any = structuredClone(expired);
  let signedIn = true;
  const snapshot = structuredClone(row);
  const originals = {
    getUser: storage.getUser,
    getUserForSession: storage.getUserForSession,
    getUserByShopifyShop: storage.getUserByShopifyShop,
    updateUser: storage.updateUser,
  };
  storage.getUser = async () => {
    throw Error("auth-core projection must not resolve billing");
  };
  storage.getUserForSession = async () => row;
  storage.getUserByShopifyShop = async (shop) =>
    shop === expired.shopifyShop
      ? row
      : ({ id: "other", shopifyAccessToken: "other-token" } as any);
  storage.updateUser = async () => {
    throw Error("pricing resolution must not mutate records");
  };
  const app = express();
  app.use((req, _res, next) => {
    if (signedIn) req.user = { id: expired.id } as any;
    next();
  });
  app.use("/api/shopify", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    for (const hint of [
      "",
      "?shop=other.myshopify.com",
      "?shop=invalid.example",
    ]) {
      const res = await fetch(
        origin + "/api/shopify/billing/managed-pricing-url" + hint,
      );
      assert.equal(res.status, 200);
      assert.match(
        (await res.json()).planSelectionUrl,
        /^https:\/\/admin\.shopify\.com\/store\/owner-a\/charges\/[^/]+\/pricing_plans$/,
      );
    }
    assert.deepEqual(row, snapshot);
    assert.equal(getEffectivePlanForUser(row), "free");
    assert.equal(canStartInternalProAiTrial(row), false);
    row = { ...expired, shopifyShop: null, shopifyAccessToken: null };
    assert.equal(
      (
        await fetch(
          origin +
            "/api/shopify/billing/managed-pricing-url?shop=other.myshopify.com",
        )
      ).status,
      400,
    );
    row = { ...expired, shopifyAccessToken: null };
    assert.equal(
      (await fetch(origin + "/api/shopify/billing/managed-pricing-url")).status,
      400,
    );
    row = undefined;
    assert.equal(
      (
        await fetch(
          origin +
            "/api/shopify/billing/managed-pricing-url?shop=other.myshopify.com",
        )
      ).status,
      401,
    );
    signedIn = false;
    assert.equal(
      (await fetch(origin + "/api/shopify/billing/managed-pricing-url")).status,
      401,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    Object.assign(storage, originals);
  }
});

test("upgrade navigation always uses the session-verified server URL, never a local shop hint", async () => {
  const bundled = await build({
    entryPoints: ["client/src/lib/shopifyCheckout.ts"],
    bundle: true,
    platform: "browser",
    format: "cjs",
    write: false,
    define: { "import.meta.env": "{}" },
    plugins: [
      {
        name: "bootstrap-fixture",
        setup(b) {
          b.onResolve({ filter: /shopifyBootstrap$/ }, () => ({
            path: "bootstrap",
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: "export function markShopifyPlanPickerOpened() {}",
          }));
        },
      },
    ],
  });
  const location = {
    search: "?shop=other.myshopify.com",
    href: "https://app.example/chatbot",
  };
  const module = { exports: {} as any };
  let ok = true,
    calls = 0;
  vm.runInNewContext(bundled.outputFiles[0].text, {
    module,
    exports: module.exports,
    URL,
    URLSearchParams,
    console,
    window: { location },
    localStorage: {
      setItem() {},
      getItem() {
        return "other.myshopify.com";
      },
    },
    fetch: async (_url: string, options: any) => {
      calls++;
      assert.equal(options.credentials, "include");
      return {
        ok,
        status: ok ? 200 : 400,
        json: async () =>
          ok
            ? {
                planSelectionUrl:
                  "https://admin.shopify.com/store/owner-a/charges/whachatcrm/pricing_plans",
              }
            : { error: "Reconnect required" },
      };
    },
  });
  assert.equal(
    await module.exports.openShopifyManagedPricing("other.myshopify.com"),
    true,
  );
  assert.equal(calls, 1);
  assert.match(location.href, /\/store\/owner-a\//);
  ok = false;
  location.href = "https://app.example/chatbot";
  await assert.rejects(
    module.exports.openShopifyManagedPricing("other.myshopify.com"),
    /Reconnect required/,
  );
  assert.equal(location.href, "https://app.example/chatbot");
});

test("existing internal plan override grants only local effective access, preserving billing/trial and tenant boundaries", () => {
  const snapshot = structuredClone(expired);
  const internal = {
    ...expired,
    planOverrideEnabled: true,
    planOverride: "pro",
  };
  assert.equal(getEffectivePlanForUser(internal as any), "pro");
  assert.equal(getEffectivePlanForUser(expired as any), "free");
  assert.equal(
    getEffectivePlanForUser({ ...internal, planOverrideEnabled: false } as any),
    "free",
  );
  for (const key of [
    "billingPlan",
    "subscriptionStatus",
    "shopifySubscriptionStatus",
    "trialEndsAt",
    "trialStartedAt",
    "trialStatus",
  ] as const)
    assert.deepEqual(internal[key], snapshot[key]);
  assert.equal(canStartInternalProAiTrial(internal as any), false);
  assert.deepEqual(expired, snapshot);
});
