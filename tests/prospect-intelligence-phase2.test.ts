/**
 * Phase 2 Prospect AI Intelligence tests.
 * Run: npx tsx tests/prospect-intelligence-phase2.test.ts
 */
import assert from "node:assert/strict";
import type { Contact } from "@shared/schema";
import {
  buildInsufficientDataResult,
  buildProspectIntelligenceInput,
  hasInsufficientProspectData,
  parseAndValidateProspectIntelligence,
} from "../server/prospectImport/prospectIntelligenceAi";
import {
  assertInternalImportedProspect,
  isInternalImportedProspect,
  resolvePipelineStageAfterAnalysis,
} from "../server/prospectImport/prospectIntelligenceEligibility";
import { canAccessProspectImportTools } from "../shared/prospectImportAccess";
import { testContact, prospectImportMeta } from "./helpers/prospectImportTestFixtures";

function testEligibility() {
  const imported = testContact({
    id: "c-imported",
    ...prospectImportMeta("job-1"),
    pipelineStage: "Imported",
  });
  assert.equal(isInternalImportedProspect(imported), true);
  assert.doesNotThrow(() => assertInternalImportedProspect(imported));

  const normal = testContact({ id: "c-normal", source: "manual", pipelineStage: "Lead" });
  assert.equal(isInternalImportedProspect(normal), false);
  assert.throws(
    () => assertInternalImportedProspect(normal),
    /only available for internal imported prospects/i,
  );
}

function testPipelineStageTransition() {
  assert.equal(resolvePipelineStageAfterAnalysis("Imported"), "AI Reviewed");
  assert.equal(resolvePipelineStageAfterAnalysis("Contacted"), null);
  assert.equal(resolvePipelineStageAfterAnalysis(null), "AI Reviewed");
}

function testInsufficientDataNeedsReview() {
  const sparse = testContact({
    id: "c-sparse",
    name: "Only Name",
    ...prospectImportMeta("job-2"),
  });
  const input = buildProspectIntelligenceInput(sparse);
  assert.equal(hasInsufficientProspectData(input), true);
  const result = buildInsufficientDataResult("gpt-4o-mini");
  assert.equal(result.needsReview, true);
  assert.equal(result.priority, "needs_review");
  assert.equal(result.potentialFit, "unknown");
  assert.match(result.reasoningSummary || "", /Insufficient/i);
}

function testStructuredValidation() {
  const parsed = parseAndValidateProspectIntelligence(
    {
      industry: "marketing",
      businessType: "digital agency",
      agencyLikelihood: 85,
      shopifyMerchantLikelihood: 10,
      realEstateLikelihood: 5,
      localBusinessLikelihood: 20,
      saasLikelihood: 15,
      potentialFit: "high",
      leadScore: 82,
      priority: "high",
      recommendedOffer: "partner_program",
      suggestedOutreachAngle: "Lead with 30% lifetime partner program.",
      suggestedFirstMessage: "Hi {{name}}, we help agencies unify client messaging.",
      reasoningSummary: "Company notes and GHL tags suggest agency services.",
      needsReview: false,
      confidence: 78,
    },
    "gpt-4o-mini",
  );

  assert.equal(parsed.agencyLikelihood, 85);
  assert.equal(parsed.leadScore, 82);
  assert.equal(parsed.priority, "high");
  assert.equal(parsed.recommendedOffer, "partner_program");
  assert.equal(parsed.analysisStatus, "completed");
  assert.ok(parsed.suggestedFirstMessage);
}

function testNoHallucinatedRequiredFields() {
  const parsed = parseAndValidateProspectIntelligence(
    {
      potentialFit: "high",
      leadScore: 95,
      priority: "high",
      recommendedOffer: "shopify_app",
      suggestedOutreachAngle: "Shopify app",
      suggestedFirstMessage: "You own a Shopify store",
      reasoningSummary: "Claims Shopify store without evidence",
      needsReview: false,
      confidence: 5,
    },
    "gpt-4o-mini",
  );
  assert.equal(parsed.needsReview, true);
  assert.equal(parsed.priority, "needs_review");
}

function testAccessControl() {
  assert.equal(
    canAccessProspectImportTools({ id: "u1", email: "random@example.com" }, { isAdmin: false }),
    false,
  );
  assert.equal(
    canAccessProspectImportTools({ id: "u2", email: "yahabegood@gmail.com" }, { isAdmin: false }),
    true,
  );
  assert.equal(
    canAccessProspectImportTools({ id: "u3", email: "random@example.com" }, { isAdmin: true }),
    true,
  );
}

testEligibility();
testPipelineStageTransition();
testInsufficientDataNeedsReview();
testStructuredValidation();
testNoHallucinatedRequiredFields();
testAccessControl();

console.log("prospect-intelligence-phase2.test.ts: OK");
