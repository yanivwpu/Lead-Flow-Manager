import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseSupportTaskChange, parseSupportTaskComplete,
  orderSupportTablesReady,
} from "../server/ecommerce/orderSupportMerchantControls";

test("merchant opt-in accepts only exact action and explicit boolean", () => {
  assert.deepEqual(parseSupportTaskChange({action:"set_internal_order_tasks",enabled:true}), {action:"set_internal_order_tasks",enabled:true});
  assert.deepEqual(parseSupportTaskChange({action:"set_internal_order_tasks",enabled:false}), {action:"set_internal_order_tasks",enabled:false});
  for (const invalid of [null,[],{}, {action:"set_internal_order_tasks",enabled:"true"}, {action:"send",enabled:true},
    {action:"set_internal_order_tasks",enabled:1},{action:"set_internal_order_tasks",enabled:true,shop:"foreign"}])
    assert.equal(parseSupportTaskChange(invalid),null);
  assert.deepEqual(parseSupportTaskComplete({action:"complete_internal_order_task",taskId:"1"}),{taskId:"1"});
  for (const invalid of [null,[],{}, {action:"complete_internal_order_task",taskId:"0"},
    {action:"complete_internal_order_task",taskId:"1",accountId:"foreign"},
    {action:"complete_internal_order_task",taskId:1},
    {action:"mark_reviewed",taskId:"1"}]) assert.equal(parseSupportTaskComplete(invalid),null);
  for (const invalid of [null,undefined,{}, {settings:null,tasks:"x"},{settings:"x",tasks:null}])
    assert.equal(orderSupportTablesReady(invalid),false);
  assert.equal(orderSupportTablesReady({settings:"public.ecommerce_growth_order_task_settings",tasks:"public.ecommerce_growth_order_support_tasks"}),true);
});

test("merchant setting and task completion are staging-only, scoped, and never send", () => {
  const route=readFileSync("server/shopifyRoutes.ts","utf8");
  const begin=route.indexOf("router.post('/ecommerce/order-support-settings'");
  const end=route.indexOf("router.get('/webhooks/health/all'",begin);
  assert.ok(begin>=0 && end>begin);
  const snippet=route.slice(begin,end);
  for(const check of [
    "RAILWAY_ENVIRONMENT_NAME !== 'staging'","req.get('origin')",
    "parseSupportTaskChange(req.body)","parseSupportTaskComplete(req.body)",
    "pg_advisory_xact_lock","isShopifyContactInstallationActive(liveOwner)",
    "matches.length !== 1","orderSupportTablesReady(ready.rows[0])",
    "readWorkflowDraftSettings(cfg).orderSupport",
    "cfg.syncOptions.includes('new_orders')",
    "saveOrderTaskMerchantOptInQuery(accountId,shop,input.enabled)",
    "markOrderSupportTaskCompleteQuery(input.taskId,accountId,shop)",
  ]) assert.ok(snippet.includes(check), check);
  for (const excluded of ["sendMessage","dispatchCommerceEventAutomation","triggerCommerceEventWorkflows",
    "cartCreate","req.body.accountId","req.body.shop"]) assert.equal(snippet.includes(excluded),false,excluded);
  const client=readFileSync("client/src/components/integrations/ShopifyEcommerceInboxPreview.tsx","utf8");
  for(const wording of ["Opt in to internal tasks","Pause internal tasks","Mark task completed",
    "Staging database setup pending", "Task opt-in does not activate messaging"]) assert.ok(client.includes(wording),wording);
  assert.ok(!client.includes("Activate workflow"));
});

test("uninstall and privacy erasure revoke task opt-in and purge task/event metadata safely",()=>{
  const uninstall=readFileSync("server/shopifyContactService.ts","utf8");
  assert.ok(uninstall.includes("DELETE FROM ecommerce_growth_order_task_settings"));
  assert.ok(uninstall.includes("pg_advisory_xact_lock"));
  assert.ok(uninstall.includes("to_regclass('public.ecommerce_growth_order_task_settings')"));
  const store=readFileSync("server/shopifyPrivacyRedaction.ts","utf8");
  for(const line of ["DELETE FROM ecommerce_growth_order_support_tasks","DELETE FROM ecommerce_growth_event_inbox",
    "DELETE FROM ecommerce_growth_order_task_settings"]) assert.ok(store.includes(line),line);
  const customer=readFileSync("server/shopifyPrivacyRequests.ts","utf8");
  assert.ok(customer.includes("DELETE FROM ecommerce_growth_order_support_tasks"));
  assert.ok(customer.includes("account_id = ${user.id} AND shop = ${shop}"));
});
