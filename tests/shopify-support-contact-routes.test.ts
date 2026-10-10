import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import session from "express-session";
import { createShopifySupportContactRouter } from "../server/shopifySupportContactRoutes";
import type { ShopifySupportContactAction } from "../shared/shopifyContactPrivacy";
const fixtureEmail = ["contact", "example.invalid"].join("@");

test("contact endpoint is session-scoped, private, CSRF protected and does not intercept OAuth/webhooks", async () => {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "fixture-session-only", resave: false, saveUninitialized: false }));
  app.post("/fixture/login", (req, res) => { (req.session as any).fixture = "merchant"; res.sendStatus(204); });
  app.use((req, _res, next) => { if ((req.session as any).fixture) (req as any).user = { id: "merchant" }; next(); });
  let writes = 0; let active = true; let lastAction: ShopifySupportContactAction | undefined;
  app.use("/api/shopify", createShopifySupportContactRouter({
    read: async id => { assert.equal(id, "merchant"); return { available: active, suggestedEmail: active ? fixtureEmail : null, confirmed: false, dismissed: false }; },
    save: async (id, action) => { assert.equal(id, "merchant"); if (!active) return false; writes++; lastAction = action; return true; },
  }));
  app.get("/api/shopify/callback", (_req, res) => res.sendStatus(204));
  app.post("/api/shopify/webhooks/shop/redact", (_req, res) => res.sendStatus(204));
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const origin = "http://127.0.0.1:" + address.port;
  const path = origin + "/api/shopify/support-contact";
  try {
    assert.equal((await fetch(path)).status, 401);
    assert.equal((await fetch(origin + "/api/shopify/callback")).status, 204);
    assert.equal((await fetch(origin + "/api/shopify/webhooks/shop/redact", { method: "POST" })).status, 204);
    const login = await fetch(origin + "/fixture/login", { method: "POST" });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const response = await fetch(path, { headers: { Cookie: cookie } });
    assert.equal(response.headers.get("cache-control"), "no-store");
    const read = await response.json();
    assert.ok(read.suggestedEmail === fixtureEmail);
    assert.equal((await fetch(path, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm", email: fixtureEmail }) })).status, 403);
    const headers = { Cookie: cookie, Origin: origin, "Content-Type": "application/json" };
    assert.equal((await fetch(path, { method: "POST", headers, body: JSON.stringify({ action: "confirm", email: "invalid" }) })).status, 400);
    assert.equal(writes, 0);
    assert.equal((await fetch(path, { method: "POST", headers,
      body: JSON.stringify({ action: "confirm", email: fixtureEmail, userId: "other", shop: "other.myshopify.com", marketingConsent: true }) })).status, 200);
    assert.equal(writes, 1);
    assert.ok(lastAction?.action === "confirm" && !("userId" in lastAction) && !("marketingConsent" in lastAction));
    active = false;
    const unavailable = await (await fetch(path, { headers: { Cookie: cookie } })).json();
    assert.ok(unavailable.available === false && unavailable.suggestedEmail === null);
    assert.equal((await fetch(path, { method: "POST", headers, body: JSON.stringify({ action: "dismiss" }) })).status, 409);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
