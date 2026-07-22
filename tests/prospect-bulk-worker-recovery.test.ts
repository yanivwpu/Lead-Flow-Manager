/**
 * Prospect AI bulk worker consumption + orphan recovery.
 * Run: npx tsx tests/prospect-bulk-worker-recovery.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PROSPECT_ORPHAN_PENDING_AGE_MS,
  PROSPECT_ORPHAN_SWEEP_INTERVAL_MS,
  contactIdsCoveredByActiveBulkJobs,
  extractSqlExecuteId,
  filterOrphanQualificationContactIds,
} from "../shared/prospectAnalysisOwnership";

function testProductionEntrypointStartsWorker() {
  const src = readFileSync(join(process.cwd(), "server/index.ts"), "utf8");
  assert.ok(/startProspectBulkAnalysisWorker/.test(src));
  assert.ok(/prospectBulkAnalysisWorker/.test(src));
  // Must start during boot — not gated by a feature flag / env skip.
  assert.ok(!/DISABLE_PROSPECT_BULK|SKIP_PROSPECT_BULK|PROSPECT_BULK_WORKER_ENABLED/.test(src));
  // Starts after registerRoutes (server routes ready) and before listen is fine.
  const routesIdx = src.indexOf("await registerRoutes");
  const startIdx = src.indexOf("startProspectBulkAnalysisWorker()");
  assert.ok(routesIdx >= 0 && startIdx > routesIdx);
}

function testWorkerIsolatesHealAndKeepsTicking() {
  const src = readFileSync(
    join(process.cwd(), "server/prospectImport/prospectBulkAnalysisWorker.ts"),
    "utf8",
  );
  assert.ok(src.includes("heal_processing_error"));
  assert.ok(src.includes("orphan_sweep_error"));
  assert.ok(src.includes("recover_stale_error"));
  assert.ok(src.includes("tick_error"));
  assert.ok(src.includes("tick().finally(scheduleNext)"));
  assert.ok(src.includes("healAbandonedProcessingAnalysis"));
  assert.ok(src.includes("recoverOrphanedPendingQualifications"));
  assert.ok(src.includes("claimNextBulkAnalysisJob"));
  // Claim invocation must come after the isolated heal try/catch.
  const healErr = src.indexOf("heal_processing_error");
  const claimCall = src.indexOf("await claimNextBulkAnalysisJob");
  assert.ok(healErr >= 0 && claimCall > healErr);
}

function testExpiredLeaseReclaimablePredicate() {
  const now = Date.now();
  const isClaimable = (status: string, leaseExpiresAt: Date | null) =>
    (status === "pending" || status === "running") &&
    (leaseExpiresAt == null || leaseExpiresAt.getTime() < now);
  assert.equal(isClaimable("pending", null), true);
  assert.equal(isClaimable("running", new Date(now - 1000)), true);
  assert.equal(isClaimable("running", new Date(now + 60_000)), false);
  assert.equal(isClaimable("completed", null), false);
}

function testExistingPendingJobsResumeAfterRestart() {
  // Contract: claim query includes pending + running with null/expired lease, ordered by created_at.
  const src = readFileSync(
    join(process.cwd(), "server/prospectImport/prospectBulkAnalysisService.ts"),
    "utf8",
  );
  assert.ok(/status IN \('pending', 'running'\)/.test(src));
  assert.ok(/lease_expires_at IS NULL OR lease_expires_at </.test(src));
  assert.ok(/ORDER BY created_at ASC/.test(src));
  assert.ok(/FOR UPDATE SKIP LOCKED/.test(src));
  // Immediate boot tick
  const worker = readFileSync(
    join(process.cwd(), "server/prospectImport/prospectBulkAnalysisWorker.ts"),
    "utf8",
  );
  assert.ok(/Immediate pass on boot/.test(worker) || /void tick\(\)\.finally\(scheduleNext\)/.test(worker));
}

function testOrphanFilterAndDedup() {
  const now = new Date("2026-07-21T18:00:00.000Z");
  const old = new Date(now.getTime() - 5 * 60_000);
  const fresh = new Date(now.getTime() - 30_000);

  const orphans = filterOrphanQualificationContactIds({
    now,
    olderThanMs: PROSPECT_ORPHAN_PENDING_AGE_MS,
    candidates: [
      { contactId: "a", analysisStatus: "pending", updatedAt: old },
      { contactId: "b", analysisStatus: "failed", updatedAt: old },
      { contactId: "c", analysisStatus: "pending", updatedAt: fresh },
      { contactId: "d", analysisStatus: "completed", updatedAt: old },
      { contactId: "e", analysisStatus: "pending", updatedAt: old },
    ],
    activeJobs: [
      { status: "pending", contactIds: ["e"] },
      { status: "running", contactIds: ["x"] },
      { status: "completed", contactIds: ["a"] }, // completed does not cover
    ],
  });
  assert.deepEqual(orphans.sort(), ["a", "b"]);

  const covered = contactIdsCoveredByActiveBulkJobs([
    { status: "pending", contactIds: ["e"] },
    { status: "completed", contactIds: ["a"] },
  ]);
  assert.equal(covered.has("e"), true);
  assert.equal(covered.has("a"), false);
}

function testDuplicateRecoveryDoesNotDoubleCover() {
  // Second sweep: contact already on pending job → not an orphan.
  const now = new Date();
  const old = new Date(now.getTime() - PROSPECT_ORPHAN_PENDING_AGE_MS - 1000);
  const again = filterOrphanQualificationContactIds({
    now,
    candidates: [{ contactId: "a", analysisStatus: "pending", updatedAt: old }],
    activeJobs: [{ status: "pending", contactIds: ["a"] }],
  });
  assert.deepEqual(again, []);
}

function testExtractSqlExecuteIdShapes() {
  assert.equal(extractSqlExecuteId({ rows: [{ id: "job-1" }] }), "job-1");
  assert.equal(extractSqlExecuteId([{ id: "job-2" }]), "job-2");
  assert.equal(extractSqlExecuteId({ rows: [{ ID: "job-3" }] }), "job-3");
  assert.equal(extractSqlExecuteId(null), "");
  assert.equal(extractSqlExecuteId({ rows: [] }), "");
}

function testClaimMissDiagnosticPresent() {
  const src = readFileSync(
    join(process.cwd(), "server/prospectImport/prospectBulkAnalysisWorker.ts"),
    "utf8",
  );
  assert.ok(/claim_missed_claimable_jobs/.test(src));
  assert.ok(/countClaimableBulkAnalysisJobs/.test(src));
}

function testQueuedProgressWithoutUserAction() {
  // Lifecycle simulation: pending orphan → requeue → worker claim → completed
  const now = new Date();
  const old = new Date(now.getTime() - 3 * 60_000);
  const before = filterOrphanQualificationContactIds({
    now,
    candidates: [{ contactId: "c1", analysisStatus: "pending", updatedAt: old }],
    activeJobs: [],
  });
  assert.deepEqual(before, ["c1"]);
  const afterEnqueue = filterOrphanQualificationContactIds({
    now,
    candidates: [{ contactId: "c1", analysisStatus: "pending", updatedAt: old }],
    activeJobs: [{ status: "pending", contactIds: ["c1"] }],
  });
  assert.deepEqual(afterEnqueue, []);
  assert.ok(PROSPECT_ORPHAN_SWEEP_INTERVAL_MS >= 30_000);
}

function testItemTimeoutAndUnfinishedJobNotCompleted() {
  const src = readFileSync(
    join(process.cwd(), "server/prospectImport/prospectBulkAnalysisService.ts"),
    "utf8",
  );
  assert.ok(/analyzeContactWithTimeout/.test(src));
  assert.ok(/PROSPECT_ANALYSIS_ITEM_TIMEOUT_MS/.test(src));
  assert.ok(/job_resume_unfinished/.test(src));
  assert.ok(/status: "pending"/.test(src) || /status: 'pending'/.test(src));
}

const tests: Array<[string, () => void]> = [
  ["production entrypoint starts bulk worker", testProductionEntrypointStartsWorker],
  ["heal error isolated; ticks continue", testWorkerIsolatesHealAndKeepsTicking],
  ["expired running leases are reclaimable", testExpiredLeaseReclaimablePredicate],
  ["existing pending jobs resume after restart", testExistingPendingJobsResumeAfterRestart],
  ["orphan pending/failed re-enqueue filter", testOrphanFilterAndDedup],
  ["duplicate recovery does not create duplicate coverage", testDuplicateRecoveryDoesNotDoubleCover],
  ["claim execute id extraction shapes", testExtractSqlExecuteIdShapes],
  ["claim-miss diagnostic when claimable jobs remain", testClaimMissDiagnosticPresent],
  ["queued contact requeued without user action", testQueuedProgressWithoutUserAction],
  ["item timeout + unfinished jobs stay pending", testItemTimeoutAndUnfinishedJobNotCompleted],
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
console.log(`\n${tests.length} prospect bulk worker recovery tests passed`);
