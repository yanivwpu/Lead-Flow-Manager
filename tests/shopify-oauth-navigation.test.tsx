import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import crypto from "node:crypto";
import express from "express";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ShopifyStartView } from "../client/src/components/ShopifyStartView";
import { getShopifyOAuthOrigin } from "../server/shopifyOAuthOrigin";

process.env.DATABASE_URL ||= "postgres://isolated:isolated@127.0.0.1:1/isolated";
process.env.SHOPIFY_API_KEY = "isolated-key";
process.env.SHOPIFY_API_SECRET = "isolated-oauth-secret";
process.env.APP_URL = "https://staging.example.test";
const shop = "isolated.myshopify.com";

test("real install route escapes iframe, permits top-level OAuth, and reopens authenticated shops", async () => {
  const { default: router } = await import("../server/shopifyRoutes");
  const { createSignedShopifyOAuthState } = await import("../server/shopify");
  let merchant: Express.User | undefined;
  const app = express();
  app.use((req, _res, next) => { req.user = merchant; next(); });
  app.use("/api/shopify", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const install = `/api/shopify/install?shop=${shop}`;
  const read = (path: string, dest = "iframe") => fetch(origin + path, {
    redirect: "manual", headers: { "sec-fetch-dest": dest },
  });
  function run(html: string, framed: boolean, blocked = false) {
    const navigations: string[] = [];
    const current = origin + install;
    const self = { location: { href: current, replace: (url: string) => navigations.push(url) } };
    const top = framed ? { location: { set href(url: string) {
      if (blocked) throw new Error("sandboxed top navigation");
      navigations.push(url);
    } } } : self;
    vm.runInNewContext(html.match(/<script[^>]*>([\s\S]*?)<\/script>/)![1], {
      window: { self, top, location: self.location },
    });
    return navigations;
  }
  try {
    const response = await read(install);
    assert.equal(response.status, 200, "must not 302 authorization into the iframe");
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(response.headers.get("content-security-policy")!, /script-src 'nonce-/);
    const html = await response.text();
    assert.deepEqual(run(html, true), [origin + install], "escape to app first");
    assert.deepEqual(run(html, true, true), [], "blocked escape never falls back to framed login");
    assert.match(html, /target="_blank" rel="noopener noreferrer"/);
    const authorization = new URL(run(html, false)[0]);
    assert.equal(authorization.hostname, shop);
    assert.equal(authorization.searchParams.get("redirect_uri"), "https://staging.example.test/api/shopify/callback");
    assert.equal((await read("/api/shopify/install?shop=attacker.example")).status, 400);

    merchant = { id: "merchant", shopifyShop: shop, shopifyAccessToken: "isolated-token" } as Express.User;
    const reopened = await (await read(install, "document")).text();
    assert.deepEqual(run(reopened, false), [`/shopify/start?shop=${shop}`]);
    assert.doesNotMatch(reopened, /oauth\/authorize/);
    merchant = undefined; // expired/missing session must authorize again, never log in from shop alone
    assert.match(await (await read(install)).text(), /oauth\/authorize/);

    const params = new URLSearchParams({ shop, code: "isolated-code", state: createSignedShopifyOAuthState(shop)!, timestamp: String(Math.floor(Date.now() / 1000)) });
    const sign = () => crypto.createHmac("sha256", process.env.SHOPIFY_API_SECRET!).update(
      [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("&"),
    ).digest("hex");
    const callback = () => "/api/shopify/callback?" + params + "&hmac=" + sign();
    const framedCallback = await read(callback());
    assert.equal(framedCallback.status, 200, "valid callback escapes before exchanging code or persisting session");
    assert.match(await framedCallback.text(), /window.self === window.top/);
    assert.equal((await read("/api/shopify/callback?" + params + "&hmac=short", "document")).status, 401);
    params.set("state", "invalid-state");
    assert.equal((await read(callback(), "document")).status, 401);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("OAuth states cannot cross staging and production origins even with the same test secret", async () => {
  const { createSignedShopifyOAuthState, verifySignedShopifyOAuthState } = await import("../server/shopify");
  const state = createSignedShopifyOAuthState(shop)!;
  assert.equal(verifySignedShopifyOAuthState(state, shop).ok, true);
  process.env.APP_URL = "https://app.whachatcrm.com";
  assert.deepEqual(verifySignedShopifyOAuthState(state, shop), { ok: false, reason: "origin_mismatch" });
  process.env.RAILWAY_ENVIRONMENT_NAME = "staging";
  assert.throws(() => getShopifyOAuthOrigin(), /production callback/);
  process.env.APP_URL = "https://staging.example.test";
  assert.equal(getShopifyOAuthOrigin(), process.env.APP_URL);
  delete process.env.RAILWAY_ENVIRONMENT_NAME;
});

test("missing-session screen provides a top-level recovery action for the validated shop", () => {
  const html = renderToStaticMarkup(<ShopifyStartView snapshot={{ state: "reconnect_required" }}
    loading={false} busy={false} failed={false} onRetry={() => {}} onRefresh={() => {}}
    reconnectHref={`/api/shopify/install?shop=${shop}`} />);
  assert.match(html, /target="_top" href="\/api\/shopify\/install\?shop=isolated.myshopify.com"/);
});
