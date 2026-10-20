import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseOrderSupportQuickStart, orderSupportQuickStartAvailable
} from "../server/ecommerce/orderSupportQuickStart";

const allowed = {
  RAILWAY_ENVIRONMENT_NAME: "staging",
  APP_URL: "https://whachatcrm-staging-app-staging.up.railway.app",
  ECOMMERCE_EVENT_RECORDING_ENABLED: "true",
  ECOMMERCE_ORDER_SUPPORT_TASKS_ENABLED: "true",
};
test("one-click start accepts one exact action, not arbitrary workflow or owner fields", () => {
  assert.equal(parseOrderSupportQuickStart({action:"start_order_support"}),true);
  for(const x of [null,[],{}, {action:"start_order_support", shop:"other.myshopify.com"},
    {action:"start_order_support", accountId:"foreign"}, {action:"start_order_support",messagingEnabled:true},
    {action:"start_order_support",channel:"whatsapp"}, {action:"start_fulfillment"}])
    assert.equal(parseOrderSupportQuickStart(x),false);
  assert.equal(orderSupportQuickStartAvailable(allowed),true);
  for(const key of Object.keys(allowed)){
    const bad={...allowed,[key]:""};
    assert.equal(orderSupportQuickStartAvailable(bad),false,key);
  }
  assert.equal(orderSupportQuickStartAvailable({...allowed,RAILWAY_ENVIRONMENT_NAME:"production"}),false);
});
test("one-click route composes draft and opt-in inside same shop-locked staging transaction",()=>{
  const file=readFileSync("server/shopifyRoutes.ts","utf8");
  const start=file.indexOf("router.post('/ecommerce/order-support-quick-start'");
  const end=file.indexOf("router.post('/ecommerce/order-support-settings'",start);
  assert.ok(start>=0 && end>start);
  const route=file.slice(start,end);
  for(const required of [
    "process.env.RAILWAY_ENVIRONMENT_NAME !== 'staging'",
    "req.get('origin') !== origin",
    "parseOrderSupportQuickStart(req.body)",
    "orderSupportQuickStartAvailable(process.env)",
    "db.transaction(async tx =>",
    "pg_advisory_xact_lock",
    "isShopifyContactInstallationActive(liveOwner)",
    "installations.length !== 1",
    "cfg.syncOptions.includes('new_orders')",
    "orderSupportTablesReady(ready.rows[0])",
    "saveWorkflowDraftQuery({",
    "journey:'orderSupport',prepared:true",
    "saveOrderTaskMerchantOptInQuery(accountId,shop,true)",
    "if (optIn.rows.length !== 1) throw",
    "messagingEnabled:false,checkoutEnabled:false",
  ])assert.ok(route.includes(required),required);
  for(const forbidden of [
    "req.body.shop","req.body.accountId","sendMessage","sendWhatsApp",
    "cartCreate","subscribeWebhook","triggerCommerceEventWorkflows"
  ])assert.equal(route.includes(forbidden),false,forbidden);
});
test("merchant surface keeps a single clear call to action and hides technical controls",()=>{
  const setup=readFileSync("client/src/components/integrations/ShopifySimpleSetup.tsx","utf8");
  const panel=readFileSync("client/src/components/integrations/ShopifyManagePanel.tsx","utf8");
  for(const words of [
    "Turn on order support","On — new orders create tasks","View tasks",
    "Pause","No customer messages","order-support-quick-start"
  ])assert.ok(setup.includes(words),words);
  for(const forbidden of ["Prepare draft","Fulfillment assistance","Abandoned-cart recovery",
    "Mark reviewed","Customer outreach","Send campaign"])
    assert.equal(setup.includes(forbidden),false,forbidden);
  assert.ok(panel.includes("<ShopifySimpleSetup syncEnabled={!!status.syncEnabled} />"));
  assert.ok(panel.includes("<summary className=\"cursor-pointer font-medium text-slate-700\">Settings & advanced</summary>"));
  assert.ok(panel.includes("<ShopifyEcommerceInboxPreview />"));
  assert.ok(panel.includes("<ShopifyWebhookAdvancedTools"));
  assert.ok(panel.includes("data-testid=\"button-disconnect-shopify\""));
});
