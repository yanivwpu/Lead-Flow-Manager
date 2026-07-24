/**
 * Prospect Review UX helpers.
 * Run: npx tsx tests/prospect-review-ux.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildProspectRowAiSummary,
  isProspectQualificationComplete,
  isProspectEnrichmentComplete,
  matchesProspectCampaignsSubFilter,
  matchesProspectReviewFilter,
  mergeProspectRowsStableOrder,
  prospectAiProgressMessage,
  prospectMatchSummary,
  prospectReviewCompletionFlash,
  prospectReviewEmptyMessage,
  resolveProspectReviewLifecycle,
  resolveProspectTimelineStates,
  PROSPECT_CAMPAIGNS_SUB_FILTERS,
  PROSPECT_REVIEW_FILTER_CHIPS,
  PROSPECT_REVIEW_LIFECYCLE_LABELS,
  PROSPECT_TIMELINE_STAGES,
} from "../shared/prospectReviewUx";

const root = join(import.meta.dirname, "..");

assert.equal(
  resolveProspectReviewLifecycle({ analysisStatus: "pending" }),
  "imported",
);
assert.equal(
  resolveProspectReviewLifecycle({ analysisStatus: "processing" }),
  "analyzing",
);
assert.equal(
  resolveProspectReviewLifecycle({
    analysisStatus: "completed",
    reviewStatus: "pending",
  }),
  "ready_for_approval",
);

// needs_review is a finished qualification outcome — not "still imported"
assert.equal(
  resolveProspectReviewLifecycle({
    analysisStatus: "needs_review",
    reviewStatus: "needs_review",
    needsReview: true,
  }),
  "ready_for_approval",
);
assert.equal(
  resolveProspectReviewLifecycle({
    analysisStatus: "completed",
    reviewStatus: "needs_review",
    needsReview: true,
  }),
  "ready_for_approval",
);

assert.equal(isProspectQualificationComplete("completed"), true);
assert.equal(isProspectQualificationComplete("needs_review"), true);
assert.equal(isProspectQualificationComplete("pending"), false);
assert.equal(isProspectQualificationComplete("failed"), false);

// Timeline is 3 stages: AI Review · Enriched · Campaign (no Imported)
assert.deepEqual(
  PROSPECT_TIMELINE_STAGES.map((s) => s.id),
  ["ai_review", "enriched", "campaign"],
);
assert.deepEqual(
  PROSPECT_TIMELINE_STAGES.map((s) => s.label),
  ["AI Review", "Enriched", "Campaign"],
);
assert.ok(!PROSPECT_TIMELINE_STAGES.some((s) => s.id === "imported" || s.label === "Imported"));
assert.ok(!PROSPECT_TIMELINE_STAGES.some((s) => s.label === "Website"));
assert.equal(PROSPECT_REVIEW_LIFECYCLE_LABELS.website_intelligence, "Enriched");
assert.equal(
  PROSPECT_REVIEW_FILTER_CHIPS.find((c) => c.id === "website_intelligence")?.label,
  "Enriched",
);

// Analyzing → AI Review current; Enriched/Campaign empty
assert.deepEqual(
  resolveProspectTimelineStates({ analysisStatus: "processing" }),
  ["current", "todo", "todo"],
);

// Ready for approval → AI Review done; not enriched yet
assert.deepEqual(
  resolveProspectTimelineStates({
    analysisStatus: "completed",
    reviewStatus: "pending",
    enrichmentStatus: "none",
  }),
  ["done", "todo", "todo"],
);

// Website URL alone does NOT complete Enriched (enrichment still none)
assert.deepEqual(
  resolveProspectTimelineStates({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "none",
  }),
  ["done", "todo", "todo"],
);
assert.equal(isProspectEnrichmentComplete("none"), false);

// Enriching → Enriched current
assert.deepEqual(
  resolveProspectTimelineStates({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "enriching",
  }),
  ["done", "current", "todo"],
);
assert.equal(
  resolveProspectReviewLifecycle({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "enriching",
  }),
  "website_intelligence",
);

// Successful enrichment → Enriched done; Campaign still empty (Campaign Ready)
assert.deepEqual(
  resolveProspectTimelineStates({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "completed",
  }),
  ["done", "done", "todo"],
);
assert.equal(
  resolveProspectReviewLifecycle({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "completed",
  }),
  "campaign_ready",
);

// Failed enrichment → failed Enriched; Campaign not active
assert.deepEqual(
  resolveProspectTimelineStates({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "failed",
  }),
  ["done", "failed", "todo"],
);

// Campaign Ready must NOT activate Campaign
assert.deepEqual(
  resolveProspectTimelineStates({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "completed",
    queueStatus: null,
  }),
  ["done", "done", "todo"],
);

// Campaign Queue activates Campaign
assert.deepEqual(
  resolveProspectTimelineStates({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "completed",
    queueStatus: "queued",
  }),
  ["done", "done", "current"],
);

// Sending / inbox → Campaign complete
assert.deepEqual(
  resolveProspectTimelineStates({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "completed",
    queueStatus: "sending",
  }),
  ["done", "done", "done"],
);
assert.deepEqual(
  resolveProspectTimelineStates({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "completed",
    outreachStatus: "outreach_sent",
    outreachSentAt: "2026-01-01T00:00:00.000Z",
  }),
  ["done", "done", "done"],
);

// Legacy Inbox (no Website Intelligence) — Enriched still reads complete
assert.deepEqual(
  resolveProspectTimelineStates({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "none",
    outreachStatus: "outreach_sent",
    outreachSentAt: "2026-01-01T00:00:00.000Z",
  }),
  ["done", "done", "done"],
);

assert.equal(prospectMatchSummary(91).label, "Excellent Match");
assert.equal(prospectMatchSummary(91).stars, 5);

assert.equal(
  prospectReviewEmptyMessage("review", true),
  "No businesses waiting for review.",
);
assert.equal(
  prospectReviewEmptyMessage("campaigns", true),
  "No outreach campaigns yet.",
);
assert.equal(
  prospectReviewEmptyMessage("inbox", true),
  "No conversations yet.",
);
assert.equal(
  prospectReviewEmptyMessage("won", true),
  "No customers won yet.",
);
assert.equal(
  PROSPECT_CAMPAIGNS_SUB_FILTERS.find((s) => s.id === "completed")?.label,
  "Sent",
);

assert.equal(
  prospectReviewCompletionFlash(
    { analysisStatus: "processing", reviewStatus: "pending" },
    { analysisStatus: "completed", reviewStatus: "pending" },
  ),
  "✓ AI Review complete",
);

assert.equal(
  prospectReviewCompletionFlash(
    { analysisStatus: "pending", reviewStatus: "pending" },
    { analysisStatus: "needs_review", reviewStatus: "needs_review", needsReview: true },
  ),
  "✓ AI Review complete",
);

assert.equal(
  prospectReviewCompletionFlash(
    {
      analysisStatus: "completed",
      reviewStatus: "approved",
      enrichmentStatus: "enriching",
    },
    {
      analysisStatus: "completed",
      reviewStatus: "approved",
      enrichmentStatus: "completed",
    },
  ),
  "✓ Enriched",
);

assert.ok(prospectAiProgressMessage("analysis", "x", 0).length > 5);
assert.ok(prospectAiProgressMessage("enrichment", "x", 0).length > 5);
assert.equal(matchesProspectReviewFilter("ready_for_approval", "review"), true);

const merged = mergeProspectRowsStableOrder(
  ["b", "a"],
  [
    { contactId: "a", name: "A" },
    { contactId: "c", name: "C" },
    { contactId: "b", name: "B" },
  ],
);
assert.deepEqual(merged.order, ["b", "a", "c"]);
assert.deepEqual(
  merged.items.map((i) => i.contactId),
  ["b", "a", "c"],
);

assert.equal(buildProspectRowAiSummary({ analysisStatus: "pending" }).showSummary, false);

assert.equal(PROSPECT_REVIEW_LIFECYCLE_LABELS.queued, "Campaign Queue");

const panelSrc = readFileSync(
  join(root, "client/src/components/settings/ProspectIntelligencePanel.tsx"),
  "utf8",
);
assert.ok(
  panelSrc.includes("ProspectProgressTimeline ux={ux}") ||
    panelSrc.includes("ProspectProgressTimeline ux={reviewUxInput(row)}"),
);
assert.ok(panelSrc.includes("resolveProspectTimelineStates(ux)"));
assert.ok(panelSrc.includes("ProspectWebsiteGlobeIcon"));
assert.ok(panelSrc.includes("PROSPECT_REVIEW_WORK_FILTER_CHIPS"));
assert.ok(!panelSrc.includes("pi-campaigns-subfilters"));
assert.ok(!panelSrc.includes('label: "Imported"'));
assert.ok(!panelSrc.includes('website: "Web"'));
assert.ok(!panelSrc.includes('pi-filter-campaign_ready'));
assert.ok(!panelSrc.includes('pi-filter-queued'));

console.log("prospect-review-ux.test.ts: all assertions passed");
