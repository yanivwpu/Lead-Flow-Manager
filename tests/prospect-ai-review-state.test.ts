/**
 * Prospect AI Review work-state resolver.
 * Run: npx tsx tests/prospect-ai-review-state.test.ts
 */
import assert from "node:assert/strict";
import {
  canEnrichProspect,
  explainCanEnrichProspect,
  explainQualifiedForCampaign,
  formatProspectBulkActionResult,
  isProspectInCampaigns,
  isProspectInInboxJourney,
  isProspectQualifiedForCampaign,
  isProspectVisibleInReview,
  isQualifiedForEmailCampaign,
  listEmailCampaignBlockingReasons,
  matchesProspectReviewWorkFilter,
  needsHumanReview,
  PROSPECT_REVIEW_WORK_FILTER_CHIPS,
  resolveProspectNeedsAttentionReason,
  resolveProspectReviewWorkState,
  summarizeSelectionActionAvailability,
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
assert.equal(
  formatProspectBulkActionResult("enrich", {
    selected: 2,
    succeeded: 2,
    skipped: 0,
    failed: 0,
  }),
  "2 enrichment jobs started.",
);
assert.equal(
  formatProspectBulkActionResult("enrich", {
    selected: 1,
    succeeded: 1,
    skipped: 0,
    failed: 0,
  }),
  "1 enrichment job started.",
);

{
  const blocked = explainQualifiedForCampaign({
    analysisStatus: "completed",
    reviewStatus: "needs_review",
    needsReview: true,
    enrichmentStatus: "completed",
    email: "a@b.com",
    websiteUrl: "https://x.com",
  });
  // needsReview is advisory — must NOT block Email campaign when hard gates pass
  assert.equal(blocked.ok, true);
  assert.equal(blocked.code, "ok");
  assert.equal(
    needsHumanReview({
      analysisStatus: "completed",
      reviewStatus: "needs_review",
      needsReview: true,
      enrichmentStatus: "completed",
      email: "a@b.com",
    }),
    true,
  );
}

{
  // Missing phone must not block Email campaign (phone is not in hard gates)
  const ok = isQualifiedForEmailCampaign({
    analysisStatus: "completed",
    reviewStatus: "approved",
    needsReview: true,
    enrichmentStatus: "completed",
    email: "sales@example.com",
    websiteUrl: "https://example.com",
  });
  assert.equal(ok, true);
  assert.deepEqual(
    listEmailCampaignBlockingReasons({
      analysisStatus: "completed",
      reviewStatus: "approved",
      needsReview: true,
      enrichmentStatus: "completed",
      email: "sales@example.com",
      websiteUrl: "https://example.com",
    }),
    [],
  );
}

{
  const noEmail = explainQualifiedForCampaign({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "completed",
    websiteUrl: "https://x.com",
  });
  assert.equal(noEmail.ok, false);
  assert.equal(noEmail.code, "missing_email");
  assert.match(noEmail.message, /No valid email/i);
}

{
  const dismissed = explainQualifiedForCampaign({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "completed",
    email: "a@b.com",
    notQualified: true,
  });
  assert.equal(dismissed.ok, false);
  assert.equal(dismissed.code, "not_qualified");
}

{
  const qualFailed = explainQualifiedForCampaign({
    analysisStatus: "failed",
    reviewStatus: "pending",
    email: "a@b.com",
  });
  assert.equal(qualFailed.ok, false);
  assert.equal(qualFailed.code, "qualification_failed");
}

{
  // Enrichment failed but email available → Email campaign still allowed
  const enrichFailWithEmail = explainQualifiedForCampaign({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "failed",
    email: "a@b.com",
    websiteUrl: "https://x.com",
  });
  assert.equal(enrichFailWithEmail.ok, true);
}

{
  // Enrichment failed and no email → block
  const enrichFailNoEmail = explainQualifiedForCampaign({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "failed",
    websiteUrl: "https://x.com",
  });
  assert.equal(enrichFailNoEmail.ok, false);
  assert.ok(
    enrichFailNoEmail.code === "enrichment_failed" ||
      enrichFailNoEmail.code === "missing_email",
  );
}

{
  // Needs Review + website → Enrich enabled (Enrich IS the approval decision)
  const needsReviewEnrichable = {
    analysisStatus: "completed",
    reviewStatus: "needs_review",
    needsReview: true,
    enrichmentStatus: "none",
    email: "a@b.com",
    websiteUrl: "https://x.com",
  } as const;
  assert.equal(canEnrichProspect(needsReviewEnrichable), true);
  assert.equal(explainCanEnrichProspect(needsReviewEnrichable).ok, true);
  assert.equal(explainCanEnrichProspect(needsReviewEnrichable).code, "ok");
  // Same shared resolver for toolbar + detail — identical eligibility
  assert.deepEqual(
    explainCanEnrichProspect(needsReviewEnrichable),
    explainCanEnrichProspect({ ...needsReviewEnrichable }),
  );
}

{
  // Already enriched under Needs Review → Enrich blocked with real reason (not "needs decision")
  const enrichBlocked = explainCanEnrichProspect({
    analysisStatus: "completed",
    reviewStatus: "needs_review",
    needsReview: true,
    enrichmentStatus: "completed",
    email: "a@b.com",
    websiteUrl: "https://x.com",
  });
  assert.equal(enrichBlocked.ok, false);
  assert.equal(enrichBlocked.code, "already_enriched");
}

{
  // Missing enrichment prerequisite → real blocker, not contradictory "enrich first"
  const noWebsite = explainCanEnrichProspect({
    analysisStatus: "completed",
    reviewStatus: "needs_review",
    needsReview: true,
    enrichmentStatus: "none",
  });
  assert.equal(noWebsite.ok, false);
  assert.equal(noWebsite.code, "missing_website");
  assert.match(noWebsite.message, /No website available to enrich/i);

  const qualFailed = explainCanEnrichProspect({
    analysisStatus: "failed",
    reviewStatus: "needs_review",
    needsReview: true,
    enrichmentStatus: "none",
    websiteUrl: "https://x.com",
  });
  assert.equal(qualFailed.ok, false);
  assert.equal(qualFailed.code, "qualification_failed");
  assert.match(qualFailed.message, /Qualification failed/i);

  const alreadyEnriching = explainCanEnrichProspect({
    analysisStatus: "completed",
    reviewStatus: "needs_review",
    needsReview: true,
    enrichmentStatus: "pending",
    websiteUrl: "https://x.com",
  });
  assert.equal(alreadyEnriching.ok, false);
  assert.equal(alreadyEnriching.code, "enrichment_in_progress");
  assert.match(alreadyEnriching.message, /Already enriching/i);
}

{
  // After Enrich (approve) → Enriching work state
  assert.equal(
    resolveProspectReviewWorkState({
      analysisStatus: "completed",
      reviewStatus: "approved",
      needsReview: false,
      enrichmentStatus: "pending",
      websiteUrl: "https://x.com",
      email: "a@b.com",
    }),
    "enriching",
  );
}

{
  // Send copy: "Enrich this prospect…" only when Enrich is actually available
  const ux = {
    analysisStatus: "completed" as const,
    reviewStatus: "needs_review" as const,
    needsReview: true,
    enrichmentStatus: "none" as const,
    email: "a@b.com",
    websiteUrl: "https://x.com",
  };
  const enrich = explainCanEnrichProspect(ux);
  const qualified = explainQualifiedForCampaign(ux);
  assert.equal(enrich.ok, true);
  assert.equal(qualified.ok, false);
  assert.equal(qualified.code, "enrichment_incomplete");
  const avail = summarizeSelectionActionAvailability({
    selectedCount: 1,
    enrichableCount: 1,
    qualifiedCount: 0,
    firstEnrich: enrich,
    firstQualified: qualified,
  });
  assert.match(avail.reason || "", /Enrich this prospect before sending to Campaigns/i);

  const blockedUx = {
    analysisStatus: "failed" as const,
    reviewStatus: "needs_review" as const,
    needsReview: true,
    enrichmentStatus: "none" as const,
    websiteUrl: "https://x.com",
  };
  const blockedEnrich = explainCanEnrichProspect(blockedUx);
  const blockedQualified = explainQualifiedForCampaign(blockedUx);
  const blockedAvail = summarizeSelectionActionAvailability({
    selectedCount: 1,
    enrichableCount: 0,
    qualifiedCount: 0,
    firstEnrich: blockedEnrich,
    firstQualified: blockedQualified,
  });
  assert.equal(blockedEnrich.ok, false);
  assert.match(blockedAvail.reason || "", /Qualification failed/i);
  assert.ok(!/Enrich this prospect/i.test(blockedAvail.reason || ""));
}

{
  const already = explainCanEnrichProspect({
    analysisStatus: "completed",
    reviewStatus: "approved",
    enrichmentStatus: "completed",
    email: "a@b.com",
    websiteUrl: "https://x.com",
  });
  assert.equal(already.ok, false);
  assert.equal(already.code, "already_enriched");
}

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
assert.ok(panelSrc.includes("pi-selection-reason") || panelSrc.includes("availability.reason"));
assert.ok(panelSrc.includes("onEnrichedContactId"));
assert.ok(!panelSrc.includes("pi-campaigns-subfilters"));
// Needs Review is a badge/state; detail Enrich uses shared canEnrichProspect
assert.ok(panelSrc.includes("pi-needs-human-review-badge"));
assert.ok(panelSrc.includes("detailAlreadyNeedsReview"));
assert.ok(panelSrc.includes("pi-not-qualified-button"));
assert.ok(panelSrc.includes("canEnrichProspect(reviewUxInput"));
assert.ok(panelSrc.includes("explainCanEnrichProspect(reviewUxInput"));
assert.match(panelSrc, /detailCanEnrich[\s\S]*canEnrichProspect/);
assert.match(panelSrc, /selectionEligibility[\s\S]*explainCanEnrichProspect|explainCanEnrichProspect\(ux\)/);

const campaignsSrc = readFileSync(
  join(root, "client/src/components/settings/ProspectOutreachQueuePanel.tsx"),
  "utf8",
);
assert.ok(campaignsSrc.includes("PROSPECT_CAMPAIGN_STATUS_FILTERS"));
assert.ok(campaignsSrc.includes("PROSPECT_CAMPAIGN_CONTROL_LABELS.startSending"));
assert.ok(!campaignsSrc.includes('["sending", "Sending"]'));

console.log("prospect-ai-review-state.test.ts: all assertions passed");
