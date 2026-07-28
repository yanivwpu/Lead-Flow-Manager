/**
 * Legacy qualification decision compatibility + enrichment must not reset Qualified.
 * Run: npx tsx tests/prospect-qualification-legacy.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  countProspectReviewWorkStates,
  hasLegacyProspectApprovalEvidence,
  isProspectDecisionQualified,
  isQualifiedForEmailCampaign,
  matchesProspectReviewWorkFilter,
  resolveProspectNeedsReviewBadge,
  resolveProspectReviewWorkState,
} from "../shared/prospectAiReviewState";

const root = join(import.meta.dirname, "..");

// legacy reviewStatus=approved + no extra fields → Qualified
{
  const ux = {
    analysisStatus: "completed" as const,
    reviewStatus: "approved" as const,
    enrichmentStatus: "completed" as const,
  };
  assert.equal(isProspectDecisionQualified(ux), true);
  assert.equal(matchesProspectReviewWorkFilter(ux, "qualified"), true);
  assert.equal(matchesProspectReviewWorkFilter(ux, "needs_review"), false);
}

// legacy approvedAt with reviewStatus overwritten to pending → still Qualified
{
  const ux = {
    analysisStatus: "completed" as const,
    reviewStatus: "pending" as const,
    enrichmentStatus: "completed" as const,
    approvedAt: "2026-07-27T06:00:30.000Z",
    approvedByUserId: "user-1",
    enrichmentTriggeredBy: "approve",
    email: "a@b.com",
  };
  assert.equal(hasLegacyProspectApprovalEvidence(ux), true);
  assert.equal(isProspectDecisionQualified(ux), true);
  assert.equal(matchesProspectReviewWorkFilter(ux, "qualified"), true);
  assert.equal(matchesProspectReviewWorkFilter(ux, "needs_review"), false);
  assert.equal(resolveProspectReviewWorkState(ux), "qualified");
}

// enrichmentTriggeredBy=approve alone → Qualified (legacy Enrich/Approve path)
{
  const ux = {
    analysisStatus: "completed" as const,
    reviewStatus: "pending" as const,
    enrichmentStatus: "completed" as const,
    enrichmentTriggeredBy: "approve",
  };
  assert.equal(isProspectDecisionQualified(ux), true);
  assert.equal(matchesProspectReviewWorkFilter(ux, "qualified"), true);
}

// legacy not_a_fit → Not Qualified (even with approvedAt)
{
  const ux = {
    analysisStatus: "completed" as const,
    reviewStatus: "pending" as const,
    approvedAt: "2026-07-27T06:00:30.000Z",
    enrichmentTriggeredBy: "approve",
    notQualified: true as const,
  };
  assert.equal(isProspectDecisionQualified(ux), false);
  assert.equal(matchesProspectReviewWorkFilter(ux, "not_qualified"), true);
  assert.equal(matchesProspectReviewWorkFilter(ux, "qualified"), false);
}

// no explicit decision → Needs Review
{
  const ux = {
    analysisStatus: "completed" as const,
    reviewStatus: "pending" as const,
    enrichmentStatus: "none" as const,
  };
  assert.equal(isProspectDecisionQualified(ux), false);
  assert.equal(matchesProspectReviewWorkFilter(ux, "needs_review"), true);
  assert.equal(matchesProspectReviewWorkFilter(ux, "qualified"), false);
}

// enriched + no qualification decision remains Needs Review
{
  const ux = {
    analysisStatus: "completed" as const,
    reviewStatus: "pending" as const,
    enrichmentStatus: "completed" as const,
    email: "a@b.com",
    websiteUrl: "https://example.com",
  };
  assert.equal(isProspectDecisionQualified(ux), false);
  assert.equal(matchesProspectReviewWorkFilter(ux, "needs_review"), true);
  assert.equal(matchesProspectReviewWorkFilter(ux, "qualified"), false);
}

// email present alone does not imply Qualified
{
  const ux = {
    analysisStatus: "completed" as const,
    reviewStatus: "needs_review" as const,
    needsReview: true as const,
    enrichmentStatus: "none" as const,
    email: "ready@example.com",
  };
  assert.equal(isProspectDecisionQualified(ux), false);
  assert.equal(isQualifiedForEmailCampaign(ux), false);
}

// human Qualified survives enrichment completion / retry shape (evidence preserved)
{
  const afterEnrich = {
    analysisStatus: "completed" as const,
    reviewStatus: "pending" as const, // wiped by old post-enrich reanalyze
    enrichmentStatus: "completed" as const,
    approvedAt: "2026-07-27T06:00:30.000Z",
    enrichmentTriggeredBy: "approve",
    email: "a@b.com",
    websiteUrl: "https://example.com",
  };
  assert.equal(isProspectDecisionQualified(afterEnrich), true);
  assert.equal(matchesProspectReviewWorkFilter(afterEnrich, "qualified"), true);
}

// email/website edit shape does not clear decision when approvedAt remains
{
  const afterEmailEdit = {
    analysisStatus: "completed" as const,
    reviewStatus: "approved" as const,
    enrichmentStatus: "none" as const,
    approvedAt: "2026-07-28T00:00:00.000Z",
    email: "new@example.com",
    websiteUrl: "https://new.example.com",
  };
  assert.equal(isProspectDecisionQualified(afterEmailEdit), true);
  assert.equal(matchesProspectReviewWorkFilter(afterEmailEdit, "qualified"), true);
}

// tab counts and badges use identical qualification resolution
{
  const items = [
    {
      analysisStatus: "completed" as const,
      reviewStatus: "pending" as const,
      approvedAt: "2026-07-27T06:00:30.000Z",
      enrichmentTriggeredBy: "approve",
      enrichmentStatus: "completed" as const,
      email: "a@b.com",
    },
    {
      analysisStatus: "completed" as const,
      reviewStatus: "pending" as const,
      enrichmentStatus: "completed" as const,
      email: "b@b.com",
    },
    {
      analysisStatus: "completed" as const,
      reviewStatus: "pending" as const,
      notQualified: true as const,
    },
  ];
  const counts = countProspectReviewWorkStates(items);
  assert.equal(counts.qualified, 1);
  assert.equal(counts.needsReview, 1);
  assert.equal(counts.notQualified, 1);
  assert.equal(matchesProspectReviewWorkFilter(items[0]!, "qualified"), true);
  assert.equal(matchesProspectReviewWorkFilter(items[1]!, "needs_review"), true);
  // Campaign-ready approved legacy row has no Needs Review badge
  assert.equal(resolveProspectNeedsReviewBadge(items[0]!), null);
}

// no bulk conversion of enriched prospects to Qualified (resolver only)
{
  const enrichedOnly = {
    analysisStatus: "completed" as const,
    reviewStatus: "pending" as const,
    enrichmentStatus: "completed" as const,
    enrichmentEmailFound: true as const,
    websiteUrlUsed: "https://example.com",
    email: "found@example.com",
  };
  assert.equal(isProspectDecisionQualified(enrichedOnly), false);
}

// analyze persist must preserve approval; enrichment must not be the only qualify signal
{
  const serviceSrc = readFileSync(
    join(root, "server/prospectImport/prospectIntelligenceService.ts"),
    "utf8",
  );
  assert.ok(serviceSrc.includes("Never silently reset an explicit human/legacy qualification decision"));
  assert.ok(serviceSrc.includes("hadApproval"));
  assert.ok(serviceSrc.includes('patch.reviewStatus = "approved"'));

  const enrichSrc = readFileSync(
    join(root, "server/prospectImport/prospectEnrichmentService.ts"),
    "utf8",
  );
  // Post-enrich reanalyze still exists, but analyze persist must preserve approval
  assert.ok(enrichSrc.includes("analyzeProspectContact"));

  const panelSrc = readFileSync(
    join(root, "client/src/components/settings/ProspectIntelligencePanel.tsx"),
    "utf8",
  );
  assert.ok(panelSrc.includes("approvedAt: row.intelligence.approvedAt"));
  assert.ok(panelSrc.includes("enrichmentTriggeredBy: row.intelligence.enrichmentTriggeredBy"));

  const repairSrc = readFileSync(
    join(root, "scripts/repair-prospect-qualification-decisions.ts"),
    "utf8",
  );
  assert.ok(repairSrc.includes("Defaults to dry-run"));
  assert.ok(repairSrc.includes("enrichmentTriggeredBy"));
  assert.ok(!/recommendedOffer.*completed|enrichmentStatus.*qualified/i.test(repairSrc));
}

console.log("prospect-qualification-legacy.test.ts: all assertions passed");
