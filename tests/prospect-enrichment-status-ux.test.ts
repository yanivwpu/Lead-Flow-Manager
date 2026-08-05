/**
 * Prospect enrichment status UX — Complete vs Partial vs Campaign-ready.
 * Run: npx tsx --test tests/prospect-enrichment-status-ux.test.ts
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  formatProspectEnrichmentChannelMarks,
  prospectEnrichmentTimelineLabel,
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

const partialBase = {
  analysisStatus: "completed",
  reviewStatus: "approved",
  approvedAt: "2026-08-01T00:00:00.000Z",
  enrichmentStatus: "completed",
  enrichmentEmailFound: false,
  enrichmentPhoneFound: true,
  enrichmentResult: {
    publicContacts: {
      socialProfiles: ["https://instagram.com/biz"],
      phones: ["5551234567"],
    },
  },
  email: null,
  phone: "5551234567",
  websiteUrl: null,
  websiteUrlUsed: null,
  suggestedFirstMessage: "Hi there",
  suggestedOutreachSubject: "Quick idea",
};

test("partial enrichment: phone+social found, website+email missing", () => {
  const ux = resolveProspectEnrichmentStatusUx(partialBase);
  assert.equal(ux.code, "partially_enriched");
  assert.equal(ux.label, "Partially Enriched");
  assert.equal(
    formatProspectEnrichmentChannelMarks(ux.channels),
    "✓ Phone · ✓ Social · ✕ Website · ✕ Email",
  );
  assert.match(ux.unavailableExplanation || "", /Enrichment finished/i);
  assert.match(ux.unavailableExplanation || "", /website or email/i);
  assert.equal(prospectEnrichmentTimelineLabel(ux).full, "Partially Enriched");
});

test("enrichment complete when email + official website present", () => {
  const ux = resolveProspectEnrichmentStatusUx({
    ...partialBase,
    enrichmentEmailFound: true,
    email: "owner@biz.com",
    websiteUrl: "https://biz.com",
    websiteUrlUsed: "https://biz.com",
  });
  assert.equal(ux.code, "enrichment_complete");
  assert.equal(ux.label, "Enrichment Complete");
  assert.equal(ux.unavailableExplanation, null);
});

test("blocked enrich copy explains finished-but-unavailable, not 'No website available to enrich'", () => {
  const ex = explainCanEnrichProspect(partialBase);
  assert.equal(ex.ok, false);
  assert.equal(ex.code, "partially_enriched");
  assert.doesNotMatch(ex.message, /No website available to enrich/i);
  assert.match(ex.message, /Enrichment finished/i);
  assert.equal(enrichDisabledActionLabel(partialBase), "Partially Enriched");
});

test("Ready for Campaign only when campaign gate (email) is satisfied", () => {
  const blocked = explainQualifiedForCampaign(partialBase);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "missing_email");
  assert.match(blocked.message, /Email required for Campaign/i);

  const primaryBlocked = resolveProspectDetailPrimaryStatus({
    analysisStatus: "completed",
    decision: "qualified",
    readyForCampaign: false,
  });
  assert.equal(primaryBlocked.code, "qualified");
  assert.notEqual(primaryBlocked.label, "Ready for Campaign");

  const ready = explainQualifiedForCampaign({
    ...partialBase,
    email: "owner@biz.com",
    enrichmentEmailFound: true,
  });
  assert.equal(ready.ok, true);

  const primaryReady = resolveProspectDetailPrimaryStatus({
    analysisStatus: "completed",
    decision: "qualified",
    readyForCampaign: true,
  });
  assert.equal(primaryReady.code, "ready_for_campaign");
  assert.equal(primaryReady.label, "Ready for Campaign");
});

test("progress column uses Partially Enriched / Enrichment Complete / Ready for Campaign", () => {
  assert.equal(PROSPECT_PROGRESS_STATE_LABELS.enriched, "Enrichment Complete");
  assert.equal(PROSPECT_PROGRESS_STATE_LABELS.partially_enriched, "Partially Enriched");
  assert.equal(PROSPECT_PROGRESS_STATE_LABELS.ready_for_campaign, "Ready for Campaign");

  const partialProgress = resolveProspectProgressState({
    ...partialBase,
    decision: "qualified",
    readyForCampaign: false,
  });
  assert.equal(partialProgress.code, "partially_enriched");
  assert.equal(partialProgress.label, "Partially Enriched");

  const completeProgress = resolveProspectProgressState({
    ...partialBase,
    enrichmentEmailFound: true,
    email: "owner@biz.com",
    websiteUrl: "https://biz.com",
    decision: "qualified",
    readyForCampaign: false,
  });
  assert.equal(completeProgress.code, "enriched");
  assert.equal(completeProgress.label, "Enrichment Complete");

  const campaignProgress = resolveProspectProgressState({
    ...partialBase,
    enrichmentEmailFound: true,
    email: "owner@biz.com",
    websiteUrl: "https://biz.com",
    decision: "qualified",
    readyForCampaign: true,
  });
  assert.equal(campaignProgress.code, "ready_for_campaign");
  assert.equal(campaignProgress.label, "Ready for Campaign");
});

test("pre-enrich missing website still uses clear no-website copy", () => {
  const ex = explainCanEnrichProspect({
    analysisStatus: "completed",
    reviewStatus: "pending",
    enrichmentStatus: "none",
    websiteUrl: null,
    email: null,
  });
  assert.equal(ex.ok, false);
  assert.equal(ex.code, "missing_website");
  assert.match(ex.message, /No website available to enrich/i);
});
