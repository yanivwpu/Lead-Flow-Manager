/**
 * Prospect enrichment status UX — Ready / Unavailable / Partial / Complete / Campaign.
 * Run: npx tsx --test tests/prospect-enrichment-status-ux.test.ts
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  ENRICHMENT_UNAVAILABLE_COMPACT_REASON,
  ENRICHMENT_UNAVAILABLE_DIALOG_REASON,
  formatProspectEnrichmentChannelMarks,
  resolveProspectEnrichmentStatusUx,
} from "../shared/prospectEnrichmentStatusUx";
import {
  explainCanEnrichProspect,
  explainQualifiedForCampaign,
  enrichDisabledActionLabel,
} from "../shared/prospectAiReviewState";
import {
  PROSPECT_PROGRESS_STATE_LABELS,
  resolveProspectDetailPrimaryStatus,
  resolveProspectProgressState,
} from "../shared/prospectAiReviewErrors";

test("analysis complete + enrichment none + website exists → Ready to Enrich", () => {
  const input = {
    analysisStatus: "completed",
    enrichmentStatus: "none",
    websiteUrl: "https://biz.com",
    email: null,
  };
  const ux = resolveProspectEnrichmentStatusUx(input);
  assert.equal(ux.code, "ready_to_enrich");
  assert.equal(ux.label, "Ready to Enrich");

  const progress = resolveProspectProgressState({
    ...input,
    decision: "qualified",
    reviewStatus: "approved",
    readyForCampaign: false,
  });
  assert.equal(progress.code, "ready_to_enrich");
  assert.equal(progress.label, "Ready to Enrich");
});

test("analysis complete + enrichment none + no website → Enrichment Unavailable", () => {
  const input = {
    analysisStatus: "completed",
    enrichmentStatus: "none",
    enrichmentPhoneFound: true,
    phone: "5551234567",
    websiteUrl: null,
    websiteUrlUsed: null,
    email: null,
  };
  const ux = resolveProspectEnrichmentStatusUx(input);
  assert.equal(ux.code, "enrichment_unavailable");
  assert.equal(ux.label, "Enrichment Unavailable");
  assert.notEqual(ux.code, "partially_enriched");
  assert.equal(ux.unavailableExplanation, ENRICHMENT_UNAVAILABLE_DIALOG_REASON);
  assert.equal(ux.compactReason, ENRICHMENT_UNAVAILABLE_COMPACT_REASON);
  assert.equal(
    formatProspectEnrichmentChannelMarks(ux.channels),
    "✓ Phone · ✕ Social · ✕ Website · ✕ Email",
  );

  const progress = resolveProspectProgressState({
    ...input,
    decision: "qualified",
    reviewStatus: "approved",
    readyForCampaign: false,
  });
  assert.equal(progress.code, "enrichment_unavailable");
  assert.equal(progress.label, "Enrichment Unavailable");
  assert.equal(progress.detail, ENRICHMENT_UNAVAILABLE_COMPACT_REASON);

  const ex = explainCanEnrichProspect({
    ...input,
    reviewStatus: "approved",
    approvedAt: "2026-08-01T00:00:00.000Z",
  });
  assert.equal(ex.ok, false);
  assert.equal(ex.code, "enrichment_unavailable");
  assert.equal(ex.message, ENRICHMENT_UNAVAILABLE_DIALOG_REASON);
  assert.doesNotMatch(ex.message, /No website available to enrich/i);
  assert.equal(enrichDisabledActionLabel({
    ...input,
    reviewStatus: "approved",
    approvedAt: "2026-08-01T00:00:00.000Z",
  }), "Enrichment Unavailable");
});

test("enrichment completed/failed + gaps → Partially Enriched", () => {
  const completedPartial = resolveProspectEnrichmentStatusUx({
    analysisStatus: "completed",
    enrichmentStatus: "completed",
    enrichmentEmailFound: false,
    enrichmentPhoneFound: true,
    phone: "5551234567",
    websiteUrl: null,
    email: null,
  });
  assert.equal(completedPartial.code, "partially_enriched");
  assert.equal(completedPartial.label, "Partially Enriched");

  const failedPartial = resolveProspectProgressState({
    analysisStatus: "completed",
    enrichmentStatus: "failed",
    enrichmentEmailFound: false,
    websiteUrl: null,
    email: null,
    decision: "qualified",
    reviewStatus: "approved",
    readyForCampaign: false,
  });
  assert.equal(failedPartial.code, "partially_enriched");
  assert.equal(failedPartial.label, "Partially Enriched");
});

test("email + website + enrichment complete → Enrichment Complete", () => {
  const ux = resolveProspectEnrichmentStatusUx({
    analysisStatus: "completed",
    enrichmentStatus: "completed",
    enrichmentEmailFound: true,
    email: "owner@biz.com",
    websiteUrl: "https://biz.com",
    websiteUrlUsed: "https://biz.com",
  });
  assert.equal(ux.code, "enrichment_complete");
  assert.equal(ux.label, "Enrichment Complete");

  const progress = resolveProspectProgressState({
    analysisStatus: "completed",
    enrichmentStatus: "completed",
    enrichmentEmailFound: true,
    email: "owner@biz.com",
    websiteUrl: "https://biz.com",
    decision: "qualified",
    reviewStatus: "approved",
    readyForCampaign: false,
  });
  assert.equal(progress.code, "enriched");
  assert.equal(progress.label, PROSPECT_PROGRESS_STATE_LABELS.enriched);
});

test("campaign gate remains independent of enrichment unavailable", () => {
  const blocked = explainQualifiedForCampaign({
    analysisStatus: "completed",
    reviewStatus: "approved",
    approvedAt: "2026-08-01T00:00:00.000Z",
    enrichmentStatus: "none",
    websiteUrl: null,
    email: null,
    suggestedFirstMessage: "Hi",
    suggestedOutreachSubject: "Hello",
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "missing_email");
  assert.match(blocked.message, /Email required for Campaign/i);

  const primary = resolveProspectDetailPrimaryStatus({
    analysisStatus: "completed",
    decision: "qualified",
    readyForCampaign: false,
  });
  assert.equal(primary.code, "qualified");
  assert.notEqual(primary.label, "Ready for Campaign");

  const ready = resolveProspectProgressState({
    analysisStatus: "completed",
    enrichmentStatus: "none",
    websiteUrl: null,
    email: "owner@biz.com",
    decision: "qualified",
    reviewStatus: "approved",
    readyForCampaign: true,
  });
  assert.equal(ready.code, "ready_for_campaign");
  assert.equal(ready.label, "Ready for Campaign");
});
