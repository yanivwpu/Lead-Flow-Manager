import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import session from "express-session";
import { createShopifyOnboardingRouter } from "../server/shopifyOnboardingRoutes";
import type { ShopifyOnboardingState } from "../shared/shopifyOnboarding";

test("session authorization, CSRF, retry, blocked history, and telemetry over HTTP", async () => {
  let state: ShopifyOnboardingState = "recovery_required";
  let signedIn = true;
  let installed = true;
  let calls = 0;
  let failClaim = false;
  let welcomeCalls = 0;
  const events: unknown[] = [];
  const user = { id: "test-user", shopifyShop: "test.myshopify.com", shopifyAccessToken: "test-only" };
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "isolated-test-session", resave: false, saveUninitialized: true }));
  app.use((req, _res, next) => { if (signedIn) req.user = { id: user.id }; next(); });
  app.use("/api/shopify", createShopifyOnboardingRouter({
    readMerchant: async () => installed ? user : undefined,
    describe: async () => ({ state }),
    claim: async () => {
      calls++;
      if (failClaim) throw new Error("private-internal-error");
      state = "trial_active";
      return { granted: true, reason: "grant" };
    },
    emit: (_shop, event, detail) => events.push({ event, ...detail }),
    afterRecovery: async () => { welcomeCalls++; },
  }));
  // OAuth/webhooks must not inherit the new session middleware.
  app.get("/api/shopify/callback", (_req, res) => res.sendStatus(200));
  app.post("/api/shopify/webhooks/app-uninstalled", (_req, res) => res.sendStatus(200));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const port = (server.address() as { port: number }).port;
  const origin = `http://127.0.0.1:${port}`;
  let cookie = "";
  async function request(path: string, body?: unknown, requestOrigin = origin) {
    const response = await fetch(origin + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json", Origin: requestOrigin }),
        ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    cookie = response.headers.get("set-cookie")?.split(";")[0] ?? cookie;
    return response;
  }
  try {
    signedIn = false;
    assert.equal((await request("/api/shopify/onboarding")).status, 401);
    assert.equal((await request("/api/shopify/callback")).status, 200);
    assert.equal((await request("/api/shopify/webhooks/app-uninstalled", {})).status, 200);
    signedIn = true;
    assert.equal((await request("/api/shopify/onboarding/retry", {}, "https://attacker.example")).status, 403);
    assert.equal(calls, 0);
    const first = await request("/api/shopify/onboarding/retry", { shop: "another.myshopify.com" });
    assert.equal(first.status, 200);
    assert.equal((await first.json()).state, "trial_active");
    assert.equal(calls, 1);
    assert.equal((await request("/api/shopify/onboarding/retry", {})).status, 200);
    assert.equal(calls, 1, "retry after a grant is read-only");
    assert.equal(welcomeCalls, 1, "welcome is sent after confirmed recovery, not replayed by later retries");
    for (const existing of ["plan_required", "support_required", "app_ready"] as const) {
      state = existing;
      assert.equal((await request("/api/shopify/onboarding/retry", {})).status, 200);
      assert.equal(calls, 1, "paid/used/blocked eligibility never invokes the claim");
    }
    cookie = ""; // new isolated session, not production data
    state = "recovery_required";
    failClaim = true;
    const failure = await request("/api/shopify/onboarding/retry", {});
    assert.equal(failure.status, 503);
    assert.deepEqual(await failure.json(), { state: "recovery_required" });
    assert.equal((await request("/api/shopify/onboarding/retry", {})).status, 429);
    failClaim = false;
    state = "trial_active";
    const event = { event: "first_successful_render", page: "start", email: "private@example.com" };
    assert.equal((await request("/api/shopify/activation-events", event)).status, 204);
    assert.equal((await request("/api/shopify/activation-events", event)).status, 204);
    assert.equal(events.filter((e: any) => e.event === event.event).length, 1);
    assert.doesNotMatch(JSON.stringify(events), /private@example/);
    assert.equal((await request("/api/shopify/activation-events", { event: "trial_activated", page: "start" })).status, 400);
    installed = false;
    assert.equal((await request("/api/shopify/onboarding/retry", {})).status, 409);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  }
});
