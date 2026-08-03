/**
 * Prospect AI Review + Enrichment reliability.
 * Run: npx tsx tests/prospect-ai-reliability.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyProspectAiReviewFailure,
  classifyProspectEnrichmentFailure,
  explainProspectEnrichmentIndependence,
  prospectAiReviewFailedPersistIsClean,
  prospectAiReviewOutputClearPatch,
  prospectAiReviewSuccessClearsFailure,
  summarizeProspectAiReviewFailureKinds,
  traceProspectAiReliabilityPipeline,
} from "../shared/prospectAiReliability";
import {
  isProspectAiTransientProviderError,
  isProspectAiReviewRetryable,
  userFacingProspectAiReviewError,
  sanitizeProspectAiReviewTechnicalDetails,
} from "../shared/prospectAiReviewErrors";
import { isProspectEnrichmentRetryable } from "../shared/prospectAiReviewState";
import { userFacingEnrichmentErrorMessage } from "../shared/prospectEnrichmentOutcome";
import { formatProspectAiProviderFailureMessage } from "../shared/openaiApiKey";
import { claimableAnalysisStatuses } from "../shared/prospectAnalysisOwnership";

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

run("pipeline trace: fail → retry → complete → enrich → campaign", () => {
  const failed = traceProspectAiReliabilityPipeline({
    analysisStatus: "failed",
    enrichmentStatus: "none",
    campaignEligible: false,
  });
  assert.deepEqual(
    failed.filter((s) =>
      [
        "discover_saved",
        "sent_to_review",
        "ai_review_started",
        "ai_review_failed",
        "campaign_blocked",
      ].includes(s),
    ),
    [
      "discover_saved",
      "sent_to_review",
      "ai_review_started",
      "ai_review_failed",
      "campaign_blocked",
    ],
  );

  const recovered = traceProspectAiReliabilityPipeline({
    analysisStatus: "completed",
    retriedQualification: true,
    enrichmentStatus: "completed",
    hasEmail: true,
    campaignEligible: true,
  });
  assert.ok(recovered.includes("ai_review_retry"));
  assert.ok(recovered.includes("ai_review_completed"));
  assert.ok(recovered.includes("enrichment_completed"));
  assert.ok(recovered.includes("campaign_eligible"));
  assert.ok(!recovered.includes("ai_review_failed"));
});

run("transient timeout / provider / parse are auto-retryable", () => {
  assert.equal(
    classifyProspectAiReviewFailure(new Error("Analysis timed out after 90000ms")).kind,
    "timeout",
  );
  assert.equal(
    classifyProspectAiReviewFailure(new Error("Analysis timed out after 90000ms")).autoRetryable,
    true,
  );
  assert.equal(
    classifyProspectAiReviewFailure(new Error("429 rate limit exceeded")).kind,
    "rate_limit",
  );
  assert.equal(
    classifyProspectAiReviewFailure(new Error("fetch failed")).kind,
    "temporary_provider",
  );
  assert.equal(
    classifyProspectAiReviewFailure(
      new Error("Unexpected token < in JSON at position 0"),
      "json_parse",
    ).kind,
    "validation",
  );
  assert.equal(
    isProspectAiTransientProviderError(new Error("Unexpected token < in JSON at position 0")),
    true,
  );
});

run("configuration failures are not auto-retried", () => {
  const c = classifyProspectAiReviewFailure(
    new Error("OpenAI API key is missing. Set OPENAI_API_KEY"),
  );
  assert.equal(c.kind, "configuration");
  assert.equal(c.autoRetryable, false);
  assert.equal(c.userMessage.includes("OPENAI_API_KEY"), false);
});

run("batch failure kind summary (representative transient-heavy batch)", () => {
  const sample = [
    { errorMessage: "Analysis timed out after 90000ms", stage: "model_call_start" },
    { errorMessage: "Analysis timed out after 90000ms", stage: "model_call_start" },
    { errorMessage: "Unexpected token < in JSON at position 0", stage: "json_parse" },
    { errorMessage: "429 rate limit exceeded", stage: "model_call_start" },
    { errorMessage: "fetch failed", stage: "model_call_start" },
    {
      errorMessage: "OpenAI API authentication failed. Check OPENAI_API_KEY",
      stage: "model_call_start",
    },
    { errorMessage: "Abandoned stale processing (auto-heal)", stage: "claim" },
    { errorMessage: "Analysis already in progress for this contact.", stage: "claim" },
  ];
  const counts = summarizeProspectAiReviewFailureKinds(sample);
  assert.equal(counts.timeout, 2);
  assert.equal(counts.validation, 1);
  assert.equal(counts.rate_limit, 1);
  assert.equal(counts.temporary_provider, 1);
  assert.equal(counts.configuration, 1);
  assert.equal(counts.race_condition, 2);
  // This mirrors the observed production pattern: first attempt flakes, manual retry works.
  const retryableShare =
    (counts.timeout + counts.validation + counts.rate_limit + counts.temporary_provider) /
    sample.length;
  assert.ok(retryableShare >= 0.5);
});

run("JSON.parse exhausted: user-retryable, no partial persist, clean replace on success", () => {
  const parseErr = new Error("Unexpected token < in JSON at position 0");
  const stored = formatProspectAiProviderFailureMessage(parseErr);
  assert.match(stored, /parsing failed/i);
  assert.equal(isProspectAiReviewRetryable(stored), true);
  assert.equal(classifyProspectAiReviewFailure(parseErr, "json_parse").userRetryable, true);
  assert.ok(claimableAnalysisStatuses(false).includes("failed"));

  // Failed persist must wipe AI outputs and must not keep prior intel in rawResult.
  const failedPatch = {
    analysisStatus: "failed",
    errorMessage: stored,
    ...prospectAiReviewOutputClearPatch(),
    rawResult: {
      aiReviewFailureKind: "validation",
      aiReviewFailureStage: "json_parse",
      autoRetryable: true,
      userRetryable: true,
    },
  };
  assert.equal(prospectAiReviewFailedPersistIsClean(failedPatch), true);
  assert.equal(
    prospectAiReviewFailedPersistIsClean({
      ...failedPatch,
      leadScore: 72,
      reasoningSummary: "stale",
    }),
    false,
  );

  // Successful retry fully replaces failure diagnostics.
  assert.equal(
    prospectAiReviewSuccessClearsFailure({
      analysisStatus: "completed",
      errorMessage: null,
      rawResult: { leadScore: 80, reasoningSummary: "ok" },
    }),
    true,
  );
  assert.equal(
    prospectAiReviewSuccessClearsFailure({
      analysisStatus: "completed",
      errorMessage: null,
      rawResult: { aiReviewFailureKind: "validation" },
    }),
    false,
  );

  const serviceSrc = readFileSync(
    join(root, "server/prospectImport/prospectIntelligenceService.ts"),
    "utf8",
  );
  assert.ok(serviceSrc.includes("prospectAiReviewOutputClearPatch"));
  assert.ok(serviceSrc.includes("errorMessage: null"));
  assert.ok(serviceSrc.includes("aiReviewFailureKind"));
  assert.ok(serviceSrc.includes("MAX_AI_RETRIES = 3"));
  // Failure path delegates to attempt-aware persist (clears outputs / preserves success).
  const failBlock = serviceSrc.slice(
    serviceSrc.indexOf("if (!parsed)"),
    serviceSrc.indexOf("intel = parsed"),
  );
  assert.ok(failBlock.includes("persistFailedAttempt"));
  assert.ok(!failBlock.includes("parseAndValidateProspectIntelligence"));
  assert.ok(!failBlock.includes("rawText"));
  assert.ok(serviceSrc.includes("prospectAiReviewOutputClearPatch"));
  assert.ok(serviceSrc.includes("resolveProspectAiFailurePersistAction"));
});

run("successful retry clears stale failure state", () => {
  assert.equal(
    prospectAiReviewSuccessClearsFailure({
      analysisStatus: "completed",
      errorMessage: null,
      rawResult: { leadScore: 80 },
    }),
    true,
  );
  assert.equal(
    prospectAiReviewSuccessClearsFailure({
      analysisStatus: "completed",
      errorMessage: "OpenAI API key is missing",
      rawResult: { leadScore: 80 },
    }),
    false,
  );
  assert.equal(
    prospectAiReviewSuccessClearsFailure({
      analysisStatus: "completed",
      errorMessage: null,
      rawResult: { aiReviewFailureKind: "timeout" },
    }),
    false,
  );

  const serviceSrc = readFileSync(
    join(root, "server/prospectImport/prospectIntelligenceService.ts"),
    "utf8",
  );
  assert.ok(serviceSrc.includes("errorMessage: null"));
  assert.ok(serviceSrc.includes("aiReviewFailureKind"));
  assert.ok(serviceSrc.includes("classifyProspectAiReviewFailure"));
  assert.ok(serviceSrc.includes("MAX_AI_RETRIES = 3"));
});

run("enrichment is intentionally independent of AI Review", () => {
  const indep = explainProspectEnrichmentIndependence();
  assert.equal(indep.intentional, true);
  assert.equal(indep.canRunBeforeAiReview, false);
  assert.equal(indep.shouldRunBeforeAiReview, false);
  assert.equal(indep.canAiFailWhileEnrichmentSucceeds, true);
  assert.equal(indep.canEnrichmentFailWhileAiSucceeds, true);
});

run("enrichment failures: friendly copy + retry vs permanent", () => {
  const timeout = classifyProspectEnrichmentFailure({
    enrichmentStatus: "failed",
    enrichmentErrorMessage: "website_timeout",
    enrichmentResult: { failureClass: "website_timeout" },
    websiteUrl: "https://example.com",
  });
  assert.equal(timeout.retryable, true);
  assert.match(timeout.userMessage, /timed out|couldn't be collected/i);

  const unreachable = classifyProspectEnrichmentFailure({
    enrichmentStatus: "failed",
    enrichmentResult: { failureClass: "website_fetch_failed" },
    websiteUrl: "https://example.com",
  });
  assert.equal(unreachable.retryable, true);
  assert.match(unreachable.userMessage, /couldn't be reached/i);

  const social = classifyProspectEnrichmentFailure({
    enrichmentStatus: "failed",
    enrichmentResult: { failureClass: "social_profile_only" },
    websiteUrl: "https://facebook.com/biz",
  });
  assert.equal(social.retryable, false);
  assert.equal(social.permanent, true);

  const none = classifyProspectEnrichmentFailure({
    enrichmentStatus: "failed",
    enrichmentResult: { failureClass: "no_website" },
  });
  assert.equal(none.retryable, false);

  assert.equal(
    isProspectEnrichmentRetryable({
      analysisStatus: "completed",
      reviewStatus: "pending",
      enrichmentStatus: "failed",
      enrichmentResult: { failureClass: "website_timeout" },
      websiteUrl: "https://example.com",
    }),
    true,
  );
  assert.equal(
    isProspectEnrichmentRetryable({
      analysisStatus: "completed",
      reviewStatus: "pending",
      enrichmentStatus: "failed",
      enrichmentResult: { failureClass: "social_profile_only" },
      websiteUrl: "https://facebook.com/x",
    }),
    false,
  );

  assert.equal(
    userFacingEnrichmentErrorMessage("website_fetch_failed").includes("OPENAI"),
    false,
  );
});

run("friendly AI errors hide env vars; admin sanitizer redacts keys", () => {
  const user = userFacingProspectAiReviewError(
    "OpenAI API authentication failed. Check OPENAI_API_KEY / AI_INTEGRATIONS_OPENAI_API_KEY sk-proj-abcdefghijklmnop",
  );
  assert.equal(user.includes("OPENAI_API_KEY"), false);
  assert.equal(user.includes("sk-proj"), false);
  const tech = sanitizeProspectAiReviewTechnicalDetails(
    "401 Incorrect API key provided: sk-proj-abcdefghijklmnop",
  );
  assert.match(tech, /sk-…/);
  assert.equal(tech.includes("sk-proj-abcdefghijklmnop"), false);
});

run("service + bulk wire auto-retry before AI Review Failed", () => {
  const serviceSrc = readFileSync(
    join(root, "server/prospectImport/prospectIntelligenceService.ts"),
    "utf8",
  );
  const bulkSrc = readFileSync(
    join(root, "server/prospectImport/prospectBulkAnalysisService.ts"),
    "utf8",
  );
  assert.ok(serviceSrc.includes("autoRetryable"));
  assert.ok(bulkSrc.includes("item_transient_retry"));
  assert.ok(bulkSrc.includes("isProspectAiTransientProviderError"));
});

console.log("prospect-ai-reliability.test.ts: all assertions passed");
