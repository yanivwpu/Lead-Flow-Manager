import assert from "node:assert/strict";
import test from "node:test";
import { canActivateMerchantWorkspace, merchantWorkspaceActivated } from "../server/ecommerce/merchantActivationPolicy";

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
