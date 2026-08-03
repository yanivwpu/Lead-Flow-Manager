/**
 * Bulk Retry AI Review + orphan config skip + Retrying UX wiring.
 * Run: npx tsx tests/prospect-ai-review-bulk-retry.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyProspectAiReviewFailure,
  describeOpenAiKeyRuntimeDiagnostics,
  detectForeignProspectAiDeployment,
  shouldOrphanRequeueFailedAnalysis,
  shouldStartProspectAiBulkWorker,
} from "../shared/prospectAiReliability";
import {
  PROSPECT_PROGRESS_STATE_LABELS,
  resolveProspectProgressState,
} from "../shared/prospectAiReviewErrors";

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

run("orphan requeue skips configuration and missing_data failures", () => {
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
      analysisStatus: "failed",
      errorMessage: "Not enough business details for AI Review yet.",
      rawResult: { aiReviewFailureKind: "missing_data" },
    }),
    false,
  );
  assert.equal(
    shouldOrphanRequeueFailedAnalysis({
      analysisStatus: "failed",
      errorMessage: "Analysis timed out after 90000ms",
      rawResult: { aiReviewFailureKind: "timeout", autoRetryable: true },
    }),
    true,
  );
  assert.equal(
    shouldOrphanRequeueFailedAnalysis({ analysisStatus: "pending" }),
    true,
  );
  assert.equal(
    shouldOrphanRequeueFailedAnalysis({ analysisStatus: "completed" }),
    false,
  );
});

run("classify Resend miswire as configuration non-auto-retryable", () => {
  const c = classifyProspectAiReviewFailure(
    new Error(
      "OpenAI API key is misconfigured: OPENAI_API_KEY looks like a Resend key (re_...).",
    ),
  );
  assert.equal(c.kind, "configuration");
  assert.equal(c.autoRetryable, false);
  assert.equal(c.userRetryable, true);
});

run("progress state exposes Retrying for in-flight AI retry", () => {
  assert.equal(PROSPECT_PROGRESS_STATE_LABELS.retrying, "Retrying");
  const retrying = resolveProspectProgressState({
    analysisStatus: "processing",
    aiReviewRetrying: true,
  });
  assert.equal(retrying.code, "retrying");
  assert.equal(retrying.label, "Retrying");
  const reviewing = resolveProspectProgressState({
    analysisStatus: "processing",
    aiReviewRetrying: false,
  });
  assert.equal(reviewing.code, "reviewing");
});

run("safe OpenAI key diagnostics never include secret material", () => {
  const diag = describeOpenAiKeyRuntimeDiagnostics({
    OPENAI_API_KEY: "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789",
    RESEND_API_KEY: "re_eX7RFabcdefghijhhAF",
    RAILWAY_SERVICE_NAME: "Lead-Flow-Manager",
    RAILWAY_DEPLOYMENT_ID: "dep-123",
    RAILWAY_PROJECT_NAME: "luminous-transformation",
    RAILWAY_PROJECT_ID: "proj-1",
  } as NodeJS.ProcessEnv);
  const sampleKey = "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789";
  assert.equal(diag.ok, true);
  assert.equal(diag.selectedSource, "OPENAI_API_KEY");
  assert.equal(diag.prefixClass, "sk-");
  assert.equal(diag.resendKeyPrefixClass, "re_");
  assert.equal(diag.keyLength, sampleKey.length);
  assert.equal(diag.railwayServiceName, "Lead-Flow-Manager");
  assert.equal(diag.railwayProjectName, "luminous-transformation");
  const json = JSON.stringify(diag);
  assert.equal(json.includes(sampleKey), false);
  assert.equal(json.includes("re_eX7RFabcdefghijhhAF"), false);

  const bad = describeOpenAiKeyRuntimeDiagnostics({
    OPENAI_API_KEY: "re_eX7RFabcdefghijhhAF",
  } as NodeJS.ProcessEnv);
  assert.equal(bad.ok, false);
  assert.equal(bad.prefixClass, "re_");
  assert.equal(bad.selectedSource, "invalid");
  assert.equal(shouldStartProspectAiBulkWorker(bad).start, false);

  const missing = describeOpenAiKeyRuntimeDiagnostics({} as NodeJS.ProcessEnv);
  assert.equal(shouldStartProspectAiBulkWorker(missing).start, false);
  assert.equal(shouldStartProspectAiBulkWorker(diag).start, true);

  const foreign = detectForeignProspectAiDeployment({
    currentDeploymentId: "dep-good",
    recentDeploymentIds: ["dep-good", "dep-rogue", null, "dep-rogue"],
  });
  assert.equal(foreign.foreignDetected, true);
  assert.deepEqual(foreign.foreignDeploymentIds, ["dep-rogue"]);
});

run("bulk retry API + service + UI wired", () => {
  const routes = readFileSync(
    join(root, "server/routes/prospectBulkOutreach.ts"),
    "utf8",
  );
  assert.ok(routes.includes("bulk-retry-ai-review"));
  assert.ok(routes.includes("enqueueBulkRetryAiReview"));

  const service = readFileSync(
    join(root, "server/prospectImport/prospectBulkAnalysisService.ts"),
    "utf8",
  );
  assert.ok(service.includes("enqueueBulkRetryAiReview"));
  assert.ok(service.includes("resetFailedAnalysisToPendingForRetry"));
  assert.ok(service.includes("shouldOrphanRequeueFailedAnalysis"));
  assert.ok(service.includes("bulk_retry_ai_review_enqueued"));

  const worker = readFileSync(
    join(root, "server/prospectImport/prospectBulkAnalysisWorker.ts"),
    "utf8",
  );
  assert.ok(worker.includes("describeOpenAiKeyRuntimeDiagnostics"));
  assert.ok(worker.includes("shouldStartProspectAiBulkWorker"));
  assert.ok(worker.includes("worker_start_blocked"));
  assert.ok(worker.includes("foreign_deployment_warning"));
  assert.ok(worker.includes("openaiKeyPrefixClass"));
  assert.ok(worker.includes("railwayProjectName"));
  assert.ok(worker.includes("resendKeyPrefixClass"));

  const panel = readFileSync(
    join(root, "client/src/components/settings/ProspectIntelligencePanel.tsx"),
    "utf8",
  );
  assert.ok(panel.includes('data-testid="pi-bulk-retry-ai-review"'));
  assert.ok(panel.includes("bulkRetryAiReviewMutation"));
  assert.ok(panel.includes("Retrying…"));

  const reanalyze = readFileSync(
    join(root, "server/prospectImport/prospectIntelligenceService.ts"),
    "utf8",
  );
  assert.ok(reanalyze.includes("enqueueBulkRetryAiReview"));
  assert.ok(reanalyze.includes("aiReviewRetrying"));
});

console.log("prospect-ai-review-bulk-retry.test.ts: all assertions passed");
