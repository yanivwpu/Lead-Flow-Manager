import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { build } from "esbuild";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

test("merchant setup HTTP routes enforce session ownership, same origin, strict bodies and independent activation", async () => {
  await mkdir("work", { recursive: true }); const dir = await mkdtemp(resolve("work/template-routes-"));
  const calls: any[] = []; (globalThis as any).__templateRouteCalls = calls;
  const previous = process.env.APP_URL; process.env.APP_URL = "https://fixture.example.invalid";
  let server: ReturnType<ReturnType<typeof express>["listen"]> | undefined;
  try {
    await build({ entryPoints: ["server/ecommerceMerchantActivationRoutes.ts"], outfile: join(dir, "router.mjs"), bundle: true,
      platform: "node", format: "esm", packages: "external", plugins: [{ name: "isolated-runtime", setup(b) {
        b.onLoad({ filter: /[/\\]shopifyTemplateProvisioningRuntime\.ts$/ }, () => ({ loader: "js", contents: `
          export const shopifyTemplateProvisioner={
            view:async(id)=>{globalThis.__templateRouteCalls.push(['view',id]);return {available:true,connected:true,authorized:false,rows:[]}},
            authorize:async(id)=>{globalThis.__templateRouteCalls.push(['authorize',id]);return true},
            savePlan:async(...args)=>{globalThis.__templateRouteCalls.push(['plan',...args]);return true},
            setDelivery:async(...args)=>{globalThis.__templateRouteCalls.push(['activate',...args]);return false}
          };` }));
        b.onLoad({ filter: /[/\\]drizzle[/\\]db\.ts$/ }, () => ({ loader: "js", contents: "export const db={};" }));
        b.onLoad({ filter: /[/\\]server[/\\]storage\.ts$/ }, () => ({ loader: "js", contents: "export const storage={};" }));
      } }] });
    const router = (await import(pathToFileURL(join(dir, "router.mjs")).href)).default;
    const app = express(); app.use(express.json()); app.use((req, _res, next) => {
      if (req.get("x-fixture-user")) req.user = { id: req.get("x-fixture-user") } as any; next();
    }); app.use("/api/shopify/merchant-engine", router);
    server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const endpoint = `http://127.0.0.1:${(server.address() as any).port}/api/shopify/merchant-engine`;
    const post = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(endpoint + path, {
      method: "POST", headers: { "Content-Type": "application/json", origin: process.env.APP_URL!, "x-fixture-user": "tenant-a", ...headers }, body: JSON.stringify(body),
    });
    assert.equal((await fetch(endpoint + "/template-setup")).status, 401);
    const auth = { action: "authorize_template_setup", packageVersion: 1 };
    assert.equal((await post("/template-setup", auth, { origin: "https://foreign.invalid" })).status, 403);
    assert.equal((await post("/template-setup", { ...auth, wabaId: "foreign" })).status, 400);
    assert.equal((await post("/template-setup", { ...auth, accountId: "tenant-b" })).status, 400);
    assert.equal(calls.length, 0);
    const response = await post("/template-setup", auth);
    assert.equal(response.status, 202); assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { ok: true, messagingEnabled: false });
    assert.deepEqual(calls, [["authorize", "tenant-a"]]);
    await fetch(endpoint + "/template-setup?wabaId=foreign&accountId=tenant-b", { headers: { "x-fixture-user": "tenant-a" } });
    assert.deepEqual(calls.at(-1), ["view", "tenant-a"]);
    assert.equal((await post("/journey-plan", { action: "save_post_purchase_plan", journey: "orderConfirmation", plan: { selected: true, delayMinutes: 0 } })).status, 200);
    assert.deepEqual(calls.at(-1), ["plan", "tenant-a", "orderConfirmation", { selected: true, delayMinutes: 0 }]);
    const activation = { action: "set_journey_delivery", journey: "checkoutRecovery", enabled: true };
    assert.equal((await post("/journey-activation", { ...activation, productionApproved: true })).status, 400);
    assert.equal((await post("/journey-activation", activation)).status, 409);
    assert.deepEqual(calls.at(-1), ["activate", "tenant-a", "checkoutRecovery", true]);
    for(let i=0;i<30;i++)assert.equal((await post('/template-setup',auth,{'x-fixture-user':'rate-limit-tenant'})).status,202);
    const blocked=await post('/template-setup',auth,{'x-fixture-user':'rate-limit-tenant'});
    assert.equal(blocked.status,429);assert.ok(Number(blocked.headers.get('retry-after'))>0);
    assert.equal(calls.filter(call=>call[0]==='authorize'&&call[1]==='rate-limit-tenant').length,30);
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close(e => e ? reject(e) : resolve()));
    if (previous === undefined) delete process.env.APP_URL; else process.env.APP_URL = previous;
    delete (globalThis as any).__templateRouteCalls; await rm(dir, { recursive: true, force: true });
  }
});
