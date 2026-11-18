import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("legacy identity audit does only bounded, per-shop preflight and sanitizes results", () => {
  const source = readFileSync("scripts/shopify-legacy-identity-audit.ts", "utf8");
  const build = readFileSync("script/build.ts", "utf8");
  assert.match(source, /const MAX_SHOPS = 6/);
  assert.match(source, /args\[0\] !== "--audit"/);
  assert.match(source, /--shops=/);
  assert.match(source, /new Set\(shops\)\.size !== shops\.length/);
  assert.match(source, /EXCLUDED\.has\(shop\)/);
  assert.match(source, /RAILWAY_ENVIRONMENT_ID !== EXPECTED_ENVIRONMENT/);
  assert.match(source, /RAILWAY_SERVICE_ID !== EXPECTED_SERVICE/);
  assert.match(source, /MERCHANT_OPERATOR, "--preflight", "--shop=" \+ shop/);
  assert.match(source, /shell: false/);
  assert.match(source, /const results = shops\.map\(checkOne\)/);
  assert.match(source, /read_only_audit_complete/);
  assert.match(source, /converted: 0/);
  assert.match(source, /result\.error \|\| result\.signal/);
  assert.match(source, /status: "blocked", code: row\.code/);
  assert.doesNotMatch(source, /migrateAuthorizedLegacyInstallation|requestOfflinePair|--convert|--acknowledge-invalidate|\/api\//);
  assert.match(build, /dist\/shopify-legacy-identity-audit\.cjs/);
});
