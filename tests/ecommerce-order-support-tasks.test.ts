import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  isStagingOrderSupportTaskExecutionEnabled,
  orderSupportTaskInsertQuery,
} from "../server/ecommerce/orderSupportTaskQueue";

test("task execution remains off unless both staging and recording gates are explicitly enabled", () => {
  const enabled = {
    RAILWAY_ENVIRONMENT_NAME: "staging",
    APP_URL: "https://whachatcrm-staging-app-staging.up.railway.app",
    ECOMMERCE_EVENT_RECORDING_ENABLED: "true",
    ECOMMERCE_ORDER_SUPPORT_TASKS_ENABLED: "true",
  };
  assert.equal(isStagingOrderSupportTaskExecutionEnabled(enabled), true);
  for (const key of Object.keys(enabled) as Array<keyof typeof enabled>) {
    assert.equal(isStagingOrderSupportTaskExecutionEnabled({ ...enabled, [key]: "" }), false, key);
  }
  assert.equal(isStagingOrderSupportTaskExecutionEnabled({
    ...enabled, RAILWAY_ENVIRONMENT_NAME: "production",
  }), false);
  assert.equal(isStagingOrderSupportTaskExecutionEnabled({
    ...enabled, APP_URL: "https://app.whachatcrm.com",
  }), false);
});

test("task identity is bounded and cannot use arbitrary shops or missing contact", () => {
  const good = { accountId: "account-a", canonicalShop: "example.myshopify.com", deliveryId: "verified-event", contactId: "owned-contact" };
  assert.ok(orderSupportTaskInsertQuery(good));
  assert.equal(orderSupportTaskInsertQuery({ ...good, canonicalShop: "other.example.com" }), null);
  assert.equal(orderSupportTaskInsertQuery({ ...good, contactId: "" }), null);
  assert.equal(orderSupportTaskInsertQuery({ ...good, deliveryId: "x".repeat(257) }), null);
  assert.equal(orderSupportTaskInsertQuery({ ...good, accountId: "" }), null);
});

test("Shopify bridge only dispatches a non-sending internal task after durable event recording", () => {
  const webhook = readFileSync("server/shopifyCommerceWebhooks.ts", "utf8");
  const module = readFileSync("server/ecommerce/orderSupportTaskQueue.ts", "utf8");
  assert.match(webhook, /isStagingOrderSupportTaskExecutionEnabled\(process\.env\)/);
  assert.match(webhook, /orderSupportTaskInsertQuery/);
  assert.match(webhook, /result\.contactId/);
  assert.match(module, /prefs\.tasks_enabled = TRUE/);
  assert.match(module, /c\.user_id = e\.account_id/);
  assert.match(module, /ON CONFLICT \(event_id\) DO NOTHING/);
  for (const code of ["sendMessage(", "cartCreate(", "triggerCommerceEventWorkflows(", "dispatchCommerceEventAutomation("]) {
    assert.equal(module.includes(code), false, code);
  }
});
