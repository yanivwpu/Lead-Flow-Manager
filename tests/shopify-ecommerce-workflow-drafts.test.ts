import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseWorkflowDraftChange, readWorkflowDraftSettings, ECOMMERCE_DRAFT_JOURNEYS } from "../server/ecommerce/workflowDraftSettings";

test("workflow draft parser permits only known journeys and exact boolean with save_draft action",()=>{
  for (const journey of ECOMMERCE_DRAFT_JOURNEYS) {
    assert.deepEqual(parseWorkflowDraftChange({action:"save_draft",journey,prepared:true}), {journey,prepared:true});
    assert.deepEqual(parseWorkflowDraftChange({action:"save_draft",journey,prepared:false}), {journey,prepared:false});
  }
  for (const input of [undefined,null,[],{}, {action:"enable",journey:"orderSupport",prepared:true},
    {action:"save_draft",journey:"orderSupport",prepared:1},
    {action:"save_draft",journey:"orders/create",prepared:true},
    {action:"save_draft",journey:"__proto__",prepared:true},
    {action:"save_draft",journey:"abandonedCart",prepared:true,send:true},
    {action:"save_draft",journey:"orderSupport",prepared:true,accountId:"other"}]) {
    assert.equal(parseWorkflowDraftChange(input),null);
  }
});
test("unknown, malformed or missing config cannot opt in to workflow draft",()=>{
  const expected={orderSupport:false,fulfillmentSupport:false,orderCancelled:false,abandonedCart:false};
  for(const cfg of [null,[],{}, {ecommerceGrowthEngineDrafts:null},
    {ecommerceGrowthEngineDrafts:[]}, {ecommerceGrowthEngineDrafts:{orderSupport:"true"}},
    {ecommerceGrowthEngineDrafts:{orderSupport:1}}]) assert.deepEqual(readWorkflowDraftSettings(cfg),expected);
  assert.deepEqual(readWorkflowDraftSettings({ecommerceGrowthEngineDrafts:{orderSupport:true,abandonedCart:true}}),
    {...expected,orderSupport:true,abandonedCart:true});
});
test("staging mutation requires exact origin JSON, authenticated active Shopify tenant and uninstall lock",()=>{
  const src=readFileSync("server/shopifyRoutes.ts","utf8");
  const i=src.indexOf("router.post('/ecommerce/workflow-draft'");
  const j=src.indexOf("router.get('/webhooks/health/all'",i);
  assert.ok(i>=0&&j>i);
  const route=src.slice(i,j);
  for(const guard of ["RAILWAY_ENVIRONMENT_NAME !== 'staging'","req.get('origin')",
    "parseWorkflowDraftChange(req.body)","req.user","getUserForSession(accountId)",
    "pg_advisory_xact_lock", "isShopifyContactInstallationActive(liveOwner)",
    "installations.length !== 1","saveWorkflowDraftQuery(", "workflowActive: false",
    "messagingEnabled: false"]) assert.ok(route.includes(guard),guard);
  for(const forbidden of ["sendMessage", "triggerCommerceEventWorkflows", "dispatchCommerceEventAutomation",
    "cartCreate", "req.body.accountId", "req.body.shop"]) assert.ok(!route.includes(forbidden),forbidden);
});
test("merchant UI presents explicit draft-only controls rather than live activation",()=>{
  const view=readFileSync("client/src/components/integrations/ShopifyEcommerceInboxPreview.tsx","utf8");
  for(const label of ["Prepare draft","Remove draft","Draft prepared · inactive",
    "Saving a draft does not enable any workflow or message", "Not subscribed or wired yet"])assert.ok(view.includes(label),label);
  assert.ok(!view.includes('Activate workflow'));
});
