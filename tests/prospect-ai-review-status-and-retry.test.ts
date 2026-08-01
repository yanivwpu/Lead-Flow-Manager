/**
 * Prospect AI Review: single primary status + transient auto-retry policy.
 * Run: npx tsx tests/prospect-ai-review-status-and-retry.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isProspectAiTransientProviderError,
  resolveProspectDetailPrimaryStatus,
  userFacingProspectAiReviewError,
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

run("single primary status: AI failed hides Needs Review", () => {
  const s = resolveProspectDetailPrimaryStatus({
    analysisStatus: "failed",
    decision: "needs_review",
    readyForCampaign: false,
  });
  assert.equal(s.code, "ai_review_failed");
  assert.equal(s.label, "AI Review Failed");
});

run("single primary status: Ready for Campaign replaces Qualified", () => {
  const s = resolveProspectDetailPrimaryStatus({
    analysisStatus: "completed",
    decision: "qualified",
    readyForCampaign: true,
  });
  assert.equal(s.code, "ready_for_campaign");
  assert.equal(s.label, "Ready for Campaign");
  assert.equal(s.label.includes("Email"), false);
});

run("single primary status: Qualified without campaign ready", () => {
  const s = resolveProspectDetailPrimaryStatus({
    analysisStatus: "completed",
    decision: "qualified",
    readyForCampaign: false,
  });
  assert.equal(s.code, "qualified");
});

run("single primary status: Not Qualified beats Needs Review", () => {
  const s = resolveProspectDetailPrimaryStatus({
    analysisStatus: "completed",
    decision: "not_qualified",
    readyForCampaign: false,
  });
  assert.equal(s.code, "not_qualified");
});

run("transient classification covers parse / network / timeout", () => {
  assert.equal(
    isProspectAiTransientProviderError(new Error("Unexpected token < in JSON at position 0")),
    true,
  );
  assert.equal(
    isProspectAiTransientProviderError(new Error("fetch failed")),
    true,
  );
  assert.equal(
    isProspectAiTransientProviderError(
      new Error("Analysis timed out after 90000ms"),
    ),
    true,
  );
  assert.equal(
    isProspectAiTransientProviderError(new Error("429 rate limit exceeded")),
    true,
  );
  assert.equal(
    isProspectAiTransientProviderError(
      new Error("OpenAI API key is missing. Set OPENAI_API_KEY"),
    ),
    false,
  );
});

run("user-facing errors never leak env vars", () => {
  const msg = userFacingProspectAiReviewError(
    "OpenAI API authentication failed. Check OPENAI_API_KEY / AI_INTEGRATIONS_OPENAI_API_KEY",
  );
  assert.equal(msg.includes("OPENAI_API_KEY"), false);
  assert.match(msg, /Retry Qualification|temporarily unavailable/i);
});

run("service auto-retries transient provider/parse errors before failing", () => {
  const serviceSrc = readFileSync(
    join(root, "server/prospectImport/prospectIntelligenceService.ts"),
    "utf8",
  );
  assert.ok(serviceSrc.includes("isProspectAiTransientProviderError"));
  assert.ok(serviceSrc.includes("MAX_AI_RETRIES = 3"));
  assert.ok(serviceSrc.includes("errorMessage: null"));
  // Success path clears prior failure / stamps qualificationSource on rawResult
  assert.ok(
    serviceSrc.includes("errorMessage: null") &&
      (serviceSrc.includes("rawResult: intel as unknown as Record<string, unknown>") ||
        serviceSrc.includes("buildQualificationSourcePatch")),
  );
});

run("bulk worker retries once after transient timeout", () => {
  const bulkSrc = readFileSync(
    join(root, "server/prospectImport/prospectBulkAnalysisService.ts"),
    "utf8",
  );
  assert.ok(bulkSrc.includes("item_transient_retry"));
  assert.ok(bulkSrc.includes("analyzeContactOnceWithTimeout"));
  assert.ok(bulkSrc.includes("isProspectAiTransientProviderError"));
});

run("panel shows one primary status badge and Ready for Campaign copy", () => {
  const panelSrc = readFileSync(
    join(root, "client/src/components/settings/ProspectIntelligencePanel.tsx"),
    "utf8",
  );
  const errorsSrc = readFileSync(
    join(root, "shared/prospectAiReviewErrors.ts"),
    "utf8",
  );
  assert.ok(panelSrc.includes("resolveProspectDetailPrimaryStatus"));
  assert.ok(panelSrc.includes("{primary.label}"));
  assert.ok(errorsSrc.includes('"Ready for Campaign"'));
  assert.ok(!panelSrc.includes("Ready for Email campaign"));
  assert.ok(!panelSrc.includes("Ready for Email Campaign"));
  // Title uses a single primary badge resolver (not stacked status badges)
  const titleSlice = panelSrc.slice(
    panelSrc.indexOf('className="flex flex-wrap items-center gap-2"'),
    panelSrc.indexOf("</DialogTitle>"),
  );
  assert.ok(titleSlice.includes("resolveProspectDetailPrimaryStatus"));
  assert.ok(titleSlice.includes("primary.testId"));
  assert.ok(!titleSlice.includes("pi-ai-review-failed-badge"));
  assert.ok(!titleSlice.includes("pi-needs-human-review-badge"));
});

console.log("prospect-ai-review-status-and-retry.test.ts: all assertions passed");
