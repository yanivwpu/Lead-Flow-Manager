import assert from "node:assert/strict";
import test from "node:test";
import { resolveAssignedOwner } from "../server/shopifyAssignedOwner";
const shop = "whachatcrm.myshopify.com";
test("assigned marketing owner wins even after uninstall clears the store mapping", async () => {
  const target = { id: "marketing", shopifyShop: null };
  assert.equal(await resolveAssignedOwner(shop, {
    targetId: async () => target.id, user: async () => target, shopOwner: async () => undefined,
  }), target);
});
test("missing, conflicting and changed owner records deny rather than selecting a synthetic account", async () => {
  for (const [owner, byShop] of [
    [undefined,undefined], [{id:"old"},undefined],
    [{id:"marketing",shopifyShop:"other.myshopify.com"},undefined],
    [{id:"marketing"},{id:"old"}],
  ] as const) await assert.rejects(resolveAssignedOwner(shop, {
    targetId: async () => "marketing", user: async () => owner, shopOwner: async () => byShop,
  }), /SHOPIFY_ASSIGNED_OWNER_UNAVAILABLE/);
});
test("unassigned stores retain the existing resolver; unavailable binding lookup fails closed", async () => {
  let reads=0;
  assert.equal(await resolveAssignedOwner(shop, {targetId:async()=>undefined,
    user:async()=>{reads++;return undefined;},shopOwner:async()=>{reads++;return undefined;}}),undefined);
  assert.equal(reads,0);
  await assert.rejects(resolveAssignedOwner(shop,{targetId:async()=>{throw Error('DB unavailable');},
    user:async()=>undefined,shopOwner:async()=>undefined}),/DB unavailable/);
});
