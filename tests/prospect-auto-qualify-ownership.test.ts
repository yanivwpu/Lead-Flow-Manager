/**
 * Prospect AI automatic qualification ownership — stuck-processing regression.
 * Run: npx tsx tests/prospect-auto-qualify-ownership.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PROSPECT_ANALYSIS_STALE_PROCESSING_MS,
  PROSPECT_ANALYSIS_STALE_PROCESSING_SQL,
  PROSPECT_ORPHAN_PENDING_AGE_MS,
  canClaimAnalysisStatus,
  claimableAnalysisStatuses,
  contactOwnedByActiveBulkLease,
  isAnalysisAlreadyProcessing,
  isStaleProcessingTimestamp,
  simulateBulkQualifyAnalyzeLifecycle,
} from "../shared/prospectAnalysisOwnership";
import {
  recountBulkAnalysisItemResults,
  type ProspectBulkAnalysisItemResults,
} from "../shared/prospectBulkSelection";
import { resolveProspectReviewLifecycle } from "../shared/prospectReviewUx";
import { resolveAiPersonalityStatus } from "../shared/prospectAiPersonality";

function testCreateJobDoesNotPreMarkProcessing() {
  const src = readFileSync(
    join(process.cwd(), "server/prospectImport/prospectBulkAnalysisService.ts"),
    "utf8",
  );
  assert.ok(!/Immediate UI: Imported → Analyzing/.test(src));
  assert.ok(!/Failed to mark contacts processing/.test(src));
  assert.ok(!/Failed to mark merged contacts processing/.test(src));
  // Enqueue must not set processing on intelligence rows
  const createFn = src.slice(
    src.indexOf("export async function createBulkAnalysisJob"),
    src.indexOf("export async function claimNextBulkAnalysisJob"),
  );
  assert.ok(!/analysisStatus:\s*"processing"/.test(createFn));
  assert.ok(/do not pre-mark processing/i.test(createFn));
}

function testWorkerOwnsClaimAndClearsFailure() {
  const src = readFileSync(
    join(process.cwd(), "server/prospectImport/prospectBulkAnalysisService.ts"),
    "utf8",
  );
  assert.ok(/claimProspectContactForAnalysis/.test(src));
  assert.ok(/preClaimed:\s*true/.test(src));
  assert.ok(/markProspectAnalysisFailed/.test(src));
}

function testAnalyzerKeepsConcurrentGuard() {
  const src = readFileSync(
    join(process.cwd(), "server/prospectImport/prospectIntelligenceService.ts"),
    "utf8",
  );
  assert.ok(/Analysis already in progress for this contact/.test(src));
  assert.ok(/preClaimed\?:/.test(src));
  assert.ok(/claimProspectContactForAnalysis/.test(src));
  assert.ok(/healAbandonedProcessingAnalysis/.test(src));
}

function testOriginalBugReproduction() {
  const buggy = simulateBulkQualifyAnalyzeLifecycle({
    prematureMarkProcessing: true,
    workerClaimsBeforeAnalyze: false,
    clearProcessingOnFailure: false,
    analyzerRejectsProcessing: true,
    analyzerSucceeds: true,
  });
  assert.equal(buggy.statusAfterEnqueue, "processing");
  assert.equal(buggy.analyzerCalled, false);
  assert.equal(buggy.finalStatus, "processing");
  assert.equal(buggy.itemResultStatus, "failed");

  const fixed = simulateBulkQualifyAnalyzeLifecycle({
    prematureMarkProcessing: false,
    workerClaimsBeforeAnalyze: true,
    clearProcessingOnFailure: true,
    analyzerRejectsProcessing: true,
    analyzerSucceeds: true,
  });
  assert.equal(fixed.statusAfterEnqueue, "pending");
  assert.equal(fixed.analyzerCalled, true);
  assert.equal(fixed.finalStatus, "completed");
  assert.equal(fixed.itemResultStatus, "completed");
}

function testWorkerClaimThenComplete() {
  assert.deepEqual(claimableAnalysisStatuses(false), ["pending", "failed"]);
  assert.equal(canClaimAnalysisStatus("pending", false), true);
  assert.equal(canClaimAnalysisStatus("failed", false), true);
  assert.equal(canClaimAnalysisStatus("processing", false), false);
  assert.equal(canClaimAnalysisStatus("completed", false), false);
  assert.equal(canClaimAnalysisStatus("completed", true), true);

  const flow = simulateBulkQualifyAnalyzeLifecycle({
    prematureMarkProcessing: false,
    workerClaimsBeforeAnalyze: true,
    clearProcessingOnFailure: true,
    analyzerRejectsProcessing: true,
    analyzerSucceeds: true,
  });
  assert.equal(flow.finalStatus, "completed");
}

function testWorkerFailureClearsProcessing() {
  const flow = simulateBulkQualifyAnalyzeLifecycle({
    prematureMarkProcessing: false,
    workerClaimsBeforeAnalyze: true,
    clearProcessingOnFailure: true,
    analyzerRejectsProcessing: true,
    analyzerSucceeds: false,
  });
  assert.equal(flow.analyzerCalled, true);
  assert.equal(flow.finalStatus, "failed");
  assert.equal(flow.itemResultStatus, "failed");
}

function testConcurrentSecondClaimRejected() {
  assert.equal(isAnalysisAlreadyProcessing("processing"), true);
  assert.equal(canClaimAnalysisStatus("processing", false), false);
  assert.equal(canClaimAnalysisStatus("processing", true), false);
}

function testFailedRetryLifecycle() {
  // failed → claimable → processing → completed
  assert.equal(canClaimAnalysisStatus("failed", false), true);
  const retry = simulateBulkQualifyAnalyzeLifecycle({
    prematureMarkProcessing: false,
    workerClaimsBeforeAnalyze: true,
    clearProcessingOnFailure: true,
    analyzerRejectsProcessing: true,
    analyzerSucceeds: true,
  });
  // Start from failed by claiming: canClaim(failed) then worker marks processing
  assert.equal(canClaimAnalysisStatus("failed", true), true);
  assert.equal(retry.finalStatus, "completed");
}

function testCompletedSkippedWithoutRegression() {
  assert.equal(canClaimAnalysisStatus("completed", false), false);
  const life = resolveProspectReviewLifecycle({
    analysisStatus: "completed",
    reviewStatus: "pending",
  });
  assert.equal(life, "ready_for_approval");
}

function testMixedBulkCounters() {
  const results: ProspectBulkAnalysisItemResults = {
    a: { status: "completed" },
    b: { status: "failed", reason: "timeout" },
    c: { status: "needs_review" },
    d: { status: "skipped", reason: "already_contacted" },
  };
  const counts = recountBulkAnalysisItemResults(results);
  assert.equal(counts.completed, 2);
  assert.equal(counts.failed, 1);
  assert.equal(counts.skipped, 1);
  assert.equal(counts.needsReview, 1);
  assert.equal(counts.processed, 4);
  assert.ok(counts.failed > 0);
}

function testUiNoLongerIndefiniteProcessingOnFailure() {
  assert.equal(
    resolveProspectReviewLifecycle({ analysisStatus: "failed" }),
    "imported",
  );
  const personality = resolveAiPersonalityStatus({
    ux: { analysisStatus: "failed", reviewStatus: "pending" },
    seed: "x",
  });
  assert.equal(personality.active, false);
  assert.match(personality.message, /failed|retry/i);

  const pending = resolveAiPersonalityStatus({
    ux: { analysisStatus: "pending", reviewStatus: "pending" },
    seed: "y",
  });
  assert.match(pending.message, /Queued for AI/i);
  assert.equal(pending.active, false);

  const processing = resolveProspectReviewLifecycle({ analysisStatus: "processing" });
  assert.equal(processing, "analyzing");
}

function testStaleHealOwnership() {
  const now = new Date("2026-07-21T12:00:00.000Z");
  assert.ok(PROSPECT_ANALYSIS_STALE_PROCESSING_MS >= 10 * 60 * 1000 - 1000);
  assert.equal(
    isStaleProcessingTimestamp(new Date(now.getTime() - 11 * 60_000), now),
    true,
  );
  assert.equal(
    isStaleProcessingTimestamp(new Date(now.getTime() - 60_000), now),
    false,
  );

  const owned = contactOwnedByActiveBulkLease({
    contactId: "c1",
    now,
    activeJobs: [
      {
        status: "running",
        leaseExpiresAt: new Date(now.getTime() + 60_000),
        contactIds: ["c1", "c2"],
      },
    ],
  });
  assert.equal(owned, true);

  const notOwned = contactOwnedByActiveBulkLease({
    contactId: "c9",
    now,
    activeJobs: [
      {
        status: "running",
        leaseExpiresAt: new Date(now.getTime() + 60_000),
        contactIds: ["c1"],
      },
    ],
  });
  assert.equal(notOwned, false);

  const expiredLease = contactOwnedByActiveBulkLease({
    contactId: "c1",
    now,
    activeJobs: [
      {
        status: "running",
        leaseExpiresAt: new Date(now.getTime() - 1000),
        contactIds: ["c1"],
      },
    ],
  });
  assert.equal(expiredLease, false);

  assert.ok(PROSPECT_ANALYSIS_STALE_PROCESSING_SQL.includes("analysis_status = 'processing'"));
}

function testOrphanSqlDiagnosticsDocumented() {
  assert.ok(PROSPECT_ORPHAN_PENDING_AGE_MS === 2 * 60_000);
}

function testWorkerCallsHeal() {
  const src = readFileSync(
    join(process.cwd(), "server/prospectImport/prospectBulkAnalysisWorker.ts"),
    "utf8",
  );
  assert.ok(/healAbandonedProcessingAnalysis/.test(src));
}

function testPanelDoesNotShowWorkingForPending() {
  const src = readFileSync(
    join(process.cwd(), "client/src/components/settings/ProspectIntelligencePanel.tsx"),
    "utf8",
  );
  assert.ok(src.includes("Queued for AI…"));
  assert.ok(src.includes("{analyzing ? ("));
  assert.ok(src.includes("waitingAnalyze ? ("));
  // Must not collapse pending+processing into one "AI is working" branch
  assert.ok(!src.includes("analyzing || waitingAnalyze"));
}

const tests: Array<[string, () => void]> = [
  ["createBulkAnalysisJob does not mark processing", testCreateJobDoesNotPreMarkProcessing],
  ["worker claims + clears failure on catch", testWorkerOwnsClaimAndClearsFailure],
  ["analyzer keeps concurrent guard + preClaimed", testAnalyzerKeepsConcurrentGuard],
  ["original stuck-processing bug vs fix", testOriginalBugReproduction],
  ["worker claim → completed", testWorkerClaimThenComplete],
  ["worker failure → failed not processing", testWorkerFailureClearsProcessing],
  ["concurrent second claim rejected", testConcurrentSecondClaimRejected],
  ["failed rows retryable", testFailedRetryLifecycle],
  ["completed contacts skip without regression", testCompletedSkippedWithoutRegression],
  ["bulk counters mixed success/failure", testMixedBulkCounters],
  ["UI/API failed not indefinitely processing", testUiNoLongerIndefiniteProcessingOnFailure],
  ["stale heal ownership predicates", testStaleHealOwnership],
  ["orphan age constant", testOrphanSqlDiagnosticsDocumented],
  ["worker tick heals abandoned processing", testWorkerCallsHeal],
  ["panel pending ≠ AI is working", testPanelDoesNotShowWorkingForPending],
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
console.log(`\n${tests.length} prospect auto-qualify ownership tests passed`);
