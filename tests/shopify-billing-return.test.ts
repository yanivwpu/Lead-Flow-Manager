import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { eq } from "drizzle-orm";
import { catalogFixture } from "./shopify-catalog-fixture";
import { users } from "../shared/schema";
import { getEffectivePlanForUser } from "../shared/trialEntitlements";

process.env.SHOPIFY_API_KEY = "billing-fixture-key";
process.env.SHOPIFY_API_SECRET = "billing-fixture-secret";
process.env.DATABASE_URL ||=
  "postgres://fixture:fixture@127.0.0.1:1/catalog_fixture";

test("real billing returns verify provider state, recover missing shop, fence ownership, preserve trials and replay safely", async () => {
  const f = await catalogFixture();
  const { storage } = await import("../server/storage");
  const { db } = await import("../drizzle/db");
  const { getShopifyApi, syncShopifyBillingToUser } =
    await import("../server/shopify");
  const { default: router } = await import("../server/shopifyRoutes");
  const api = getShopifyApi()!;
  const original = {
    getUserForSession: storage.getUserForSession,
    getUserByShopifyShop: storage.getUserByShopifyShop,
    updateUser: storage.updateUser,
    update: db.update,
    request: api.clients.Graphql.prototype.request,
  };
  const read = async (id = "tenant-a") =>
    (await f.database.select().from(users).where(eq(users.id, id)))[0];
  storage.getUserForSession = read;
  storage.getUserByShopifyShop = async (shop) =>
    (
      await f.database.select().from(users).where(eq(users.shopifyShop, shop))
    )[0];
  storage.updateUser = async () => {
    throw Error("unfenced writes forbidden");
  };
  (db as any).update = (...args: any[]) => (f.database.update as any)(...args);
  let actor: string | undefined = "tenant-a",
    calls = 0;
  let result: any = [
    {
      id: "gid://shopify/AppSubscription/pro",
      name: "WhachatCRM subscription",
      status: "ACTIVE",
      lineItems: [{ plan: { pricingDetails: { planHandle: "pro-yearly" } } }],
    },
  ];
  let fail = false,
    malformed = false,
    revoke = false;
  api.clients.Graphql.prototype.request = async function (
    query: string,
    options: any,
  ) {
    calls++;
    assert.match(query, /currentAppInstallation/);
    assert.match(query, /AppRecurringPricing \{ planHandle \}/);
    assert.doesNotMatch(query, /mutation/);
    assert.equal(options.retries, 0);
    if (revoke)
      await f.database
        .update(users)
        .set({ shopifyAccessToken: "rotated" })
        .where(eq(users.id, "tenant-a"));
    if (fail) throw Error("secret-token-should-never-be-logged");
    return malformed
      ? { data: null, errors: ["secret-error"] }
      : { data: { currentAppInstallation: { activeSubscriptions: result } } };
  } as any;
  const app = express();
  app.use((req, _res, next) => {
    if (actor) req.user = { id: actor } as any;
    next();
  });
  app.use("/api/shopify", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/shopify/billing/`;
  const request = (suffix = "callback") =>
    fetch(base + suffix, { redirect: "manual" });
  try {
    await f.database
      .update(users)
      .set({
        billingPlan: "free",
        subscriptionPlan: "free",
        shopifySubscriptionStatus: "pending",
        trialStatus: "expired",
        trialStartedAt: new Date("2026-05-20"),
        trialEndsAt: new Date("2026-06-03"),
        planOverrideEnabled: false,
      })
      .where(eq(users.id, "tenant-a"));
    const before = await read(),
      otherBefore = await read("tenant-b");
    const approved = await request();
    assert.equal(approved.status, 302);
    assert.equal(approved.headers.get("cache-control"), "no-store");
    assert.match(
      approved.headers.get("location")!,
      /shopify_billing=success&plan=pro$/,
    );
    const active = await read();
    assert.equal(active.billingPlan, "pro");
    assert.equal(active.shopifySubscriptionStatus, "active");
    assert.equal(getEffectivePlanForUser(active), "pro");
    for (const field of [
      "trialEndsAt",
      "trialStartedAt",
      "trialStatus",
      "planOverrideEnabled",
    ] as const)
      assert.deepEqual(active[field], before[field]);
    assert.deepEqual(await read("tenant-b"), otherBefore);
    for (const suffix of [
      "callback",
      "callback?plan_handle=starter&charge_id=forged",
      "sync-return?plan_handle=free",
    ]) {
      const res = await request(suffix);
      assert.ok([200, 302].includes(res.status));
      assert.deepEqual(await read(), active);
    }
    const priorCalls = calls;
    for (const shop of [
      "fixture-b.myshopify.com",
      "evil.example",
      "fixture-a.myshopify.com&shop=fixture-b.myshopify.com",
    ])
      assert.equal((await request("callback?shop=" + shop)).status, 400);
    assert.equal(calls, priorCalls);
    actor = undefined;
    assert.equal(
      (await request("callback?shop=fixture-a.myshopify.com&plan_handle=pro"))
        .status,
      401,
    );
    actor = "missing-owner";
    assert.equal((await request()).status, 401);
    actor = "tenant-a";
    fail = true;
    assert.equal((await request()).status, 503);
    assert.deepEqual(await read(), active);
    fail = false;
    malformed = true;
    assert.equal((await request()).status, 503);
    assert.deepEqual(await read(), active);
    malformed = false;
    result = [];
    const delayed = await request("sync-return?plan_handle=pro");
    assert.equal((await delayed.json()).ok, false);
    assert.deepEqual(
      await read(),
      active,
      "empty response never cancels an existing subscription",
    );
    await f.database
      .update(users)
      .set({
        billingPlan: "free",
        shopifySubscriptionStatus: "pending",
        shopifyChargeId: null,
      })
      .where(eq(users.id, "tenant-a"));
    const pending = await read();
    assert.equal(
      (await request("callback?plan_handle=pro")).headers.get("location"),
      "/app/inbox?shopify_billing=verification_pending",
    );
    assert.deepEqual(
      await read(),
      pending,
      "forged plan handle cannot grant paid access",
    );
    result = [
      {
        id: "gid://shopify/AppSubscription/starter",
        name: "WhachatCRM Starter",
        status: "ACTIVE",
      },
    ];
    await request("callback?plan_handle=pro");
    assert.equal((await read()).billingPlan, "starter");
    result = [
      {
        id: "gid://shopify/AppSubscription/pro",
        name: "WhachatCRM Pro yearly",
        status: "ACTIVE",
      },
    ];
    revoke = true;
    assert.equal((await request()).status, 503);
    assert.equal(
      (await read()).billingPlan,
      "starter",
      "token rotation fences stale API results",
    );
    revoke = false;
    await assert.rejects(
      syncShopifyBillingToUser(
        "tenant-b",
        "fixture-a.myshopify.com",
        "fixture-token-a",
      ),
      /INSTALLATION_CHANGED/,
    );
    await f.database
      .update(users)
      .set({ shopifySubscriptionStatus: "uninstalled" })
      .where(eq(users.id, "tenant-a"));
    assert.equal((await request()).status, 503);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    storage.getUserForSession = original.getUserForSession;
    storage.getUserByShopifyShop = original.getUserByShopifyShop;
    storage.updateUser = original.updateUser;
    db.update = original.update;
    api.clients.Graphql.prototype.request = original.request;
    await f.cleanup();
  }
});
