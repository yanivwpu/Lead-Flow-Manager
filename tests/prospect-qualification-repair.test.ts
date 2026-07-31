/**
 * Legacy qualification repair + Ready-for-Campaign consistency.
 * Run: npx tsx tests/prospect-qualification-repair.test.ts
 */
import assert from "node:assert/strict";
import { proposeProspectQualificationRepair } from "../shared/prospectQualificationRepair";
import {
  explainQualifiedForCampaign,
  isProspectAwaitingHumanReview,
  isProspectDecisionQualified,
  matchesProspectReviewWorkFilter,
} from "../shared/prospectAiReviewState";
import {
  resolveProspectDetailPrimaryStatus,
  resolveProspectProgressState,
} from "../shared/prospectAiReviewErrors";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (err) {
    console.error(`fail ${name}`);
    throw err;
  }
}

run("legacy completed clear-fit row becomes auto-qualified", () => {
  const proposal = proposeProspectQualificationRepair({
    name: "LA Premier Realty",
    businessType: "Real Estate Agents",
    batchName: "Prospect AI: Real Estate Agents in Los Angeles",
    discoverySource: "google_places",
    websiteUrl: "https://lapremier.example",
    analysisStatus: "completed",
    reviewStatus: "pending",
    needsReview: true,
    priority: "needs_review",
    recommendedOffer: "general_demo",
    potentialFit: "high",
    leadScore: 78,
    confidence: 70,
  });
  assert.equal(proposal.action, "auto_qualify");
  assert.equal(proposal.after?.reviewStatus, "approved");
  assert.equal(proposal.after?.needsReview, false);
  assert.equal(proposal.after?.qualificationSource, "auto_ai");
});

run("stale soft not_a_fit is reconciled", () => {
  const proposal = proposeProspectQualificationRepair({
    name: "Sunset Brokers",
    businessType: "Real Estate Agents",
    batchName: "Prospect AI: Real Estate Agents in Los Angeles",
    discoverySource: "google_places",
    websiteUrl: "https://sunset.example",
    analysisStatus: "completed",
    reviewStatus: "pending",
    needsReview: false,
    recommendedOffer: "not_a_fit",
    potentialFit: "high",
    leadScore: 88,
    confidence: 80,
    reasoningSummary: "Legitimate brokerage but different industry than CRM.",
  });
  assert.equal(proposal.action, "auto_qualify");
  assert.equal(proposal.staleSoftNotAFit, true);
  assert.equal(proposal.after?.recommendedOffer, "general_demo");
});

run("explicit manual Not Qualified remains Not Qualified", () => {
  const proposal = proposeProspectQualificationRepair({
    name: "Rejected Co",
    businessType: "Real Estate Agents",
    analysisStatus: "completed",
    reviewStatus: "pending",
    recommendedOffer: "not_a_fit",
    rawResult: { qualificationSource: "manual_not_qualified" },
    leadScore: 90,
  });
  assert.equal(proposal.action, "keep_not_qualified");
  assert.equal(proposal.preservedManualDecision, true);
});

run("genuine wrong-industry contradiction remains Not Qualified", () => {
  const proposal = proposeProspectQualificationRepair({
    name: "Apartment Seeker Blog",
    businessType: "blog",
    analysisStatus: "completed",
    reviewStatus: "pending",
    recommendedOffer: "not_a_fit",
    potentialFit: "low",
    leadScore: 20,
    reasoningSummary: "Residential consumer / personal blog — not a business buyer.",
  });
  assert.equal(proposal.action, "keep_not_qualified");
  assert.equal(proposal.genuineStrongReject, true);
});

run("Needs Review only for real exceptions", () => {
  const proposal = proposeProspectQualificationRepair({
    name: "??",
    analysisStatus: "completed",
    reviewStatus: "needs_review",
    needsReview: true,
    recommendedOffer: "general_demo",
    potentialFit: "unknown",
    confidence: 10,
  });
  assert.equal(proposal.action, "keep_needs_review");
  assert.match(proposal.reason, /identity|insufficient|uncertainty/i);
});

run("Ready for Campaign can never coexist with Needs Review or Not Qualified", () => {
  for (const decision of ["needs_review", "not_qualified"] as const) {
    const primary = resolveProspectDetailPrimaryStatus({
      analysisStatus: "completed",
      decision,
      readyForCampaign: true,
    });
    assert.notEqual(primary.code, "ready_for_campaign");
    assert.equal(primary.code, decision);

    const progress = resolveProspectProgressState({
      analysisStatus: "completed",
      enrichmentStatus: "completed",
      reviewStatus: "pending",
      email: "a@b.com",
      decision,
      notQualified: decision === "not_qualified",
      readyForCampaign: true,
    });
    assert.notEqual(progress.code, "ready_for_campaign");
  }

  const uxNeeds = {
    analysisStatus: "completed" as const,
    reviewStatus: "needs_review" as const,
    needsReview: true,
    email: "a@b.com",
    suggestedFirstMessage: "Hi",
  };
  assert.equal(matchesProspectReviewWorkFilter(uxNeeds, "needs_review"), true);
  assert.equal(explainQualifiedForCampaign(uxNeeds).ok, false);

  const uxNot = {
    analysisStatus: "completed" as const,
    reviewStatus: "pending" as const,
    notQualified: true,
    email: "a@b.com",
    suggestedFirstMessage: "Hi",
  };
  assert.equal(matchesProspectReviewWorkFilter(uxNot, "not_qualified"), true);
  assert.equal(explainQualifiedForCampaign(uxNot).ok, false);
});

run("tabs/badges/campaign eligibility share resolver semantics after repair", () => {
  const repaired = {
    analysisStatus: "completed" as const,
    reviewStatus: "approved" as const,
    approvedAt: "2026-07-31T00:00:00.000Z",
    needsReview: false,
    email: "a@b.com",
    suggestedFirstMessage: "Hi there,",
    notQualified: false,
  };
  assert.equal(isProspectDecisionQualified(repaired), true);
  assert.equal(isProspectAwaitingHumanReview(repaired), false);
  assert.equal(matchesProspectReviewWorkFilter(repaired, "needs_review"), false);
  assert.equal(matchesProspectReviewWorkFilter(repaired, "all"), true);
  assert.equal(explainQualifiedForCampaign(repaired).ok, true);
  const primary = resolveProspectDetailPrimaryStatus({
    analysisStatus: "completed",
    decision: "qualified",
    readyForCampaign: true,
  });
  assert.equal(primary.code, "ready_for_campaign");
});

run("legacy analysisStatus=needs_review + soft not_a_fit still auto-qualifies", () => {
  const proposal = proposeProspectQualificationRepair({
    name: "Richard Schulman - Keller Williams Realty",
    businessType: "real estate agency",
    batchName: "Prospect AI: Real Estate Agents in Los Angeles",
    discoverySource: "google_places",
    websiteUrl: "https://kw.example",
    analysisStatus: "needs_review",
    reviewStatus: "needs_review",
    needsReview: true,
    recommendedOffer: "not_a_fit",
    potentialFit: "low",
    leadScore: 0,
    reasoningSummary:
      "The prospect operates as a real estate agency, which does not align with the AI Brain context for outreach.",
  });
  assert.equal(proposal.action, "auto_qualify");
  assert.equal(proposal.staleSoftNotAFit, true);
});

run("repair is idempotent for already auto-qualified rows", () => {
  const once = proposeProspectQualificationRepair({
    name: "Already Good Realty",
    businessType: "Real Estate Agents",
    batchName: "Prospect AI: Real Estate Agents in Los Angeles",
    discoverySource: "google_places",
    websiteUrl: "https://good.example",
    analysisStatus: "completed",
    reviewStatus: "approved",
    approvedAt: "2026-07-01T00:00:00.000Z",
    needsReview: false,
    recommendedOffer: "general_demo",
    potentialFit: "high",
    leadScore: 80,
    rawResult: { qualificationSource: "auto_ai" },
  });
  assert.equal(once.action, "keep_qualified");
  assert.equal(once.after, null);
});

console.log("prospect-qualification-repair.test.ts: all assertions passed");
