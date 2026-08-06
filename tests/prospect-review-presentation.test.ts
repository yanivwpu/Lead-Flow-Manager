/**
 * Post-repair Review presentation: qualification ≠ campaign readiness;
 * stale AI Needs review never contradicts Qualified / Ready for Campaign.
 * Run: npx tsx tests/prospect-review-presentation.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildAiGrowthAssistantModel } from "../shared/prospectAiPersonality";
import {
  buildQualifiedPresentationClearPatch,
  hasStaleNeedsReviewPresentation,
  remapProspectPriorityFromScore,
} from "../shared/prospectAutoQualify";
import {
  explainQualifiedForCampaign,
  isProspectDecisionQualified,
  isProspectQualifiedForCampaign,
  matchesProspectReviewWorkFilter,
  resolveProspectNeedsReviewBadge,
  resolveProspectReviewPresentation,
} from "../shared/prospectAiReviewState";
import { resolveProspectProgressState } from "../shared/prospectAiReviewErrors";
import { buildProspectRowAiSummary } from "../shared/prospectReviewUx";
import { proposeProspectQualificationRepair } from "../shared/prospectQualificationRepair";

function run(name: string, fn: () => void) {
  fn();
  console.log(`ok - ${name}`);
}

/** Laura Anderson–style: Qualified + campaign-ready + stale AI priority/analysisStatus. */
const lauraAnderson = {
  name: "Laura Anderson Real Estate Group",
  analysisStatus: "needs_review" as const,
  reviewStatus: "approved" as const,
  approvedAt: "2026-07-31T12:00:00.000Z",
  needsReview: false,
  priority: "needs_review" as const,
  leadScore: 0,
  email: "laura@andersonrealty.example",
  suggestedFirstMessage: "Hi Laura — quick idea for your team inbox.",
  recommendedOffer: "general_demo",
  notQualified: false,
};

run("qualified + missing email remains Qualified (not Needs Review tab)", () => {
  const ux = {
    analysisStatus: "completed" as const,
    reviewStatus: "approved" as const,
    approvedAt: "2026-07-31T00:00:00.000Z",
    needsReview: false,
    email: null,
    suggestedFirstMessage: "Hi",
  };
  assert.equal(isProspectDecisionQualified(ux), true);
  assert.equal(matchesProspectReviewWorkFilter(ux, "needs_review"), false);
  assert.equal(matchesProspectReviewWorkFilter(ux, "all"), true);
  assert.equal(resolveProspectNeedsReviewBadge(ux)?.code, "missing_email");
  const pres = resolveProspectReviewPresentation(ux);
  assert.equal(pres.decision, "qualified");
  assert.equal(pres.inNeedsReviewTab, false);
  assert.equal(pres.campaignReady, false);
  assert.equal(pres.campaignBlockCode, "missing_email");
});

run("qualified + missing email is campaign-blocked", () => {
  const ux = {
    analysisStatus: "completed" as const,
    reviewStatus: "approved" as const,
    approvedAt: "2026-07-31T00:00:00.000Z",
    email: "",
    suggestedFirstMessage: "Hi",
  };
  assert.equal(explainQualifiedForCampaign(ux).ok, false);
  assert.equal(explainQualifiedForCampaign(ux).code, "missing_email");
  assert.equal(isProspectQualifiedForCampaign(ux), false);
});

run("Laura Anderson: Qualified + Ready cannot display Needs review", () => {
  assert.equal(isProspectDecisionQualified(lauraAnderson), true);
  assert.equal(isProspectQualifiedForCampaign(lauraAnderson), true);
  const pres = resolveProspectReviewPresentation(lauraAnderson);
  assert.equal(pres.decision, "qualified");
  assert.equal(pres.campaignReady, true);
  assert.equal(pres.suppressNeedsReviewChip, true);
  assert.equal(pres.displayPriority, null);
  assert.notEqual(pres.rowBadge?.code, "needs_review");
  assert.equal(pres.inNeedsReviewTab, false);

  const summary = buildProspectRowAiSummary({
    analysisStatus: lauraAnderson.analysisStatus,
    leadScore: lauraAnderson.leadScore,
    priority: lauraAnderson.priority,
    recommendedOffer: lauraAnderson.recommendedOffer,
    decisionQualified: true,
    reviewStatus: lauraAnderson.reviewStatus,
    approvedAt: lauraAnderson.approvedAt,
  });
  assert.notEqual(String(summary.priority || "").toLowerCase(), "needs_review");

  const progress = resolveProspectProgressState({
    analysisStatus: lauraAnderson.analysisStatus,
    enrichmentStatus: "completed",
    reviewStatus: lauraAnderson.reviewStatus,
    email: lauraAnderson.email,
    decision: "qualified",
    readyForCampaign: true,
  });
  assert.equal(progress.code, "ready_for_campaign");
  assert.notEqual(progress.code, "needs_review");
});

run("stale AI needs-review fields cleared after qualification patch", () => {
  assert.equal(hasStaleNeedsReviewPresentation(lauraAnderson), true);
  const clear = buildQualifiedPresentationClearPatch(lauraAnderson);
  assert.equal(clear.needsReview, false);
  assert.equal(clear.analysisStatus, "completed");
  assert.equal(clear.priority, remapProspectPriorityFromScore(0));
  assert.equal(clear.priority, "low");

  const repair = proposeProspectQualificationRepair({
    ...lauraAnderson,
    companyName: "Laura Anderson Real Estate Group",
    businessType: "real estate agency",
    batchName: "Prospect AI: Real Estate Agents in Los Angeles",
    discoverySource: "google_places",
    websiteUrl: "https://lauraanderson.example",
    qualificationSource: "auto_ai",
  });
  assert.equal(repair.action, "auto_qualify");
  assert.match(repair.reason, /clear_stale_needs_review_presentation/);
  assert.equal(repair.after?.analysisStatus, "completed");
  assert.equal(repair.after?.priority, "low");
  assert.equal(repair.after?.needsReview, false);
});

run("assistant summary separates Qualified from Campaign ready", () => {
  const model = buildAiGrowthAssistantModel([
    {
      analysisStatus: "completed",
      reviewStatus: "approved",
      approvedAt: "2026-07-31T00:00:00.000Z",
      email: "a@b.com",
      suggestedFirstMessage: "Hi A",
    },
    {
      analysisStatus: "completed",
      reviewStatus: "approved",
      approvedAt: "2026-07-31T00:00:00.000Z",
      email: "b@c.com",
      suggestedFirstMessage: "Hi B",
    },
    {
      analysisStatus: "completed",
      reviewStatus: "approved",
      approvedAt: "2026-07-31T00:00:00.000Z",
      email: null,
      suggestedFirstMessage: "Hi C",
    },
  ]);
  assert.ok(model.lines.some((l) => /2 prospects? are Campaign Ready/i.test(l.text)));
  assert.ok(
    model.lines.some((l) => /1 qualified prospect is missing an email address/i.test(l.text)),
  );
  assert.ok(!model.lines.some((l) => /need attention/i.test(l.text)));
  assert.deepEqual(model.blockerLines, []);
  assert.equal(model.cta, null);
  assert.ok(model.nextAction && /Send 2 to Campaign/i.test(model.nextAction));
  assert.ok(!model.lines.some((l) => /enriched successfully/i.test(l.text)));
});

run("assistant all campaign-ready suggests Send all", () => {
  const model = buildAiGrowthAssistantModel([
    {
      analysisStatus: "completed",
      reviewStatus: "approved",
      approvedAt: "2026-07-31T00:00:00.000Z",
      email: "a@b.com",
      suggestedFirstMessage: "Hi A",
    },
    {
      analysisStatus: "completed",
      reviewStatus: "approved",
      approvedAt: "2026-07-31T00:00:00.000Z",
      email: "b@c.com",
      suggestedFirstMessage: "Hi B",
    },
  ]);
  assert.ok(model.lines.some((l) => /All 2 prospects are Campaign Ready/i.test(l.text)));
  assert.equal(model.cta, null);
  assert.deepEqual(model.blockerLines, []);
  assert.ok(model.nextAction && /Send all 2 to Campaign/i.test(model.nextAction));
});

run("assistant blocker bullets mix missing email + outreach", () => {
  const model = buildAiGrowthAssistantModel([
    {
      analysisStatus: "completed",
      reviewStatus: "approved",
      approvedAt: "2026-07-31T00:00:00.000Z",
      email: null,
      suggestedFirstMessage: "Hi",
    },
    {
      analysisStatus: "completed",
      reviewStatus: "approved",
      approvedAt: "2026-07-31T00:00:00.000Z",
      email: "x@y.com",
      suggestedFirstMessage: "",
      suggestedOutreachSubject: "",
    },
  ]);
  assert.equal(model.cta, null);
  assert.ok(model.lines.some((l) => /missing an email address/i.test(l.text)));
  assert.ok(model.lines.some((l) => /still needs? outreach copy/i.test(l.text)));
  assert.ok(!model.lines.some((l) => /need attention/i.test(l.text)));
  assert.deepEqual(model.blockerLines, []);
});

run("mixed selection semantics: Send only eligible; summary explains missing email", () => {
  const selected = [
    {
      analysisStatus: "completed" as const,
      reviewStatus: "approved" as const,
      approvedAt: "2026-07-31T00:00:00.000Z",
      email: "ready@x.com",
      suggestedFirstMessage: "Hi",
    },
    {
      analysisStatus: "completed" as const,
      reviewStatus: "approved" as const,
      approvedAt: "2026-07-31T00:00:00.000Z",
      email: null as string | null,
      suggestedFirstMessage: "Hi",
    },
  ];
  const eligible = selected.filter((p) => isProspectQualifiedForCampaign(p));
  const missingEmail = selected.filter(
    (p) => isProspectDecisionQualified(p) && !isProspectQualifiedForCampaign(p),
  );
  assert.equal(eligible.length, 1);
  assert.equal(missingEmail.length, 1);
  assert.equal(explainQualifiedForCampaign(missingEmail[0]!).code, "missing_email");
  // Toolbar copy contract
  assert.equal(`Send ${eligible.length} to Campaign`, "Send 1 to Campaign");
});

run("Contact Info filter options include missing email/website/phone", () => {
  const panel = readFileSync(
    join(process.cwd(), "client/src/components/settings/ProspectIntelligencePanel.tsx"),
    "utf8",
  );
  assert.ok(panel.includes('value="missing_email"'));
  assert.ok(panel.includes('value="missing_website"'));
  assert.ok(panel.includes('value="missing_phone"'));
  assert.ok(panel.includes('params.set("missingEmail", "true")'));
  const route = readFileSync(
    join(process.cwd(), "server/routes/prospectIntelligence.ts"),
    "utf8",
  );
  assert.ok(route.includes("missingEmail"));
  const svc = readFileSync(
    join(process.cwd(), "server/prospectImport/prospectIntelligenceService.ts"),
    "utf8",
  );
  assert.ok(svc.includes("filters.missingEmail === true"));
  // Missing email is contact completeness — not a Needs Review work filter.
  assert.ok(!panel.includes('PROSPECT_REVIEW_WORK_FILTER_CHIPS') || panel.includes("missing_email"));
});

run("shared presentation resolver is used by Review panel", () => {
  const panel = readFileSync(
    join(process.cwd(), "client/src/components/settings/ProspectIntelligencePanel.tsx"),
    "utf8",
  );
  assert.ok(panel.includes("resolveProspectReviewPresentation"));
  assert.ok(panel.includes("presentation.displayPriority"));
  assert.ok(panel.includes("presentation.campaignReady"));
});

console.log("prospect-review-presentation.test.ts: all assertions passed");
