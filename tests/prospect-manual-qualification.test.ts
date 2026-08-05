/**
 * Manual qualification override + enrichment/campaign independence.
 * Run: npx tsx tests/prospect-manual-qualification.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canEnrichProspect,
  countProspectReviewWorkStates,
  enrichDisabledActionLabel,
  explainCanEnrichProspect,
  explainQualifiedForCampaign,
  isProspectDecisionQualified,
  isQualifiedForEmailCampaign,
  listEmailCampaignBlockingReasons,
  matchesProspectReviewWorkFilter,
  resolveProspectReviewWorkState,
} from "../shared/prospectAiReviewState";

const root = join(import.meta.dirname, "..");

// Manual Not Qualified → Qualified (decision only — no enrichment required for tab)
{
  const notQualified = {
    analysisStatus: "completed" as const,
    reviewStatus: "pending" as const,
    enrichmentStatus: "none" as const,
    notQualified: true as const,
    email: "broker@example.com",
    websiteUrl: "https://realbrokers.example",
  };
  assert.equal(matchesProspectReviewWorkFilter(notQualified, "not_qualified"), true);
  assert.equal(matchesProspectReviewWorkFilter(notQualified, "qualified"), false);
  assert.equal(isQualifiedForEmailCampaign(notQualified), false);

  const afterManualQualify = {
    ...notQualified,
    notQualified: false,
    reviewStatus: "approved" as const,
    enrichmentStatus: "none" as const,
    suggestedFirstMessage: "Hi there,",
  };
  assert.equal(isProspectDecisionQualified(afterManualQualify), true);
  assert.equal(matchesProspectReviewWorkFilter(afterManualQualify, "qualified"), true);
  assert.equal(matchesProspectReviewWorkFilter(afterManualQualify, "needs_review"), false);
  assert.equal(matchesProspectReviewWorkFilter(afterManualQualify, "not_qualified"), false);
  // Has email → campaign eligible without enrichment
  assert.equal(isQualifiedForEmailCampaign(afterManualQualify), true);
  assert.equal(listEmailCampaignBlockingReasons(afterManualQualify).length, 0);
}

// Qualified tab updates / Review counters
{
  const items = [
    {
      analysisStatus: "completed" as const,
      reviewStatus: "approved" as const,
      enrichmentStatus: "none" as const,
      email: "a@b.com",
      suggestedFirstMessage: "Hi there,",
    },
    {
      analysisStatus: "completed" as const,
      reviewStatus: "needs_review" as const,
      needsReview: true as const,
      enrichmentStatus: "none" as const,
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
}

// Manual email preserved + campaign eligible when Qualified
{
  const ux = {
    analysisStatus: "completed" as const,
    reviewStatus: "approved" as const,
    enrichmentStatus: "none" as const,
    email: "manual@broker.com",
    suggestedFirstMessage: "Hi there,",
    websiteUrl: "https://broker.example",
  };
  assert.equal(explainQualifiedForCampaign(ux).ok, true);
  // Website still allows enrichment independently
  assert.equal(canEnrichProspect(ux), true);
}

// Qualified + missing email → enrichment eligible, not campaign eligible
{
  const ux = {
    analysisStatus: "completed" as const,
    reviewStatus: "approved" as const,
    enrichmentStatus: "none" as const,
    websiteUrl: "https://broker.example",
  };
  assert.equal(isProspectDecisionQualified(ux), true);
  assert.equal(matchesProspectReviewWorkFilter(ux, "qualified"), true);
  assert.equal(canEnrichProspect(ux), true);
  assert.equal(explainQualifiedForCampaign(ux).ok, false);
  assert.equal(explainQualifiedForCampaign(ux).code, "missing_email");
}

// Adding email alone does not change qualification
{
  const before = {
    analysisStatus: "completed" as const,
    reviewStatus: "pending" as const,
    enrichmentStatus: "none" as const,
    notQualified: true as const,
  };
  const afterEmailOnly = { ...before, email: "new@example.com" };
  assert.equal(isProspectDecisionQualified(afterEmailOnly), false);
  assert.equal(matchesProspectReviewWorkFilter(afterEmailOnly, "not_qualified"), true);
  assert.equal(matchesProspectReviewWorkFilter(afterEmailOnly, "qualified"), false);
}

// Manual qualification does not require Enrich / approve pipeline for decision
{
  const pendingNotFit = {
    analysisStatus: "completed" as const,
    reviewStatus: "pending" as const,
    enrichmentStatus: "none" as const,
    notQualified: true as const,
    email: "x@y.com",
    suggestedFirstMessage: "Hi there,",
  };
  assert.equal(resolveProspectReviewWorkState(pendingNotFit), "not_qualified");
  const manual = {
    ...pendingNotFit,
    notQualified: false,
    reviewStatus: "approved" as const,
  };
  assert.equal(resolveProspectReviewWorkState(manual), "qualified");
  // Still enrichment-independent: with website can enrich; without website + email → Email Added
  assert.equal(
    enrichDisabledActionLabel({
      analysisStatus: "completed",
      reviewStatus: "approved",
      enrichmentStatus: "none",
      email: "x@y.com",
      suggestedFirstMessage: "Hi there,",
    }),
    "Email Added",
  );
  assert.equal(
    explainCanEnrichProspect({
      analysisStatus: "completed",
      reviewStatus: "approved",
      enrichmentStatus: "none",
      email: "x@y.com",
      suggestedFirstMessage: "Hi there,",
    }).code,
    "email_added",
  );
}

// Enrichment state independent from qualification — human Not Qualified blocks enrich
{
  const ux = {
    analysisStatus: "completed" as const,
    reviewStatus: "pending" as const,
    enrichmentStatus: "none" as const,
    notQualified: true as const,
    websiteUrl: "https://example.com",
    email: "a@b.com",
  };
  assert.equal(canEnrichProspect(ux), false);
  assert.match(explainCanEnrichProspect(ux).message, /Mark as Qualified/i);
}

// True website enrichment shows Enrichment Complete; manual email alone does not
{
  assert.equal(
    enrichDisabledActionLabel({
      analysisStatus: "completed",
      reviewStatus: "approved",
      enrichmentStatus: "completed",
      enrichmentEmailFound: true,
      email: "a@b.com",
      suggestedFirstMessage: "Hi there,",
      websiteUrl: "https://example.com",
      websiteUrlUsed: "https://example.com",
    }),
    "Enrichment Complete",
  );
  assert.equal(
    enrichDisabledActionLabel({
      analysisStatus: "completed",
      reviewStatus: "approved",
      enrichmentStatus: "none",
      email: "manual@only.com",
      suggestedFirstMessage: "Hi there,",
    }),
    "Email Added",
  );
}

// Needs decision before campaign send
{
  const ux = {
    analysisStatus: "completed" as const,
    reviewStatus: "needs_review" as const,
    needsReview: true as const,
    enrichmentStatus: "completed" as const,
    email: "ready@example.com",
    websiteUrl: "https://shop.example.com",
  };
  assert.equal(explainQualifiedForCampaign(ux).ok, false);
  assert.equal(explainQualifiedForCampaign(ux).code, "needs_review");
  assert.match(explainQualifiedForCampaign(ux).message, /Needs review/i);
}

// Panel wires manual qualification controls (no AI re-run / quota on click)
{
  const panelSrc = readFileSync(
    join(root, "client/src/components/settings/ProspectIntelligencePanel.tsx"),
    "utf8",
  );
  assert.ok(panelSrc.includes("pi-qualification-controls"));
  assert.ok(panelSrc.includes("pi-qualify-qualified"));
  assert.ok(panelSrc.includes("pi-qualify-not-qualified"));
  // Needs Review is status (header badge via primary resolver), not a footer action button
  assert.ok(!panelSrc.includes("pi-qualify-needs-review"));
  assert.ok(panelSrc.includes("resolveProspectDetailPrimaryStatus"));
  assert.ok(panelSrc.includes("/qualification"));
  assert.ok(panelSrc.includes("onQualificationChanged"));
  assert.ok(panelSrc.includes("does not re-run AI"));
  assert.ok(panelSrc.includes("Retry Qualification"));
  assert.ok(!panelSrc.includes("pi-enrich-disabled-button"));
  // Old hide-current-state buttons removed
  assert.ok(!panelSrc.includes("detailAlreadyNeedsReview"));
  assert.ok(!panelSrc.includes('data-testid="pi-not-qualified-button"'));
}

{
  const serviceSrc = readFileSync(
    join(root, "server/prospectImport/prospectIntelligenceService.ts"),
    "utf8",
  );
  assert.ok(serviceSrc.includes("setProspectQualificationDecision"));
  assert.ok(serviceSrc.includes("does not enqueue enrichment") || serviceSrc.includes("NO enrichment") || serviceSrc.includes("does not enqueue enrichment") || /Manual human qualification override/.test(serviceSrc));
  // Manual qualify path must not call enqueueProspectEnrichment
  const fnStart = serviceSrc.indexOf("export async function setProspectQualificationDecision");
  const fnEnd = serviceSrc.indexOf("export async function patchProspectIntelligence", fnStart);
  const fnBody = serviceSrc.slice(fnStart, fnEnd);
  assert.ok(!fnBody.includes("enqueueProspectEnrichment"));
  assert.ok(!fnBody.includes("analyzeProspectContact"));
}

console.log("prospect-manual-qualification.test.ts: all assertions passed");
