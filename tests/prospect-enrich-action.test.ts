/**
 * Prospect Enrich action ordering — snapshot before clear.
 * Run: npx tsx tests/prospect-enrich-action.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertEnrichIdsNonEmpty,
  buildBulkApproveRequestBody,
  formatEnrichmentStartedMessage,
  planEnrichActionUi,
  snapshotEnrichContactIds,
} from "../shared/prospectEnrichAction";

const root = join(import.meta.dirname, "..");

{
  // Selected IDs are snapshotted before any selection clear
  const live = new Set(["a", "b"]);
  const idsToEnrich = snapshotEnrichContactIds(live);
  live.clear(); // simulates clearSelection()
  assert.deepEqual(idsToEnrich, ["a", "b"]);
  assert.equal(live.size, 0);
}

{
  // API body is built from snapshot — not from emptied live selection
  const live = new Set(["c1"]);
  const idsToEnrich = snapshotEnrichContactIds(live);
  live.clear();
  const body = buildBulkApproveRequestBody(idsToEnrich);
  assert.deepEqual(body, { contactIds: ["c1"] });
  assert.deepEqual(buildBulkApproveRequestBody(snapshotEnrichContactIds(live)), {
    contactIds: [],
  });
}

{
  assert.throws(() => assertEnrichIdsNonEmpty([]), /No prospects selected/);
  assert.doesNotThrow(() => assertEnrichIdsNonEmpty(["x"]));
}

{
  // Selection cleared only after successful start; failure preserves selection
  const ok = planEnrichActionUi("success");
  assert.equal(ok.clearSelection, true);
  assert.equal(ok.patchRowsToEnriching, true);
  assert.equal(ok.switchToEnrichingFilter, false);
  assert.equal(ok.preserveSelection, false);

  const fail = planEnrichActionUi("failure");
  assert.equal(fail.clearSelection, false);
  assert.equal(fail.patchRowsToEnriching, false);
  assert.equal(fail.switchToEnrichingFilter, false);
  assert.equal(fail.preserveSelection, true);
}

{
  // Successful start must not force navigation to Enriching
  assert.equal(planEnrichActionUi("success").switchToEnrichingFilter, false);
  assert.equal(planEnrichActionUi("failure").switchToEnrichingFilter, false);
}

assert.equal(formatEnrichmentStartedMessage(1), "Enrichment started for 1 prospect.");
assert.equal(formatEnrichmentStartedMessage(3), "Enrichment started for 3 prospects.");

const panelSrc = readFileSync(
  join(root, "client/src/components/settings/ProspectIntelligencePanel.tsx"),
  "utf8",
);
// Toolbar and detail use the same handler
assert.ok(panelSrc.includes("startProspectEnrichment"));
assert.ok(panelSrc.includes("onStartEnrichment={startProspectEnrichment}"));
assert.ok(panelSrc.includes("onStartEnrichment([item.contactId]"));
assert.ok(panelSrc.includes("snapshotEnrichContactIds(effectiveSelectedIds)"));
assert.ok(panelSrc.includes("buildBulkApproveRequestBody(idsToEnrich)"));
assert.ok(!panelSrc.includes('setWorkFilter("enriching")'));
assert.ok(panelSrc.includes('planEnrichActionUi(succeeded > 0 ? "success" : "failure")'));
assert.ok(panelSrc.includes("formatEnrichmentStartedMessage"));
// Must not clear selection inside onMutate before the request
assert.ok(!/onMutate:\s*\(\)\s*=>\s*\{[\s\S]*?clearSelection\(\)/.test(panelSrc));
assert.ok(!panelSrc.includes('setWorkFilter("enriching")'));
const queueSrc = readFileSync(
  join(root, "server/prospectImport/prospectOutreachQueueService.ts"),
  "utf8",
);
// Needs Review must not be skipped by bulk-approve (Enrich is the approval)
assert.ok(queueSrc.includes("Needs Review is enrichable"));
assert.ok(!queueSrc.includes('skipped.push({ contactId, reason: "needs_review" })'));

console.log("prospect-enrich-action.test.ts: all assertions passed");
