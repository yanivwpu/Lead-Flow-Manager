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
  isProspectExplicitlyNotQualified,
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

// Guillermo case: enriched + AI not_a_fit + human approvedAt → Qualified (not Not Qualified)
{
  const guillermo = {
    analysisStatus: "completed" as const,
    reviewStatus: "pending" as const,
    enrichmentStatus: "completed" as const,
    enrichmentTriggeredBy: "approve",
    enrichmentEmailFound: true as const,
    approvedAt: "2026-07-27T06:00:29.998Z",
    approvedByUserId: "user-1",
    notQualified: true as const, // AI recommendedOffer not_a_fit
    email: "gteran@avantiway.com",
    websiteUrlUsed: "https://www.gteran.com/",
  };
  assert.equal(hasLegacyProspectApprovalEvidence(guillermo), true);
  assert.equal(isProspectExplicitlyNotQualified(guillermo), false);
  assert.equal(isProspectDecisionQualified(guillermo), true);
  assert.equal(matchesProspectReviewWorkFilter(guillermo, "qualified"), true);
  assert.equal(matchesProspectReviewWorkFilter(guillermo, "not_qualified"), false);
  assert.equal(isQualifiedForEmailCampaign(guillermo), true);
  assert.equal(resolveProspectReviewWorkState(guillermo), "qualified");
}

// enriched + AI not_a_fit + no human decision → Not Qualified
{
  const ux = {
    analysisStatus: "completed" as const,
    reviewStatus: "pending" as const,
    enrichmentStatus: "completed" as const,
    enrichmentEmailFound: true as const,
    email: "a@b.com",
    websiteUrl: "https://example.com",
    notQualified: true as const,
  };
  assert.equal(isProspectExplicitlyNotQualified(ux), true);
  assert.equal(isProspectDecisionQualified(ux), false);
  assert.equal(matchesProspectReviewWorkFilter(ux, "not_qualified"), true);
  assert.equal(matchesProspectReviewWorkFilter(ux, "qualified"), false);
}

// enriched + human Qualified → Qualified
{
  const ux = {
    analysisStatus: "completed" as const,
    reviewStatus: "approved" as const,
    enrichmentStatus: "completed" as const,
    approvedAt: "2026-07-28T00:00:00.000Z",
    email: "a@b.com",
  };
  assert.equal(isProspectDecisionQualified(ux), true);
  assert.equal(matchesProspectReviewWorkFilter(ux, "qualified"), true);
}

// enrichment completion shape never changes qualification (evidence preserved)
{
  const afterEnrich = {
    analysisStatus: "completed" as const,
    reviewStatus: "pending" as const,
    enrichmentStatus: "completed" as const,
    approvedAt: "2026-07-27T06:00:30.000Z",
    notQualified: true as const,
    email: "a@b.com",
  };
  assert.equal(isProspectDecisionQualified(afterEnrich), true);
}

// manual Not Qualified clears approval → stays Not Qualified
{
  const afterHumanReject = {
    analysisStatus: "completed" as const,
    reviewStatus: "pending" as const,
    enrichmentStatus: "completed" as const,
    approvedAt: null,
    approvedByUserId: null,
    enrichmentTriggeredBy: "approve",
    notQualified: true as const,
    email: "a@b.com",
  };
  assert.equal(hasLegacyProspectApprovalEvidence(afterHumanReject), false);
  assert.equal(isProspectExplicitlyNotQualified(afterHumanReject), true);
  assert.equal(matchesProspectReviewWorkFilter(afterHumanReject, "not_qualified"), true);
}

// manual Not Qualified → Qualified preserves enriched data + campaign eligible
{
  const afterManualQualify = {
    analysisStatus: "completed" as const,
    reviewStatus: "approved" as const,
    enrichmentStatus: "completed" as const,
    enrichmentEmailFound: true as const,
    approvedAt: "2026-07-28T12:00:00.000Z",
    notQualified: false as const,
    email: "gteran@avantiway.com",
    websiteUrlUsed: "https://www.gteran.com/",
  };
  assert.equal(isProspectDecisionQualified(afterManualQualify), true);
  assert.equal(isQualifiedForEmailCampaign(afterManualQualify), true);
  assert.equal(matchesProspectReviewWorkFilter(afterManualQualify, "qualified"), true);
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

// no explicit decision → Needs Review
{
  const ux = {
    analysisStatus: "completed" as const,
    reviewStatus: "pending" as const,
    enrichmentStatus: "none" as const,
  };
  assert.equal(isProspectDecisionQualified(ux), false);
  assert.equal(matchesProspectReviewWorkFilter(ux, "needs_review"), true);
}

// tab counts and badges use identical qualification resolution
{
  const items = [
    {
      analysisStatus: "completed" as const,
      reviewStatus: "pending" as const,
      approvedAt: "2026-07-27T06:00:30.000Z",
      enrichmentStatus: "completed" as const,
      notQualified: true as const,
      email: "a@b.com",
    },
    {
      analysisStatus: "completed" as const,
      reviewStatus: "pending" as const,
      enrichmentStatus: "completed" as const,
      notQualified: true as const,
      email: "b@b.com",
    },
    {
      analysisStatus: "completed" as const,
      reviewStatus: "pending" as const,
      enrichmentStatus: "completed" as const,
      email: "c@b.com",
    },
  ];
  const counts = countProspectReviewWorkStates(items);
  assert.equal(counts.qualified, 1); // approval wins over AI not_a_fit
  assert.equal(counts.notQualified, 1); // AI not_a_fit, no approval
  assert.equal(counts.needsReview, 1);
  assert.equal(matchesProspectReviewWorkFilter(items[0]!, "qualified"), true);
  assert.equal(matchesProspectReviewWorkFilter(items[1]!, "not_qualified"), true);
  assert.equal(resolveProspectNeedsReviewBadge(items[0]!), null);
}

// analyze persist must preserve approval and block AI not_a_fit overwrite
{
  const serviceSrc = readFileSync(
    join(root, "server/prospectImport/prospectIntelligenceService.ts"),
    "utf8",
  );
  assert.ok(serviceSrc.includes("Never silently reset an explicit human/legacy qualification decision"));
  assert.ok(serviceSrc.includes("Never let post-enrich AI rewrite"));
  assert.ok(serviceSrc.includes("clear approval evidence"));

  const panelSrc = readFileSync(
    join(root, "client/src/components/settings/ProspectIntelligencePanel.tsx"),
    "utf8",
  );
  assert.ok(panelSrc.includes("pi-qualification-enrichment-split"));
  assert.ok(panelSrc.includes("Contact data found. Qualification is a separate decision."));
  assert.ok(panelSrc.includes("pi-qualify-qualified"));
  assert.ok(panelSrc.includes("pi-qualify-not-qualified"));
}

console.log("prospect-qualification-legacy.test.ts: all assertions passed");
