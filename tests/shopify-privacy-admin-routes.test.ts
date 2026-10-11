import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registerShopifyPrivacyAdminRoutes } from "../server/shopifyPrivacyAdminRoutes";
test("privacy operations require the Admin gate and return a no-store bounded response", async () => {
  const app = express(); let reads = 0;
  registerShopifyPrivacyAdminRoutes(app, (req,res,next) => { if (req.get("x-admin-token") !== "fixture-admin") { res.status(403).end(); return; } next(); }, async () => {
    reads++; return { counts: { pending: 1, retrying: 0, blocked: 0, overdue: 0, verified_complete: 0 }, alerts: [], outboundAlertsConfigured: false };
  });
  const server = app.listen(0); await new Promise<void>(r => server.once("listening",r));
  const url = `http://127.0.0.1:${(server.address() as any).port}/api/admin/privacy-operations`;
  try {
    assert.equal((await fetch(url)).status,403); assert.equal(reads,0);
    const response = await fetch(url,{ headers:{ "x-admin-token":"fixture-admin" } }); assert.equal(response.status,200);
    assert.equal(response.headers.get("cache-control"),"no-store"); const data=await response.json(); assert.equal(data.counts.pending,1);
    assert.ok(!JSON.stringify(data).includes("email"));
  } finally { await new Promise<void>(r => server.close(()=>r())); }
});
