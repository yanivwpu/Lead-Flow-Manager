/**
 * Prospect AI fit/score/offer consistency — generic ICP / search-intent prior.
 * Run: npx tsx tests/prospect-ai-fit-consistency.test.ts
 */
import assert from "node:assert/strict";
import {
  buildProspectIntelligencePrompt,
  hasDiscoverySearchIntentPrior,
  hasStrongFitRejectEvidence,
  hasWorkspaceIcpAlignmentPrior,
  parseAndValidateProspectIntelligence,
  reconcileFitScoreAndOffer,
  type ProspectIntelligenceAiInput,
  type ProspectWorkspaceBusinessContext,
} from "../server/prospectImport/prospectIntelligenceAi";
import { buildProspectRowAiSummary } from "../shared/prospectReviewUx";

function discoveryInput(
  businessType: string,
  name: string,
  extras: Partial<ProspectIntelligenceAiInput> = {},
): ProspectIntelligenceAiInput {
  return {
    name,
    company: name,
    businessType,
    batchName: `Prospect AI: ${businessType} in Miami`,
    importReason: "Local prospect discovery",
    websiteUrl: `https://example.com/${encodeURIComponent(name)}`,
    originalTags: [],
    discoverySource: "google_places",
    ...extras,
  };
}

function workspaceBrain(partial: Partial<ProspectWorkspaceBusinessContext>): ProspectWorkspaceBusinessContext {
  return {
    configured: true,
    aiBrainIsPrimary: true,
    hasAiBrain: true,
    hasBusinessProfile: true,
    fallbackUsed: "ai_brain",
    displayName: partial.displayName || "Seller Co",
    businessName: partial.businessName || "Seller Co",
    ...partial,
  };
}

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (err) {
    console.error(`fail ${name}`);
    throw err;
  }
}

run("search-intent prior is industry-agnostic (dental / med spa / roofing / realtor)", () => {
  assert.equal(hasDiscoverySearchIntentPrior(discoveryInput("Dental Clinics", "Bright Smile Dental")), true);
  assert.equal(hasDiscoverySearchIntentPrior(discoveryInput("Med Spas", "Glow Med Spa")), true);
  assert.equal(hasDiscoverySearchIntentPrior(discoveryInput("Roofing Companies", "A1 Roofing")), true);
  assert.equal(
    hasDiscoverySearchIntentPrior(discoveryInput("Real Estate Agents", "Miami Premier Realty")),
    true,
  );
  // No discovery / no selected type → not a search-intent prior
  assert.equal(
    hasDiscoverySearchIntentPrior({
      name: "Random Import",
      originalTags: [],
      businessType: "blog",
    }),
    false,
  );
});

run("dental consultant + dental clinic discovery → rewrite soft not_a_fit", () => {
  const input = discoveryInput("Dental Clinics", "Bright Smile Dental");
  const workspace = workspaceBrain({
    industry: "dental consulting",
    servicesProducts: "Consulting and growth systems for dental clinics",
    salesGoals: "Book demos with multi-chair dental practices",
  });
  const parsed = parseAndValidateProspectIntelligence(
    {
      industry: "dental",
      businessType: "dental clinic",
      potentialFit: "high",
      leadScore: 88,
      priority: "high",
      recommendedOffer: "not_a_fit",
      suggestedOutreachAngle: "No CRM visible — maybe not a tech buyer",
      suggestedFirstMessage: "Hi there,",
      reasoningSummary: "Legitimate dental clinic but different industry than consulting software.",
      needsReview: false,
      confidence: 80,
    },
    "test-model",
    input,
    workspace,
  );
  assert.notEqual(parsed.recommendedOffer, "not_a_fit");
  assert.ok((parsed.leadScore ?? 0) >= 70);
});

run("med spa marketer + med spa discovery → rewrite soft not_a_fit", () => {
  const parsed = parseAndValidateProspectIntelligence(
    {
      industry: "med_spa",
      businessType: "medical spa",
      potentialFit: "medium",
      leadScore: 76,
      priority: "medium",
      recommendedOffer: "not_a_fit",
      suggestedOutreachAngle: "Lacks automation stack",
      suggestedFirstMessage: "Hi there,",
      reasoningSummary: "Clear med spa website; no marketing automation detected so poor fit.",
      needsReview: false,
      confidence: 75,
    },
    "test-model",
    discoveryInput("Med Spas", "Glow Med Spa"),
    workspaceBrain({
      industry: "marketing",
      servicesProducts: "Patient acquisition marketing for med spas",
    }),
  );
  assert.equal(parsed.recommendedOffer, "general_demo");
  assert.ok((parsed.leadScore ?? 0) >= 70);
});

run("contractor SaaS + roofing discovery → rewrite soft not_a_fit", () => {
  const parsed = parseAndValidateProspectIntelligence(
    {
      industry: "construction",
      businessType: "roofing contractor",
      potentialFit: "high",
      leadScore: 84,
      priority: "high",
      recommendedOffer: "not_a_fit",
      suggestedOutreachAngle: "Not a SaaS company",
      suggestedFirstMessage: "Hi there,",
      reasoningSummary: "Roofing company exists but is not a software business.",
      needsReview: false,
      confidence: 82,
    },
    "test-model",
    discoveryInput("Roofing Companies", "A1 Roofing"),
    workspaceBrain({
      industry: "construction tech",
      servicesProducts: "SaaS scheduling and estimating for roofing contractors",
    }),
  );
  assert.equal(parsed.recommendedOffer, "general_demo");
});

run("unrelated industry mismatch without search prior stays not_a_fit and clamps score", () => {
  const reconciled = reconcileFitScoreAndOffer(
    {
      industry: "roofing",
      businessType: "roofing contractor",
      potentialFit: "high",
      leadScore: 90,
      priority: "high",
      recommendedOffer: "not_a_fit",
      needsReview: false,
      reasoningSummary: "Roofing contractor — unrelated to dental consulting ICP.",
      analysisStatus: "completed",
      reviewStatus: "pending",
    } as never,
    {
      name: "A1 Roofing",
      company: "A1 Roofing",
      originalTags: [],
      businessType: "Roofing Companies",
      // no discoverySource / batch → no search-intent prior
    },
    workspaceBrain({
      industry: "dental consulting",
      servicesProducts: "Ops consulting for dental clinics only",
    }),
  );
  assert.equal(reconciled.recommendedOffer, "not_a_fit");
  assert.ok((reconciled.leadScore ?? 100) <= 35);
  assert.equal(reconciled.potentialFit, "low");
});

run("workspace ICP alignment can provide positive prior without discovery", () => {
  assert.equal(
    hasWorkspaceIcpAlignmentPrior(
      { name: "Imported Dental", originalTags: [], businessType: "Dental Clinics" },
      { businessType: "dental clinic", industry: "dental" } as never,
      workspaceBrain({
        industry: "dental",
        servicesProducts: "Growth programs for dental clinics",
      }),
    ),
    true,
  );
});

run("strong Brain contradictory evidence blocks rewrite despite search prior", () => {
  const reconciled = reconcileFitScoreAndOffer(
    {
      industry: "education",
      businessType: "university",
      potentialFit: "high",
      leadScore: 91,
      priority: "high",
      recommendedOffer: "not_a_fit",
      needsReview: false,
      reasoningSummary:
        "Per AI Brain ideal customer and sales goals, universities are outside our ICP and explicitly excluded.",
      analysisStatus: "completed",
      reviewStatus: "pending",
    } as never,
    discoveryInput("Universities", "State University"),
    workspaceBrain({
      industry: "B2B SaaS",
      servicesProducts: "Field service software for roofing contractors",
      salesGoals: "Only sell to roofing and HVAC contractors",
      customInstructions: "Do not target universities or schools",
    }),
  );
  assert.equal(hasStrongFitRejectEvidence(reconciled as never, workspaceBrain({})), true);
  assert.equal(reconciled.recommendedOffer, "not_a_fit");
  assert.ok((reconciled.leadScore ?? 100) <= 35);
});

run("high score alone does not rewrite to fit without ICP prior", () => {
  const reconciled = reconcileFitScoreAndOffer(
    {
      potentialFit: "high",
      leadScore: 95,
      priority: "high",
      recommendedOffer: "not_a_fit",
      needsReview: false,
      reasoningSummary: "Looks legitimate but wrong buyer persona.",
      analysisStatus: "completed",
      reviewStatus: "pending",
    } as never,
    { name: "Unknown Co", originalTags: [] },
  );
  assert.equal(reconciled.recommendedOffer, "not_a_fit");
  assert.ok((reconciled.leadScore ?? 100) <= 35);
});

run("realtor discovery still works via generic search-intent (not RE-only rule)", () => {
  const parsed = parseAndValidateProspectIntelligence(
    {
      industry: "real_estate",
      businessType: "real estate brokerage",
      realEstateLikelihood: 90,
      potentialFit: "high",
      leadScore: 90,
      priority: "high",
      recommendedOffer: "not_a_fit",
      suggestedOutreachAngle: "CRM for listing follow-up",
      suggestedFirstMessage: "Hi there,",
      reasoningSummary: "Legitimate brokerage but different industry than CRM.",
      needsReview: false,
      confidence: 80,
    },
    "test-model",
    discoveryInput("Real Estate Agents", "Miami Premier Realty"),
    workspaceBrain({
      servicesProducts: "AI CRM for local service businesses",
    }),
  );
  assert.equal(parsed.recommendedOffer, "general_demo");
});

run("row summary never shows Excellent Match with not_a_fit", () => {
  const summary = buildProspectRowAiSummary({
    analysisStatus: "completed",
    leadScore: 91,
    priority: "high",
    businessType: "dental clinic",
    recommendedOffer: "not_a_fit",
    suggestedOutreachAngle: "Skip",
  });
  assert.equal(summary.matchLabel, "Not a fit");
  assert.equal(summary.matchStars, 1);
});

run("prompt contract is generic (search intent + opportunity), not RE-only", () => {
  const prompt = buildProspectIntelligencePrompt(
    discoveryInput("Dental Clinics", "Bright Smile Dental"),
    workspaceBrain({
      servicesProducts: "Consulting for dental clinics",
      businessName: "DentalOps",
      displayName: "DentalOps",
    }),
  );
  assert.match(prompt, /FIT \/ SCORE CONTRACT/i);
  assert.match(prompt, /industry-agnostic/i);
  assert.match(prompt, /ANY vertical/i);
  assert.match(prompt, /opportunity signal/i);
  assert.doesNotMatch(prompt, /realtor\/brokerage found in a Realtor search/i);
});

console.log("prospect-ai-fit-consistency.test.ts: all assertions passed");
