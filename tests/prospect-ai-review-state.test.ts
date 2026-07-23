/**
 * Prospect AI Review work-state resolver.
 * Run: npx tsx tests/prospect-ai-review-state.test.ts
 */
import assert from "node:assert/strict";
import {
  canEnrichProspect,
  formatProspectBulkActionResult,
  isProspectInCampaigns,
  isProspectInInboxJourney,
  isProspectQualifiedForCampaign,
  isProspectVisibleInReview,
  matchesProspectReviewWorkFilter,
  PROSPECT_REVIEW_WORK_FILTER_CHIPS,
  resolveProspectNeedsAttentionReason,
  resolveProspectReviewWorkState,
} from "../shared/prospectAiReviewState";
import { resolveProspectTimelineStates } from "../shared/prospectReviewUx";
import { PROSPECT_AI_PRIMARY_TABS, PROSPECT_AI_TAB_LABELS } from "../shared/prospectAiDisplay";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");

assert.deepEqual(
  [...PROSPECT_AI_PRIMARY_TABS],
  ["discover", "review", "campaign", "inbox", "won"],
);
assert.equal(PROSPECT_AI_TAB_LABELS.review, "Review");
assert.ok(!PROSPECT_AI_PRIMARY_TABS.includes("activity" as never));
assert.equal(PROSPECT_AI_TAB_LABELS.activity, "Activity");

assert.deepEqual(
  PROSPECT_REVIEW_WORK_FILTER_CHIPS.map((c) => c.label),
  ["All", "Needs Review", "Enriching", "Qualified", "Needs Attention"],
);

// Needs Review → can Enrich
assert.equal(
  canEnrichProspect({
    analysisStatus: "completed",
    reviewStatus: "pending",
    enrichmentStatus: "none",
    email: "a@b.com",
    websiteUrl: "https://example.com",
  }),
  true,
);

// Not Qualified is never Needs Attention
assert.equal(
  resolveProspectNeedsAttentionReason({
    analysisStatus: "completed",
    reviewStatus: "pending",
    notQualified: true,
  }),
  null,
);
assert.equal(
  resolveProspectReviewWorkState({
    analysisStatus: "completed",
    reviewStatus: "pending",
    notQualified: true,
  }),
  "not_qualified",
);

// Qualification failed → Needs Attention
assert.equal(
  resolveProspectNeedsAttentionReason({
    analysisStatus: "failed",
    reviewStatus: "pending",
  }),
  "qualification_failed",
);

// Enrichment failed → Needs Attention
assert.equal(
  resolveProspectNeedsAttentionReason({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "failed",
    websiteUrl: "https://example.com",
  }),
  "enrichment_failed",
);

// Website present + enrichment complete + email → Qualified
assert.equal(
  isProspectQualifiedForCampaign({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "completed",
    email: "a@b.com",
    websiteUrl: "https://example.com",
  }),
  true,
);

// No website + email → Qualified without enrichment
assert.equal(
  isProspectQualifiedForCampaign({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "none",
    email: "a@b.com",
  }),
  true,
);

// No website + no email → Needs Attention (missing contact)
assert.equal(
  resolveProspectNeedsAttentionReason({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "none",
  }),
  "missing_email",
);

// Website + enrichment complete but no email → Needs Attention
assert.equal(
  resolveProspectNeedsAttentionReason({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "completed",
    websiteUrl: "https://example.com",
  }),
  "missing_email",
);

// Enrichment complete alone is NOT in Campaigns
assert.equal(
  isProspectInCampaigns({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "completed",
  }),
  false,
);

// After Send to Campaign → leave Review
assert.equal(
  isProspectVisibleInReview({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "completed",
    queueStatus: "queued",
    email: "a@b.com",
  }),
  false,
);

// Inbox = reply only, not outreach_sent
assert.equal(
  isProspectInInboxJourney({
    outreachStatus: "outreach_sent",
    outreachSentAt: "2026-01-01",
  }),
  false,
);
assert.equal(
  isProspectInInboxJourney({
    outreachStatus: "replied",
    repliedAt: "2026-01-02",
  }),
  true,
);

// Campaign timeline inactive until transfer
assert.deepEqual(
  resolveProspectTimelineStates({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "completed",
  }),
  ["done", "done", "todo"],
);
assert.deepEqual(
  resolveProspectTimelineStates({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "completed",
    queueStatus: "queued",
  }),
  ["done", "done", "current"],
);

assert.equal(
  matchesProspectReviewWorkFilter(
    {
      analysisStatus: "completed",
      reviewStatus: "approved",
      enrichmentStatus: "completed",
      email: "a@b.com",
      websiteUrl: "https://x.com",
    },
    "qualified",
  ),
  true,
);

assert.equal(
  formatProspectBulkActionResult("enrich", {
    selected: 18,
    succeeded: 12,
    skipped: 4,
    failed: 2,
  }),
  "18 selected · 12 enrichment jobs started · 4 skipped · 2 failed",
);

const pageSrc = readFileSync(join(root, "client/src/pages/ProspectAI.tsx"), "utf8");
assert.ok(pageSrc.includes("PROSPECT_AI_PRIMARY_TABS"));
assert.ok(pageSrc.includes("InboxTab") || pageSrc.includes('value="inbox"'));
assert.ok(pageSrc.includes("prospect-ai-activity-link"));
assert.ok(pageSrc.includes("PROSPECT_AI_TAB_LABELS.activity"));
assert.ok(!pageSrc.includes('["activity", PROSPECT_AI_TAB_LABELS.activity]'));
assert.ok(pageSrc.includes('value="activity"')); // secondary destination still mounted

const panelSrc = readFileSync(
  join(root, "client/src/components/settings/ProspectIntelligencePanel.tsx"),
  "utf8",
);
assert.ok(panelSrc.includes("PROSPECT_REVIEW_WORK_FILTER_CHIPS"));
assert.ok(!panelSrc.includes("PROSPECT_REVIEW_FILTER_CHIPS"));
assert.ok(!panelSrc.includes("Approve to enrich"));
assert.ok(panelSrc.includes("Enrich") || panelSrc.includes("pi-enrich"));
assert.ok(!panelSrc.includes("pi-campaigns-subfilters"));

const campaignsSrc = readFileSync(
  join(root, "client/src/components/settings/ProspectOutreachQueuePanel.tsx"),
  "utf8",
);
assert.ok(campaignsSrc.includes("PROSPECT_CAMPAIGN_STATUS_FILTERS"));
assert.ok(campaignsSrc.includes("PROSPECT_CAMPAIGN_CONTROL_LABELS.startSending"));
assert.ok(!campaignsSrc.includes('["sending", "Sending"]'));

console.log("prospect-ai-review-state.test.ts: all assertions passed");
