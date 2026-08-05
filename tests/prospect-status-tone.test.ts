/**
 * Prospect AI status color tones — Partially Enriched never red.
 * Run: npx tsx --test tests/prospect-status-tone.test.ts
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  PROSPECT_STATUS_TONE_CLASSES,
  resolveProspectChannelChipTone,
  resolveProspectEnrichmentUxTone,
  resolveProspectNeedsReviewBadgeTone,
  resolveProspectProgressTone,
  resolveProspectTimelineStageTone,
} from "../shared/prospectStatusTone";
import { resolveProspectTimelineStates } from "../shared/prospectReviewUx";
import { resolveProspectProgressState } from "../shared/prospectAiReviewErrors";

test("enrichment UX tones: complete green, partial/unavailable amber", () => {
  assert.equal(resolveProspectEnrichmentUxTone("enrichment_complete"), "success");
  assert.equal(resolveProspectEnrichmentUxTone("partially_enriched"), "warning");
  assert.equal(resolveProspectEnrichmentUxTone("enrichment_unavailable"), "warning");
  assert.notEqual(resolveProspectEnrichmentUxTone("partially_enriched"), "danger");
});

test("progress tones: Partially Enriched amber; Failed red only for processing failure", () => {
  assert.equal(resolveProspectProgressTone("partially_enriched"), "warning");
  assert.equal(resolveProspectProgressTone("enrichment_unavailable"), "warning");
  assert.equal(resolveProspectProgressTone("enriched"), "success");
  assert.equal(resolveProspectProgressTone("failed"), "danger");

  const partial = resolveProspectProgressState({
    analysisStatus: "completed",
    enrichmentStatus: "failed",
    decision: "qualified",
    reviewStatus: "approved",
    websiteUrl: null,
    email: null,
  });
  assert.equal(partial.code, "partially_enriched");
  assert.equal(resolveProspectProgressTone(partial.code), "warning");
  assert.match(PROSPECT_STATUS_TONE_CLASSES.warning.textStrong, /amber/);
  assert.doesNotMatch(PROSPECT_STATUS_TONE_CLASSES.warning.textStrong, /red|rose/);
});

test("timeline: enrichment failed → attention (amber), AI failed → failed (red)", () => {
  assert.equal(resolveProspectTimelineStageTone("attention"), "warning");
  assert.equal(resolveProspectTimelineStageTone("failed"), "danger");
  assert.equal(resolveProspectTimelineStageTone("done"), "success");

  const states = resolveProspectTimelineStates({
    analysisStatus: "completed",
    enrichmentStatus: "failed",
  });
  assert.equal(states[1], "attention");
  assert.notEqual(states[1], "failed");

  const aiFailed = resolveProspectTimelineStates({
    analysisStatus: "failed",
    enrichmentStatus: "none",
  });
  assert.equal(aiFailed[0], "failed");
});

test("channel chips: missing data is amber, not red", () => {
  assert.equal(resolveProspectChannelChipTone(true), "success");
  assert.equal(resolveProspectChannelChipTone(false), "warning");
  assert.match(PROSPECT_STATUS_TONE_CLASSES.warning.chip, /amber/);
  assert.doesNotMatch(PROSPECT_STATUS_TONE_CLASSES.warning.chip, /rose|red/);
});

test("enrichment_failed badge tone is amber (missing-data), AI Review Failed is red", () => {
  assert.equal(resolveProspectNeedsReviewBadgeTone("enrichment_failed"), "warning");
  assert.equal(resolveProspectNeedsReviewBadgeTone("ai_review_failed"), "danger");
  assert.equal(resolveProspectNeedsReviewBadgeTone("missing_email"), "warning");
});
