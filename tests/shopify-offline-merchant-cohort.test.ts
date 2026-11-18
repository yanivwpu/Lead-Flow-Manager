import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("merchant cohort CLI is explicit, capped, read-only by default and serial", () => {
  const src = readFileSync("scripts/shopify-offline-merchant-cohort.ts", "utf8");
  const build = readFileSync("script/build.ts", "utf8");
  assert.match(src, /RAILWAY_ENVIRONMENT_ID !== EXPECTED_ENVIRONMENT/);
  assert.match(src, /RAILWAY_SERVICE_ID !== EXPECTED_SERVICE/);
  assert.match(src, /const MAX_COHORT = 3/);
  assert.match(src, /--preflight/);
  assert.match(src, /--convert/);
  assert.match(src, /--acknowledge-invalidate-legacy-for=/);
  assert.match(src, /new Set\(shops\)\.size === shops\.length/);
  assert.match(src, /!INTERNAL\.has\(shop\)/);
  assert.match(src, /shops\.every/);
  assert.match(src, /shell: false/);
  assert.match(src, /result\.error \|\| result\.status !== 0 \|\| result\.signal/);
  assert.match(src, /for \(const shop of shops\) \{\s*currentShop = shop;\s*if \(runOne\(shop, "--preflight"\)/);
  assert.match(src, /if \(mode === "--preflight"\)/);
  assert.match(src, /for \(const shop of shops\) \{\s*currentShop = shop;\s*\/\/ Single-store operator/);
  assert.match(src, /runOne\(shop, "--convert"\)/);
  assert.match(src, /converted_pair_stored/);
  assert.match(src, /encryptedPairPresent/);
  assert.match(src, /process\.exitCode = 1/);
  assert.doesNotMatch(src, /migrateAuthorizedLegacyInstallation|requestOfflinePair|\/api\//);
  assert.match(build, /dist\/shopify-offline-merchant-cohort\.cjs/);
});
