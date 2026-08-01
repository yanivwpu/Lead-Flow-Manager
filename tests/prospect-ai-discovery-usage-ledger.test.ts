/**
 * Immutable discovery usage ledger contract.
 * Run: npx tsx tests/prospect-ai-discovery-usage-ledger.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const serviceSrc = readFileSync(
  join(import.meta.dirname, "..", "server/prospectAI/prospectAIService.ts"),
  "utf8",
);
const schemaSrc = readFileSync(join(import.meta.dirname, "..", "shared/schema.ts"), "utf8");
const migrationSrc = readFileSync(
  join(import.meta.dirname, "..", "migrations/0071_prospect_ai_discovery_usage_ledger.sql"),
  "utf8",
);

assert.ok(schemaSrc.includes("prospectAiDiscoveryUsageEvents"));
assert.ok(migrationSrc.includes("prospect_ai_discovery_usage_events"));
assert.ok(migrationSrc.includes("'backfill'"));
assert.ok(serviceSrc.includes("recordDiscoveryUsageEventsForResults"));
assert.ok(serviceSrc.includes("recordDiscoveryUsageAdjustment"));
assert.ok(serviceSrc.includes("resolveDiscoveryQuotaPeriodStart"));
assert.ok(serviceSrc.includes("prospectAiDiscoveryUsageEvents"));
assert.ok(serviceSrc.includes("units: 1"));
assert.ok(serviceSrc.includes("resultIds: inserted.map"));
assert.ok(serviceSrc.includes('reason: "discover"'));
// Send-to-review must not consume/refund quota.
assert.ok(serviceSrc.includes("requireQuota: false"));
assert.ok(serviceSrc.includes("sentToReviewAt"));
assert.ok(
  !/async function sendDiscoverResultsToReview[\s\S]{0,3500}?recordDiscoveryUsage/.test(
    serviceSrc,
  ),
  "send-to-review must not write usage ledger events",
);

const startupSrc = readFileSync(
  join(import.meta.dirname, "..", "server/startupSchemaPatches.ts"),
  "utf8",
);
assert.ok(
  startupSrc.includes("0071_prospect_ai_discovery_usage_ledger"),
  "0071 must run via Railway startup schema patches",
);
assert.ok(startupSrc.includes("prospect_ai_discovery_usage_events"));

console.log("prospect-ai-discovery-usage-ledger.test.ts: ok");
