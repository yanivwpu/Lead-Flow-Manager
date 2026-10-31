import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  rememberEcommerceShopifyInstallReturn,
  hasEcommerceShopifyInstallReturn,
  clearEcommerceShopifyInstallReturn,
} from "../client/src/lib/ecommerceShopifyInstallReturn";

function makeStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    removeItem(key: string) { values.delete(key); },
    values,
  };
}

test("recent setup intent survives a Shopify tab change only for the initiating workspace", () => {
  const s = makeStorage();
  const now = Date.now();
  rememberEcommerceShopifyInstallReturn("merchant-A", s, now);
  assert.equal(hasEcommerceShopifyInstallReturn("merchant-A", s, now + 10_000), true);
  assert.equal(hasEcommerceShopifyInstallReturn("merchant-B", s, now + 10_000), false);
  assert.equal(hasEcommerceShopifyInstallReturn("merchant-A", s, now + 30 * 60_000), false);
  assert.equal(s.values.size, 0);
});

test("successful same-user setup clears its return hint", () => {
  const s = makeStorage();
  rememberEcommerceShopifyInstallReturn("merchant-A", s);
  clearEcommerceShopifyInstallReturn("merchant-B", s);
  assert.equal(hasEcommerceShopifyInstallReturn("merchant-A", s), true);
  clearEcommerceShopifyInstallReturn("merchant-A", s);
  assert.equal(hasEcommerceShopifyInstallReturn("merchant-A", s), false);
});

test("invalid browser hints cannot redirect a different user or bypass server verification", () => {
  const s = makeStorage();
  s.setItem("whachatcrm_ecommerce_shopify_setup_return_v1", '{"userId":"merchant-A","expiresAt":"forever"}');
  assert.equal(hasEcommerceShopifyInstallReturn("merchant-A", s), false);
  assert.equal(s.values.size, 0);
  const app = readFileSync("client/src/pages/AppLayout.tsx", "utf8");
  const setup = readFileSync("client/src/pages/EcommerceGrowthEngineOnboarding.tsx", "utf8");
  assert.ok(setup.includes("rememberEcommerceShopifyInstallReturn(user.id)"));
  assert.ok(setup.includes("clearEcommerceShopifyInstallReturn(user.id)"));
  assert.ok(app.includes('fetch("/api/shopify/merchant-engine/status"'));
  assert.ok(app.includes("!status?.connected || !hasEcommerceShopifyInstallReturn(userId)"));
  assert.ok(app.includes('setLocation("/app/ecommerce-growth-engine?view=setup")'));
  assert.ok(!app.includes("activateEcommerceMerchant()"));
});
