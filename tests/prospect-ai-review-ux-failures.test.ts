/**
 * Prospect AI Review UX: friendly failures, progress states, independent jobs.
 * Run: npx tsx tests/prospect-ai-review-ux-failures.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyProspectAiReviewError,
  isProspectAiReviewRetryable,
  resolveProspectProgressState,
  sanitizeProspectAiReviewTechnicalDetails,
  userFacingProspectAiReviewError,
} from "../shared/prospectAiReviewErrors";
import {
  resolveProspectNeedsReviewBadge,
  resolveProspectNeedsReviewBadgeDetail,
} from "../shared/prospectAiReviewState";
import {
  buildProspectRowAiSummary,
  resolveProspectTimelineStates,
} from "../shared/prospectReviewUx";
import { userFacingEnrichmentErrorMessage } from "../shared/prospectEnrichmentOutcome";
import { discoveryAttentionLabel } from "../shared/prospectAiDiscoveryQuality";
import { formatProspectAiProviderFailureMessage } from "../shared/openaiApiKey";
import { resolveAiPersonalityStatus } from "../shared/prospectAiPersonality";

const root = process.cwd();
const panelSrc = readFileSync(
  join(root, "client/src/components/settings/ProspectIntelligencePanel.tsx"),
  "utf8",
);

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (err) {
    console.error(`fail ${name}`);
    throw err;
  }
}

run("AI Review success populates summary consistently", () => {
  const summary = buildProspectRowAiSummary({
    analysisStatus: "completed",
    leadScore: 80,
    priority: "high",
    businessType: "real_estate",
    recommendedOffer: "general_demo",
  });
  assert.equal(summary.showSummary, true);
  assert.ok(summary.matchLabel);
  assert.ok(summary.angle);
  assert.match(String(summary.angle), /AI Review complete|demo|real/i);
});

run("temporary AI failure is retryable with friendly copy", () => {
  const info = classifyProspectAiReviewError("OpenAI rate limit 429 — try again later");
  assert.equal(info.retryable, true);
  assert.equal(info.class, "retryable");
  assert.match(info.userMessage, /temporarily unavailable|Retry Qualification/i);
  assert.equal(isProspectAiReviewRetryable("timeout while calling model"), true);
});

run("configuration AI failure hides env vars from users", () => {
  const technical = formatProspectAiProviderFailureMessage(
    new Error("OpenAI API key is missing. Set OPENAI_API_KEY"),
  );
  assert.match(technical, /OPENAI_API_KEY/);
  const user = userFacingProspectAiReviewError(technical);
  assert.equal(user.includes("OPENAI_API_KEY"), false);
  assert.equal(user.includes("sk-"), false);
  assert.match(user, /temporarily unavailable|couldn't be completed/i);
});

run("permanent AI failure is not endlessly retryable", () => {
  const info = classifyProspectAiReviewError("permanently unsupported business record");
  assert.equal(info.retryable, false);
  assert.equal(info.class, "permanent");
});

run("enrichment website unreachable is friendly", () => {
  const msg = userFacingEnrichmentErrorMessage("website_fetch_failed");
  assert.match(msg, /couldn't be reached/i);
  assert.equal(/OPENAI|API_KEY|sk-/i.test(msg), false);
});

run("independent jobs: enriched + AI Review failed is expected", () => {
  const badge = resolveProspectNeedsReviewBadge({
    analysisStatus: "failed",
    reviewStatus: "pending",
    enrichmentStatus: "completed",
    websiteUrl: "https://example.com",
    email: "a@b.com",
    errorMessage: "OpenAI API authentication failed. Check OPENAI_API_KEY",
  });
  assert.equal(badge?.code, "ai_review_failed");
  const detail = resolveProspectNeedsReviewBadgeDetail(
    {
      analysisStatus: "failed",
      enrichmentStatus: "completed",
      errorMessage: "OpenAI API authentication failed. Check OPENAI_API_KEY",
    },
    badge,
  );
  assert.ok(detail);
  assert.equal(detail!.includes("OPENAI_API_KEY"), false);
  assert.deepEqual(
    resolveProspectTimelineStates({
      analysisStatus: "failed",
      enrichmentStatus: "completed",
    }),
    ["failed", "done", "todo"],
  );
});

run("independent jobs: AI complete + enrichment failed is expected", () => {
  const badge = resolveProspectNeedsReviewBadge({
    analysisStatus: "completed",
    reviewStatus: "pending",
    enrichmentStatus: "failed",
    websiteUrl: "https://example.com",
    enrichmentErrorMessage: "website_fetch_failed",
  });
  assert.equal(badge?.code, "enrichment_failed");
  assert.equal(badge?.label, "Website lookup failed");
  assert.deepEqual(
    resolveProspectTimelineStates({
      analysisStatus: "completed",
      enrichmentStatus: "failed",
    }),
    ["done", "failed", "todo"],
  );
});

run("progress states are concise", () => {
  assert.equal(
    resolveProspectProgressState({ analysisStatus: "processing" }).label,
    "Reviewing",
  );
  assert.equal(
    resolveProspectProgressState({
      analysisStatus: "completed",
      enrichmentStatus: "none",
      websiteUrl: "https://x.com",
    }).label,
    "Ready to Enrich",
  );
  assert.equal(
    resolveProspectProgressState({
      analysisStatus: "completed",
      enrichmentStatus: "completed",
      email: "a@b.com",
    }).label,
    "Ready for Campaign",
  );
  assert.equal(
    resolveProspectProgressState({ analysisStatus: "failed" }).label,
    "Failed",
  );
});

run("Needs Review discovery reasons are friendly", () => {
  assert.equal(
    discoveryAttentionLabel("uncertain_category"),
    "Category uncertain",
  );
  assert.equal(
    discoveryAttentionLabel("social_profile_as_website"),
    "Website appears to be a social profile",
  );
  const badge = resolveProspectNeedsReviewBadge({
    analysisStatus: "completed",
    reviewStatus: "pending",
    enrichmentStatus: "none",
    email: "a@b.com",
    websiteUrl: "https://example.com",
    discoveryAttentionReason: "social_profile_as_website",
  });
  assert.equal(badge?.code, "discovery_attention");
  assert.match(String(badge?.label), /social profile/i);
});

run("personality never dumps OPENAI diagnostics", () => {
  const status = resolveAiPersonalityStatus({
    ux: {
      analysisStatus: "failed",
      errorMessage: "Check OPENAI_API_KEY / AI_INTEGRATIONS_OPENAI_API_KEY",
    },
    seed: "c1",
  });
  assert.equal(status.message.includes("OPENAI_API_KEY"), false);
  assert.match(status.message, /Retry Qualification|couldn't be completed/i);
});

run("admin technical sanitizer redacts key material", () => {
  const sanitized = sanitizeProspectAiReviewTechnicalDetails(
    "401 Incorrect API key provided: sk-proj-abcdefghijklmnop",
  );
  assert.equal(sanitized.includes("sk-proj-abcdefghijklmnop"), false);
  assert.match(sanitized, /sk-…/);
});

run("panel gates technical details + retry + no raw env for users", () => {
  assert.ok(panelSrc.includes("userFacingProspectAiReviewError"));
  assert.ok(panelSrc.includes("Technical details"));
  assert.ok(panelSrc.includes("pi-analysis-technical-details"));
  assert.ok(panelSrc.includes("isAdmin"));
  assert.ok(panelSrc.includes("Retry Qualification"));
  assert.ok(panelSrc.includes("resolveProspectProgressState"));
  assert.ok(panelSrc.includes('Status (default)'));
  // Detail banner must not interpolate raw intel.errorMessage for users
  assert.ok(!panelSrc.includes("{String(intel?.errorMessage || \"\").trim()"));
});

console.log("prospect-ai-review-ux-failures.test.ts: all assertions passed");
