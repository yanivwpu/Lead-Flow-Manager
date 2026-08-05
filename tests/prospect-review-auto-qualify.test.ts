/**
 * Simplified Review: auto-qualify, 3 filters, campaign readiness.
 * Run: npx tsx tests/prospect-review-auto-qualify.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  hasClearBusinessIdentity,
  hasHumanQualificationLock,
  shouldAutoQualifyFromAiResult,
} from "../shared/prospectAutoQualify";
import {
  explainQualifiedForCampaign,
  isProspectAwaitingHumanReview,
  isProspectDecisionQualified,
  listEmailCampaignBlockingReasons,
  matchesProspectReviewWorkFilter,
  PROSPECT_REVIEW_WORK_FILTER_CHIPS,
  resolveProspectNeedsReviewBadge,
} from "../shared/prospectAiReviewState";

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

run("no Qualified tab — three filters only", () => {
  assert.deepEqual(
    PROSPECT_REVIEW_WORK_FILTER_CHIPS.map((c) => c.id),
    ["all", "needs_review", "not_qualified"],
  );
  assert.ok(!PROSPECT_REVIEW_WORK_FILTER_CHIPS.some((c) => c.id === "qualified"));
});

run("successful AI Review + clear fit → auto-qualify rule", () => {
  assert.equal(
    shouldAutoQualifyFromAiResult({
      analysisStatus: "completed",
      needsReview: false,
      recommendedOffer: "general_demo",
      potentialFit: "high",
      confidence: 80,
      name: "Bright Smile Dental",
      businessType: "Dental Clinics",
      websiteUrl: "https://bright.example",
    }),
    true,
  );
  assert.equal(hasClearBusinessIdentity({ name: "Bright Smile", businessType: "Dental Clinics" }), true);
});

run("auto-qualified remains in All; not forced into Needs Review", () => {
  const ux = {
    analysisStatus: "completed" as const,
    reviewStatus: "approved" as const,
    approvedAt: "2026-07-31T00:00:00.000Z",
    needsReview: false,
    enrichmentStatus: "failed" as const,
    email: "a@b.com",
    suggestedFirstMessage: "Hi there,",
    notQualified: false,
  };
  assert.equal(isProspectDecisionQualified(ux), true);
  assert.equal(isProspectAwaitingHumanReview(ux), false);
  assert.equal(matchesProspectReviewWorkFilter(ux, "all"), true);
  assert.equal(matchesProspectReviewWorkFilter(ux, "needs_review"), false);
  assert.equal(resolveProspectNeedsReviewBadge(ux)?.code, "qualified");
});

run("qualified + valid email + outreach → campaign eligible", () => {
  const ux = {
    analysisStatus: "completed" as const,
    reviewStatus: "approved" as const,
    approvedAt: "2026-07-31T00:00:00.000Z",
    email: "ready@example.com",
    suggestedFirstMessage: "Hi there, quick intro.",
    enrichmentStatus: "none" as const,
  };
  assert.equal(explainQualifiedForCampaign(ux).ok, true);
});

run("qualified + missing email remains qualified but campaign-blocked", () => {
  const ux = {
    analysisStatus: "completed" as const,
    reviewStatus: "approved" as const,
    approvedAt: "2026-07-31T00:00:00.000Z",
    email: "",
    suggestedFirstMessage: "Hi there,",
    enrichmentStatus: "failed" as const,
  };
  assert.equal(isProspectDecisionQualified(ux), true);
  assert.equal(explainQualifiedForCampaign(ux).ok, false);
  assert.equal(explainQualifiedForCampaign(ux).code, "missing_email");
  assert.match(explainQualifiedForCampaign(ux).message, /Email required for Campaign/i);
  assert.equal(resolveProspectNeedsReviewBadge(ux)?.code, "missing_email");
});

run("qualified + enrichment failure remains qualified", () => {
  const ux = {
    analysisStatus: "completed" as const,
    reviewStatus: "approved" as const,
    approvedAt: "2026-07-31T00:00:00.000Z",
    email: "a@b.com",
    suggestedFirstMessage: "Hi there,",
    enrichmentStatus: "failed" as const,
    websiteUrl: "https://example.com",
  };
  assert.equal(isProspectDecisionQualified(ux), true);
  assert.equal(matchesProspectReviewWorkFilter(ux, "needs_review"), false);
  assert.equal(explainQualifiedForCampaign(ux).ok, true);
});

run("qualified + outreach failure remains qualified but campaign-blocked", () => {
  const ux = {
    analysisStatus: "completed" as const,
    reviewStatus: "approved" as const,
    approvedAt: "2026-07-31T00:00:00.000Z",
    email: "a@b.com",
    suggestedFirstMessage: "",
    suggestedOutreachSubject: "",
    enrichmentStatus: "completed" as const,
  };
  assert.equal(isProspectDecisionQualified(ux), true);
  const ex = explainQualifiedForCampaign(ux);
  assert.equal(ex.ok, false);
  assert.equal(ex.code, "outreach_needed");
  assert.match(ex.message, /Retry outreach/i);
});

run("low score alone does not make Not Qualified", () => {
  assert.equal(
    shouldAutoQualifyFromAiResult({
      analysisStatus: "completed",
      needsReview: false,
      recommendedOffer: "general_demo",
      potentialFit: "medium",
      confidence: 40,
      leadScore: 22 as never,
      name: "Local Spa",
      businessType: "Med Spas",
      websiteUrl: "https://spa.example",
    }),
    true,
  );
});

run("strong wrong-industry evidence does make Not Qualified path", () => {
  assert.equal(
    shouldAutoQualifyFromAiResult({
      analysisStatus: "completed",
      needsReview: false,
      recommendedOffer: "not_a_fit",
      potentialFit: "low",
      confidence: 90,
      name: "Job Board Inc",
      businessType: "Job Board",
    }),
    false,
  );
  const ux = {
    analysisStatus: "completed" as const,
    reviewStatus: "pending" as const,
    notQualified: true,
    recommendedOffer: "not_a_fit",
  };
  assert.equal(matchesProspectReviewWorkFilter(ux, "not_qualified"), true);
  assert.equal(matchesProspectReviewWorkFilter(ux, "needs_review"), false);
  assert.equal(explainQualifiedForCampaign(ux).ok, false);
});

run("mixed selection: only eligible qualified rows are campaign-ready", () => {
  const rows = [
    {
      analysisStatus: "completed" as const,
      reviewStatus: "approved" as const,
      approvedAt: "x",
      email: "a@b.com",
      suggestedFirstMessage: "Hi",
    },
    {
      analysisStatus: "completed" as const,
      reviewStatus: "approved" as const,
      approvedAt: "x",
      email: "",
      suggestedFirstMessage: "Hi",
    },
    {
      analysisStatus: "completed" as const,
      reviewStatus: "needs_review" as const,
      needsReview: true,
      email: "c@d.com",
      suggestedFirstMessage: "Hi",
    },
    {
      analysisStatus: "completed" as const,
      reviewStatus: "pending" as const,
      notQualified: true,
      email: "e@f.com",
      suggestedFirstMessage: "Hi",
    },
  ];
  const ready = rows.filter((r) => explainQualifiedForCampaign(r).ok);
  assert.equal(ready.length, 1);
  const blocks = rows.map((r) => listEmailCampaignBlockingReasons(r).map((b) => b.code));
  assert.ok(blocks[1]!.includes("missing_email"));
  assert.ok(blocks[2]!.includes("needs_review"));
  assert.ok(blocks[3]!.includes("not_qualified"));
});

run("manual Needs Review / Not Qualified overrides automation locks", () => {
  assert.equal(
    hasHumanQualificationLock({
      approvedByUserId: "user-1",
      rawResult: { qualificationSource: "manual" },
    }),
    true,
  );
  assert.equal(
    hasHumanQualificationLock({
      rawResult: { qualificationSource: "manual_needs_review" },
    }),
    true,
  );
  assert.equal(
    hasHumanQualificationLock({
      rawResult: { qualificationSource: "manual_not_qualified" },
    }),
    true,
  );
  assert.equal(
    hasHumanQualificationLock({
      rawResult: { qualificationSource: "auto_ai" },
      approvedByUserId: null,
    }),
    false,
  );
});

run("counts/badges/campaign eligibility share resolver semantics", () => {
  const auto = {
    analysisStatus: "completed" as const,
    reviewStatus: "approved" as const,
    approvedAt: "x",
    email: "a@b.com",
    suggestedFirstMessage: "Hi",
  };
  assert.equal(isProspectDecisionQualified(auto), explainQualifiedForCampaign(auto).ok);
  assert.equal(resolveProspectNeedsReviewBadge(auto)?.code, "qualified");
});

run("panel defaults to All and has no Qualified chip wiring", () => {
  const panelSrc = readFileSync(
    join(root, "client/src/components/settings/ProspectIntelligencePanel.tsx"),
    "utf8",
  );
  assert.ok(panelSrc.includes('useState<ProspectReviewWorkFilter>("all")'));
  assert.ok(!panelSrc.includes('id: "qualified", label: "Qualified"'));
  assert.ok(panelSrc.includes("Send ${selectionEligibility.qualified} to Campaign"));
});

console.log("prospect-review-auto-qualify.test.ts: all assertions passed");
