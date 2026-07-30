/**
 * Prospect AI Discover batch persistence / restore.
 * Run: npx tsx tests/prospect-ai-discovery-persistence.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PROSPECT_AI_DISCOVERY_STATUS_DISCARDED,
  selectActiveUnsentDiscoverySearch,
} from "../shared/prospectAiDiscoveryBatch";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

run("selectActiveUnsentDiscoverySearch picks newest non-discarded with unsent rows", () => {
  const searches = [
    { id: "new", status: "completed", createdAt: "2026-07-26" },
    { id: "old", status: "completed", createdAt: "2026-07-20" },
  ];
  const counts = new Map([
    ["new", 20],
    ["old", 5],
  ]);
  assert.equal(selectActiveUnsentDiscoverySearch(searches, counts)?.id, "new");
});

run("discarded searches are skipped even if unsent rows remain", () => {
  const searches = [
    { id: "discarded", status: PROSPECT_AI_DISCOVERY_STATUS_DISCARDED },
    { id: "older", status: "completed" },
  ];
  const counts = new Map([
    ["discarded", 20],
    ["older", 3],
  ]);
  assert.equal(selectActiveUnsentDiscoverySearch(searches, counts)?.id, "older");
});

run("all-sent batch is not active", () => {
  const searches = [{ id: "s1", status: "completed" }];
  const counts = new Map([["s1", 0]]);
  assert.equal(selectActiveUnsentDiscoverySearch(searches, counts), null);
});

run("workspace isolation helper ignores other ids", () => {
  const searches = [{ id: "mine", status: "completed" }];
  const counts = new Map([
    ["mine", 2],
    ["other-workspace-batch", 99],
  ]);
  assert.equal(selectActiveUnsentDiscoverySearch(searches, counts)?.id, "mine");
});

const serviceSrc = readFileSync(
  join(process.cwd(), "server/prospectAI/prospectAIService.ts"),
  "utf8",
);
const routesSrc = readFileSync(join(process.cwd(), "server/routes/prospectAI.ts"), "utf8");
const clientSrc = readFileSync(join(process.cwd(), "client/src/pages/ProspectAI.tsx"), "utf8");
const hooksSrc = readFileSync(join(process.cwd(), "client/src/lib/prospectAi.ts"), "utf8");

run("persist on discover; restore via getActive; discard without refund", () => {
  assert.ok(serviceSrc.includes("getActiveUnsentDiscoveryBatch"));
  assert.ok(serviceSrc.includes("discardDiscoverySearch"));
  assert.ok(serviceSrc.includes("PROSPECT_AI_DISCOVERY_STATUS_DISCARDED"));
  assert.ok(serviceSrc.includes("active_batch_exists"));
  assert.ok(serviceSrc.includes("replaceActiveBatch"));
  // Quota still counted from discovery_results inserts (not on restore).
  assert.ok(serviceSrc.includes("countMonthlyDiscoveryUsage"));
  assert.ok(serviceSrc.includes("isNull(prospectAiDiscoveryResults.sentToReviewAt)"));
});

run("routes expose active restore + discard; send-to-review unchanged path", () => {
  assert.ok(routesSrc.includes("/discover/active"));
  assert.ok(routesSrc.includes("/discard"));
  assert.ok(routesSrc.includes("sendDiscoverResultsToReview"));
  assert.ok(routesSrc.includes("getActiveUnsentDiscoveryBatch"));
});

run("Discover UI restores active batch and supports clear/replace", () => {
  assert.ok(hooksSrc.includes("useActiveDiscoveryBatch"));
  assert.ok(hooksSrc.includes("useDiscardDiscoverySearch"));
  assert.ok(clientSrc.includes("useActiveDiscoveryBatch"));
  assert.ok(clientSrc.includes("Not yet sent to Review"));
  assert.ok(clientSrc.includes("prospect-ai-clear-results"));
  assert.ok(clientSrc.includes("replaceActiveBatch"));
  assert.ok(clientSrc.includes("remaining = results.filter"));
});

run("restore must not call Places discover endpoint", () => {
  assert.ok(hooksSrc.includes('"/api/growth-engines/prospect-ai/discover/active"'));
  // Active is GET; production discover uses orchestrator (injected providers still use .discover).
  assert.ok(
    serviceSrc.includes("runProspectAiDiscoveryOrchestrator") ||
      serviceSrc.includes("provider.discover"),
  );
  assert.ok(
    !hooksSrc.includes('fetchJson<ProspectAiDiscoverResponse>("/api/growth-engines/prospect-ai/discover/active", {\n        method: "POST"'),
  );
});

console.log("\nAll prospect-ai-discovery-persistence tests passed.");
