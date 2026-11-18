import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('merchant operator can only run explicitly on one shop with exact acknowledgement', () => {
  const source = readFileSync('scripts/shopify-offline-merchant-operator.ts', 'utf8');
  const build = readFileSync('script/build.ts', 'utf8');
  assert.match(source, /RAILWAY_ENVIRONMENT_ID !== EXPECTED_ENVIRONMENT/);
  assert.match(source, /RAILWAY_SERVICE_ID !== EXPECTED_SERVICE/);
  assert.match(source, /args\.length === 2 && args\[0\] === "--preflight"/);
  assert.match(source, /args\.length === 3 && args\[0\] === "--convert"/);
  assert.match(source, /--acknowledge-invalidate-legacy-for=/);
  assert.match(source, /internal_store_excluded_from_merchant_rollout/);
  assert.match(source, /deletion_requested_at IS NULL/);
  assert.match(source, /previous_attempt_requires_manual_review/);
  assert.match(source, /outbound_processing_in_flight/);
  assert.match(source, /currentAppInstallation \{ app \{ apiKey \}/);
  assert.match(source, /migrateAuthorizedLegacyInstallation\(\{/);
  assert.doesNotMatch(source, /\/api\//);
  assert.match(build, /dist\/shopify-offline-merchant-operator\.cjs/);
});