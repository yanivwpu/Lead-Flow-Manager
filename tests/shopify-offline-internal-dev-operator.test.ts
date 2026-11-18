import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("internal dev offline-token CLI is store-pinned, idle-only, operator-only", () => {
  const source = readFileSync("scripts/shopify-offline-internal-dev-operator.ts","utf8");
  const build = readFileSync("script/build.ts","utf8");
  assert.match(source,/const SHOP = "whachatcrm\.myshopify\.com" as const/);
  assert.match(source,/const OWNER = "[a-f0-9-]{36}" as const/);
  assert.match(source,/EXPECTED_ENVIRONMENT/);
  assert.match(source,/EXPECTED_SERVICE/);
  assert.match(source,/const ACK = "--acknowledge-invalidate-only-whachatcrm-internal-dev-store-legacy"/);
  assert.match(source,/const check = args\.length === 1 && args\[0\] === "--preflight"/);
  assert.match(source,/const convert = args\.length === 2 && args\[0\] === "--convert" && args\[1\] === ACK/);
  assert.match(source,/assertOfflineTokenStorage\(\)/);
  assert.match(source,/deletion_requested_at IS NULL/);
  assert.match(source,/ambiguous_shop_ownership/);
  assert.match(source,/previous_attempt_requires_manual_review/);
  assert.match(source,/outbound_processing_in_flight/);
  assert.match(source,/currentAppInstallation \{ app \{ apiKey \}/);
  assert.match(source,/provider_app_or_shop_identity_unverified/);
  assert.match(source,/migrateAuthorizedLegacyInstallation\(\{/);
  assert.match(source,/converted_pair_stored/);
  assert.match(build,/dist\/shopify-offline-internal-dev-operator\.cjs/);
  assert.doesNotMatch(source,/\/api\//);
});
