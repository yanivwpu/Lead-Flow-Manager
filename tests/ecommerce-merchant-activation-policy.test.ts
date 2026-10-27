import assert from "node:assert/strict";
import test from "node:test";
import { canActivateMerchantWorkspace, merchantWorkspaceActivated, isMerchantActivationPost } from "../server/ecommerce/merchantActivationPolicy";

const eligible = {
  accountId: "acct-a",
  sessionAccountId: "acct-a",
  sessionAligned: true,
  connectedShop: "fixture.myshopify.com",
  hasInstalledToken: true,
  planEligible: true,
  isShopifyOwner: true,
};

test("workspace activation requires owner, session, connection, token and plan", () => {
  assert.equal(canActivateMerchantWorkspace(eligible), true);
  for (const [key, value] of [
    ["sessionAccountId", "acct-b"],
    ["sessionAligned", false],
    ["connectedShop", "other.example.com"],
    ["connectedShop", null],
    ["hasInstalledToken", false],
    ["planEligible", false],
    ["isShopifyOwner", false],
  ] as const) assert.equal(canActivateMerchantWorkspace({ ...eligible, [key]: value }), false, key);
});

test("activation state is explicit and not inferred from Shopify installation", () => {
  assert.equal(merchantWorkspaceActivated(null), false);
  assert.equal(merchantWorkspaceActivated(undefined), false);
  assert.equal(merchantWorkspaceActivated("not-a-date"), false);
  assert.equal(merchantWorkspaceActivated("2026-10-27T11:00:00Z"), true);
});

test("activation requires an explicit same-origin empty JSON POST", () => {
  const app = "https://app.whachatcrm.com";
  assert.equal(isMerchantActivationPost(app, "application/json; charset=utf-8", {}, app), true);
  for (const [origin, contentType, body] of [
    [undefined, "application/json", {}],
    ["https://evil.example", "application/json", {}],
    [app, "text/plain", {}],
    [app, "application/x-www-form-urlencoded", {}],
    [app, "application/json", { autoSend: true }],
    [app, "application/json", null],
    [app, "application/json", []],
  ] as const) {
    assert.equal(isMerchantActivationPost(origin, contentType, body, app), false);
  }
});
test("persisted activation state validates a real timestamp", () => {
  assert.equal(merchantWorkspaceActivated(new Date("2026-10-27T11:00:00Z")), true);
  assert.equal(merchantWorkspaceActivated(new Date(NaN)), false);
});
