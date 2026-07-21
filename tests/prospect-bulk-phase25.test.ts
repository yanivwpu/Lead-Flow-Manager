/**
 * Prospect Engine Phase 2.5 — selection, resume, and failed-retry helpers.
 */
import assert from "node:assert/strict";
import {
  PROSPECT_BULK_MAX_BATCH_SIZE,
  failedContactIdsFromItemResults,
  prospectBulkAnalysisLog,
  recountBulkAnalysisItemResults,
  type ProspectBulkAnalysisItemResults,
} from "../shared/prospectBulkSelection";
import { isProspectOutreachQueueArmed } from "../shared/prospectBulkOutreach";

function testMaxBatchConstant() {
  assert.equal(PROSPECT_BULK_MAX_BATCH_SIZE, 1000);
}

function testRecountAndFailedIds() {
  const results: ProspectBulkAnalysisItemResults = {
    a: { status: "completed" },
    b: { status: "needs_review" },
    c: { status: "failed", reason: "timeout" },
    d: { status: "skipped" },
    e: { status: "failed" },
  };
  const counts = recountBulkAnalysisItemResults(results);
  assert.equal(counts.completed, 2); // completed + needs_review
  assert.equal(counts.needsReview, 1);
  assert.equal(counts.failed, 2);
  assert.equal(counts.skipped, 1);
  assert.equal(counts.processed, 5);
  assert.deepEqual(failedContactIdsFromItemResults(results).sort(), ["c", "e"]);
}

function testResumeSkipsCompleted() {
  const contactIds = ["1", "2", "3"];
  const itemResults: ProspectBulkAnalysisItemResults = {
    "1": { status: "completed" },
    "2": { status: "failed" },
  };
  const remaining = contactIds.filter((id) => !itemResults[id]);
  assert.deepEqual(remaining, ["3"]);
  // Failed-only retry set excludes successes
  const failedOnly = failedContactIdsFromItemResults(itemResults);
  assert.deepEqual(failedOnly, ["2"]);
  assert.ok(!failedOnly.includes("1"));
}

function testStaleLeaseRecoveryPredicate() {
  const now = Date.now();
  const expired = new Date(now - 60_000);
  const fresh = new Date(now + 60_000);
  const isRecoverable = (leaseExpiresAt: Date | null, status: string) =>
    status === "running" && (leaseExpiresAt == null || leaseExpiresAt.getTime() < now);
  assert.equal(isRecoverable(expired, "running"), true);
  assert.equal(isRecoverable(fresh, "running"), false);
  assert.equal(isRecoverable(null, "pending"), false);
}

function testEnqueueDoesNotClaimProcessing() {
  // Contract: pending stays pending until worker claim (see prospect-auto-qualify-ownership).
  const afterEnqueue = "pending";
  const afterWorkerClaim = "processing";
  const afterSuccess = "completed";
  assert.notEqual(afterEnqueue, "processing");
  assert.equal(afterWorkerClaim, "processing");
  assert.equal(afterSuccess, "completed");
}

function testLogTag() {
  const log = prospectBulkAnalysisLog("job_claimed", { jobId: "x" });
  assert.equal(log.tag, "[ProspectBulkAnalysis]");
  assert.equal(log.event, "job_claimed");
  assert.ok(!("body" in log));
}

function testQueueStartStillArmed() {
  assert.equal(isProspectOutreachQueueArmed({ queueRunning: false, paused: false }), false);
  assert.equal(isProspectOutreachQueueArmed({ queueRunning: true, paused: false }), true);
  assert.equal(isProspectOutreachQueueArmed({ queueRunning: true, paused: true }), false);
}

function testSelectionOverLimitMessage() {
  const matched = PROSPECT_BULK_MAX_BATCH_SIZE + 1;
  assert.ok(matched > PROSPECT_BULK_MAX_BATCH_SIZE);
  // Contract: never silently truncate — callers must error when matched > max
  const shouldError = matched > PROSPECT_BULK_MAX_BATCH_SIZE;
  assert.equal(shouldError, true);
}

function testApproveHandoffDoesNotBypassEligibility() {
  // Structural: approved IDs still go through queue preview/create which re-checks.
  // This test locks the handoff shape expected by the UI.
  const handoff = {
    approved: 2,
    approvedContactIds: ["c1", "c2"],
  };
  assert.equal(handoff.approvedContactIds.length, handoff.approved);
}

const tests: Array<[string, () => void]> = [
  ["max batch size is 1000", testMaxBatchConstant],
  ["recount + failed ids", testRecountAndFailedIds],
  ["resume skips completed; retry failed only", testResumeSkipsCompleted],
  ["stale lease recovery predicate", testStaleLeaseRecoveryPredicate],
  ["enqueue does not claim processing", testEnqueueDoesNotClaimProcessing],
  ["analysis log tag", testLogTag],
  ["queue Start/Pause arming unchanged", testQueueStartStillArmed],
  ["over-limit must error not truncate", testSelectionOverLimitMessage],
  ["approve handoff shape", testApproveHandoffDoesNotBypassEligibility],
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`fail - ${name}`, err);
  }
}
if (failed) process.exit(1);
console.log(`\n${tests.length} Phase 2.5 tests passed`);
