import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { createEcommercePilotGuard } from "../server/ecommerce/pilotGuard";
import { ecommercePilotConfigured, isEcommercePilotOwner, ecommerceInternalTasksEnabled } from "../server/ecommerce/pilotAccess";
import { resolveAppNavSections } from "../shared/appNav";
import { shouldServeSpaFallback } from "../server/spaRouting";
import { getMarketingRoutes, isNoIndexPath } from "../server/seo";

const id = "10000000-0000-4000-8000-000000000001";
const env = { ECOMMERCE_PILOT_ENABLED: "true", ECOMMERCE_PILOT_WORKSPACE_ID: id,
  ECOMMERCE_PILOT_OWNER_EMAIL: "pilot-owner@example.invalid", RAILWAY_ENVIRONMENT_NAME: "production",
  APP_URL: "https://app.whachatcrm.com", ECOMMERCE_EVENT_RECORDING_ENABLED: "true",
  ECOMMERCE_ORDER_SUPPORT_TASKS_ENABLED: "true" };

test("pilot grant requires deployment origin, exact workspace and a fresh matching database owner", () => {
  const owner = { id, email: "pilot-owner@example.invalid" };
  assert.equal(isEcommercePilotOwner(owner, env), true);
  for (const key of Object.keys(env)) {
    if (key === "ECOMMERCE_EVENT_RECORDING_ENABLED" || key === "ECOMMERCE_ORDER_SUPPORT_TASKS_ENABLED") continue;
    assert.equal(ecommercePilotConfigured({ ...env, [key]: undefined }), false, key);
  }
  for (const candidate of [null, { id: "other", email: owner.email }, { id, email: "other@example.com" }])
    assert.equal(isEcommercePilotOwner(candidate, env), false);
  assert.equal(ecommercePilotConfigured({ ...env, APP_URL: "https://app.whachatcrm.com.evil.invalid" }), false);
  assert.equal(ecommercePilotConfigured({ ...env, RAILWAY_ENVIRONMENT_NAME: "staging" }), false);
  assert.equal(ecommercePilotConfigured({ ...env, ECOMMERCE_PILOT_ENABLED: "TRUE" }), false);
  for(const email of ["", "missing-at", "owner@example.invalid\r\nforged", "Owner@example.invalid", " owner@example.invalid", "a".repeat(255)+"@example.invalid"])
    assert.equal(ecommercePilotConfigured({...env,ECOMMERCE_PILOT_OWNER_EMAIL:email}),false);
  assert.equal(ecommerceInternalTasksEnabled(env), true);
  assert.equal(ecommerceInternalTasksEnabled({ ...env, ECOMMERCE_EVENT_RECORDING_ENABLED: "false" }), false);
  assert.equal(ecommerceInternalTasksEnabled({ ...env, ECOMMERCE_ORDER_SUPPORT_TASKS_ENABLED: "false" }), false);
});

test("real HTTP guard rejects forged identity, nonpilot/admin, cross-origin and unavailable owner before handler execution", async () => {
  let owner: { id: string; email: string } | undefined = { id, email: "pilot-owner@example.invalid" };
  let failLookup = false, ownerReads = 0, writes = 0;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { if (req.get("x-fixture-session")) req.user = { id: req.get("x-fixture-session"), isAdmin: true } as any; next(); });
  app.use("/api/shopify/ecommerce", createEcommercePilotGuard({ env, getOwner: async () => {
    ownerReads++; if (failLookup) throw Error("database unavailable"); return owner;
  }}));
  app.post("/api/shopify/ecommerce/change", (_req, res) => { writes++; res.json({ ok: true }); });
  app.get("/api/shopify/connection-status", (_req, res) => res.json({ existing: true }));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}`;
  const post = (headers: Record<string, string> = {}, body = {}) => fetch(url + "/api/shopify/ecommerce/change", {
    method: "POST", headers: { "content-type": "application/json", origin: env.APP_URL, ...headers }, body: JSON.stringify(body),
  });
  try {
    assert.equal((await post({}, { id, email: env.ECOMMERCE_PILOT_OWNER_EMAIL })).status, 401);
    assert.equal((await post({ "x-fixture-session": "other" }, { id })).status, 404);
    assert.equal(ownerReads, 0);
    assert.equal((await post({ "x-fixture-session": id, origin: "https://evil.invalid" })).status, 403);
    assert.equal((await post({ "x-fixture-session": id, "content-type": "text/plain" })).status, 403);
    assert.equal(ownerReads, 0);
    owner = { id, email: "changed@example.com" };
    assert.equal((await post({ "x-fixture-session": id })).status, 404);
    failLookup = true;
    assert.equal((await post({ "x-fixture-session": id })).status, 503);
    assert.equal(writes, 0);
    failLookup = false; owner = { id, email: env.ECOMMERCE_PILOT_OWNER_EMAIL };
    const response = await post({ "x-fixture-session": id });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.equal(writes, 1);
    assert.equal((await fetch(url + "/api/shopify/connection-status")).status, 200);
  } finally { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); }
});

test("other merchants retain navigation; only an explicit pilot grant reveals the engine", () => {
  const flags = { hasPresetCampaigns: true, prospectAiActivated: true, realtorGrowthEngineActivated: true };
  const before = resolveAppNavSections(flags);
  assert.deepEqual(resolveAppNavSections({ ...flags, ecommercePilotEnabled: false }), before);
  const after = resolveAppNavSections({ ...flags, ecommercePilotEnabled: true });
  assert.equal(after.flatMap(x => x.itemIds).filter(x => x === "ecommerceGrowthEngine").length, 1);
  assert.deepEqual(after.map(x => ({ ...x, itemIds: x.itemIds.filter(id => id !== "ecommerceGrowthEngine") })), before);
});

test("authorized private preview has a production SPA shell without joining public marketing routes", () => {
  const marketing = getMarketingRoutes();
  assert.equal(shouldServeSpaFallback('/ecommerce-growth-engine', marketing), true);
  assert.equal(isNoIndexPath('/ecommerce-growth-engine'), true);
  assert.equal(isNoIndexPath('/app/ecommerce-growth-engine'), true);
  assert.equal(marketing.includes('/ecommerce-growth-engine'), false);
  assert.equal(shouldServeSpaFallback('/ecommerce-growth-engine/unknown', marketing), false);
});
