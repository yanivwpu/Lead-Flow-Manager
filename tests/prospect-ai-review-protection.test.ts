/**
 * Prospect AI Review protection: stale writes, post-enrichment, dedupe, preserve success.
 * Run: npx tsx tests/prospect-ai-review-protection.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  claimableAnalysisStatuses,
  contactIdsCoveredByActiveBulkJobs,
} from "../shared/prospectAnalysisOwnership";
import {
  isProspectAiAttemptCurrent,
  isProspectAiReviewUsableSuccess,
  mergeProspectAiRefreshFailureRaw,
  resolveProspectAiFailurePersistAction,
  resolveProspectAiSuccessPersistAction,
  shouldEnqueueAiReviewAfterEnrichment,
  shouldOrphanRequeueFailedAnalysis,
} from "../shared/prospectAiReliability";

const root = process.cwd();

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (err) {
    console.error(`fail ${name}`);
    throw err;
  }
}

run("completed review is not automatically re-run after enrichment", () => {
  assert.equal(
    shouldEnqueueAiReviewAfterEnrichment({
      analysisStatus: "completed",
      rawResult: { leadScore: 80 },
    }),
    false,
  );
  assert.equal(
    shouldEnqueueAiReviewAfterEnrichment({
      analysisStatus: "needs_review",
      rawResult: {},
    }),
    false,
  );
  assert.equal(
    shouldEnqueueAiReviewAfterEnrichment({
      analysisStatus: "failed",
      rawResult: { aiReviewFailureKind: "timeout" },
    }),
    true,
  );
  assert.equal(
    shouldEnqueueAiReviewAfterEnrichment({ analysisStatus: "pending" }),
    true,
  );
  assert.equal(
    shouldEnqueueAiReviewAfterEnrichment({ analysisStatus: "processing" }),
    false,
  );
});

run("completed review requiring website intelligence may enqueue after enrichment", () => {
  assert.equal(
    shouldEnqueueAiReviewAfterEnrichment({
      analysisStatus: "completed",
      rawResult: { requiresWebsiteIntelligence: true, leadScore: 70 },
    }),
    true,
  );
});

run("successful AI Review → enrichment → failed refresh does not overwrite success", () => {
  const action = resolveProspectAiFailurePersistAction({
    currentStatus: "processing",
    currentAttemptId: "attempt-refresh",
    failingAttemptId: "attempt-refresh",
    backgroundRefresh: true,
    deliberateRerun: false,
    priorUsableStatus: "completed",
  });
  assert.equal(action, "preserve_success_record_refresh_failure");

  const preserved = mergeProspectAiRefreshFailureRaw(
    {
      leadScore: 88,
      reasoningSummary: "Strong fit",
      analysisAttemptId: "attempt-refresh",
      priorUsableStatus: "completed",
    },
    {
      message: "OpenAI API key is misconfigured: looks like a Resend key",
      kind: "configuration",
      at: "2026-08-03T17:30:00.000Z",
      attemptId: "attempt-refresh",
    },
  );
  assert.equal(preserved.leadScore, 88);
  assert.equal(preserved.reasoningSummary, "Strong fit");
  assert.ok(preserved.lastRefreshFailure);
  assert.equal(isProspectAiReviewUsableSuccess("completed"), true);
});

run("stale failed attempt cannot overwrite newer successful attempt", () => {
  assert.equal(
    isProspectAiAttemptCurrent({
      rowAttemptId: "attempt-new",
      persistAttemptId: "attempt-old",
    }),
    false,
  );
  assert.equal(
    resolveProspectAiFailurePersistAction({
      currentStatus: "completed",
      currentAttemptId: "attempt-new",
      failingAttemptId: "attempt-old",
    }),
    "ignore_stale",
  );
  assert.equal(
    resolveProspectAiFailurePersistAction({
      currentStatus: "processing",
      currentAttemptId: "attempt-new",
      failingAttemptId: "attempt-old",
    }),
    "ignore_stale",
  );
});

run("stale success cannot overwrite newer deliberate re-run", () => {
  assert.equal(
    resolveProspectAiSuccessPersistAction({
      currentStatus: "processing",
      currentAttemptId: "attempt-rerun",
      successAttemptId: "attempt-old-success",
    }),
    "ignore_stale",
  );
  assert.equal(
    resolveProspectAiSuccessPersistAction({
      currentStatus: "processing",
      currentAttemptId: "attempt-rerun",
      successAttemptId: "attempt-rerun",
    }),
    "persist_success",
  );
});

run("force alone cannot claim completed; deliberate/background can", () => {
  assert.deepEqual(claimableAnalysisStatuses(true), ["pending", "failed"]);
  assert.deepEqual(claimableAnalysisStatuses(false), ["pending", "failed"]);
  assert.ok(
    claimableAnalysisStatuses(true, { deliberateRerun: true }).includes("completed"),
  );
  assert.ok(
    claimableAnalysisStatuses(true, { backgroundRefresh: true }).includes("completed"),
  );
});

run("duplicate active review jobs are prevented via coverage set", () => {
  const covered = contactIdsCoveredByActiveBulkJobs([
    { status: "running", contactIds: ["a", "b"] },
    { status: "pending", contactIds: ["c"] },
    { status: "completed", contactIds: ["d"] },
  ]);
  assert.equal(covered.has("a"), true);
  assert.equal(covered.has("b"), true);
  assert.equal(covered.has("c"), true);
  assert.equal(covered.has("d"), false);
  const requested = ["a", "c", "e"];
  const enqueued = requested.filter((id) => !covered.has(id));
  assert.deepEqual(enqueued, ["e"]);
});

run("configuration failure is not orphan-requeued", () => {
  assert.equal(
    shouldOrphanRequeueFailedAnalysis({
      analysisStatus: "failed",
      errorMessage:
        "OpenAI API key is misconfigured: OPENAI_API_KEY looks like a Resend key (re_...).",
      rawResult: { aiReviewFailureKind: "configuration" },
    }),
    false,
  );
  assert.equal(
    shouldOrphanRequeueFailedAnalysis({
      analysisStatus: "completed",
      rawResult: { leadScore: 90 },
    }),
    false,
  );
});

run("deliberate re-run failure may mark failed; background refresh must preserve", () => {
  assert.equal(
    resolveProspectAiFailurePersistAction({
      currentStatus: "processing",
      currentAttemptId: "r1",
      failingAttemptId: "r1",
      deliberateRerun: true,
      priorUsableStatus: "completed",
    }),
    "mark_failed",
  );
  assert.equal(
    resolveProspectAiFailurePersistAction({
      currentStatus: "processing",
      currentAttemptId: "b1",
      failingAttemptId: "b1",
      backgroundRefresh: true,
      deliberateRerun: false,
      priorUsableStatus: "completed",
    }),
    "preserve_success_record_refresh_failure",
  );
});

run("wiring: enrichment does not inline force analyze; uses canonical enqueue", () => {
  const enrichSrc = readFileSync(
    join(root, "server/prospectImport/prospectEnrichmentService.ts"),
    "utf8",
  );
  assert.equal(enrichSrc.includes("analyzeProspectContact({ contactId: job.contactId, force: true })"), false);
  assert.equal(enrichSrc.includes('from "./prospectIntelligenceService"'), false);
  assert.ok(enrichSrc.includes("enqueueAiReviewAfterEnrichment"));

  const bulkSrc = readFileSync(
    join(root, "server/prospectImport/prospectBulkAnalysisService.ts"),
    "utf8",
  );
  assert.ok(bulkSrc.includes("enqueueBulkRetryAiReview"));
  assert.ok(bulkSrc.includes("enqueueBulkRerunAiReview"));
  assert.ok(bulkSrc.includes("enqueueAiReviewAfterEnrichment"));
  assert.ok(bulkSrc.includes("contactIdsCoveredByActiveBulkJobs"));

  const intelSrc = readFileSync(
    join(root, "server/prospectImport/prospectIntelligenceService.ts"),
    "utf8",
  );
  assert.ok(intelSrc.includes("resolveProspectAiFailurePersistAction"));
  assert.ok(intelSrc.includes("resolveProspectAiSuccessPersistAction"));
  assert.ok(intelSrc.includes("analysisAttemptId"));
  assert.ok(intelSrc.includes("deliberateRerun"));

  const routeSrc = readFileSync(join(root, "server/routes/prospectIntelligence.ts"), "utf8");
  assert.ok(routeSrc.includes("deliberateRerun"));

  const uiSrc = readFileSync(
    join(root, "client/src/components/settings/ProspectIntelligencePanel.tsx"),
    "utf8",
  );
  assert.ok(uiSrc.includes("pi-rerun-analysis"));
  assert.ok(uiSrc.includes("Re-run Analysis"));
  assert.ok(uiSrc.includes("pi-retry-review"));
  assert.ok(uiSrc.includes("Latest refresh failed; previous AI Review preserved."));
  assert.ok(uiSrc.includes("bulk-retry-ai-review"));
});

run("retry failed review and explicit re-run use canonical queue path", () => {
  const intelSrc = readFileSync(
    join(root, "server/prospectImport/prospectIntelligenceService.ts"),
    "utf8",
  );
  const start = intelSrc.indexOf("export async function reanalyzeProspectContact");
  const end = intelSrc.indexOf("export async function linkProspectPriorOutreachHistory", start);
  assert.ok(start >= 0 && end > start);
  const reanalyzeBlock = intelSrc.slice(start, end);
  assert.ok(reanalyzeBlock.includes("enqueueBulkRetryAiReview"));
  assert.ok(reanalyzeBlock.includes("enqueueBulkRerunAiReview"));
  assert.equal(reanalyzeBlock.includes("await analyzeProspectContact"), false);
  assert.ok(reanalyzeBlock.includes("deliberateRerun"));
});

console.log("prospect-ai-review-protection.test.ts: all assertions passed");
