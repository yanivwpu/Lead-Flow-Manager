import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import crypto from "crypto";
import { createShopifyStoreRedactionHandler } from "../server/shopifyStoreRedactionHandler";

test("signed store erasure validates raw HMAC/domain and retries failures without leaking payloads", async () => {
  const app = express();
  app.use(express.json({ verify: (req, _res, body) => { (req as any).rawBody = body; } }));
  let calls = 0; let fail = false;
  app.post("/redact", createShopifyStoreRedactionHandler({
    verify: (body, signature) => {
      const actual = crypto.createHmac("sha256", "fixture-only").update(body).digest("base64");
      return signature === actual;
    },
    redact: async shop => { calls++; assert.equal(shop, "fixture.myshopify.com"); if (fail) throw new Error("fixture failure"); },
  }));
  const server = app.listen(0); await new Promise<void>(r => server.once("listening", r));
  const port = (server.address() as { port: number }).port;
  const url = "http://127.0.0.1:" + port + "/redact";
  const body = JSON.stringify({ shop_domain: "fixture.myshopify.com", unrelatedContact: ["contact", "example.invalid"].join("@") });
  const signature = crypto.createHmac("sha256", "fixture-only").update(body).digest("base64");
  const headers = { "Content-Type": "application/json", "x-shopify-shop-domain": "fixture.myshopify.com", "x-shopify-hmac-sha256": signature };
  try {
    assert.equal((await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body })).status, 401);
    assert.equal((await fetch(url, { method: "POST", headers: { ...headers, "x-shopify-hmac-sha256": "invalid" }, body })).status, 401);
    assert.equal(calls, 0);
    assert.equal((await fetch(url, { method: "POST", headers: { ...headers, "x-shopify-shop-domain": "other.myshopify.com" }, body })).status, 400);
    assert.equal(calls, 0);
    const response = await fetch(url, { method: "POST", headers, body });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const result = await response.json();
    assert.ok(result.databaseErased && result.externalErasurePending);
    assert.ok(!JSON.stringify(result).includes("@"));
    fail = true;
    assert.equal((await fetch(url, { method: "POST", headers, body })).status, 503);
    assert.equal(calls, 2);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
