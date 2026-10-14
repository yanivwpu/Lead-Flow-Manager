import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import express from "express";
import { createShopifyCustomerPrivacyHandler } from "../server/shopifyCustomerPrivacyHandler";
test("raw signed access requests cannot invoke deletion; domain mismatches and failures are rejected", async () => {
  const app = express(); app.use(express.json({ verify: (req, _res, body) => { (req as any).rawBody = body; } }));
  const calls: string[] = []; let fail = false;
  const deps = { verify: (body: Buffer | string, sig: string) => crypto.createHmac("sha256", "fixture").update(body).digest("base64") === sig,
    dedupe: (kind: string) => kind, process: async (kind: "customer_erasure" | "access_request") => { if (fail) throw Error("private contact"); calls.push(kind); } };
  app.post("/access", createShopifyCustomerPrivacyHandler("access_request", deps));
  app.post("/delete", createShopifyCustomerPrivacyHandler("customer_erasure", deps));
  const server = app.listen(0); await new Promise<void>(r => server.once("listening", r));
  const port = (server.address() as any).port;
  const body = JSON.stringify({ shop_domain: "fixture.myshopify.com", customer: { id: 12 } });
  const headers = { "Content-Type": "application/json", "x-shopify-shop-domain": "fixture.myshopify.com", "x-shopify-hmac-sha256": crypto.createHmac("sha256", "fixture").update(body).digest("base64") };
  const post = (path: string, extra = {}) => fetch(`http://127.0.0.1:${port}/${path}`, { method: "POST", body, headers: { ...headers, ...extra } });
  try {
    assert.equal((await post("access", { "x-shopify-hmac-sha256": "invalid" })).status, 401);
    assert.equal((await post("access", { "x-shopify-shop-domain": "other.myshopify.com" })).status, 400);
    assert.equal((await post("access")).status, 200); assert.deepEqual(calls, ["access_request"]);
    const deletion = await post("delete"); assert.equal(deletion.status, 200); assert.equal((await deletion.json()).status, "pending_verification");
    fail = true; const failed = await post("delete"); assert.equal(failed.status, 503); assert.ok(!JSON.stringify(await failed.json()).includes("private contact"));
  } finally { await new Promise<void>(r => server.close(() => r())); }
});
