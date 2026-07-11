/**
 * Prospect Intelligence outreach message guardrails.
 * Run: npx tsx tests/prospect-intelligence-outreach.test.ts
 */
import assert from "node:assert/strict";
import {
  applyOutreachMessageGuardrails,
  buildNeutralFirstMessage,
  buildProspectIntelligenceInput,
  detectUnsupportedOutreachClaims,
  parseAndValidateProspectIntelligence,
  requiresNeutralOutreachMode,
} from "../server/prospectImport/prospectIntelligenceAi";
import type { ProspectIntelligenceAiInput } from "../server/prospectImport/prospectIntelligenceAi";
import type { ProspectIntelligence } from "@shared/prospectImport";
import { testContact, prospectImportMeta } from "./helpers/prospectImportTestFixtures";

const minimalInput: ProspectIntelligenceAiInput = {
  name: "max zuz",
  email: "max@gmail.com",
  emailDomain: "gmail.com",
  originalTags: [],
};

const needsReviewUnknown: ProspectIntelligence = {
  needsReview: true,
  potentialFit: "unknown",
  priority: "needs_review",
  businessType: "unknown",
  leadScore: 0,
  confidence: 0,
};

// 1. Minimal contact must not produce "noticed your interest"
{
  const hallucinated = parseAndValidateProspectIntelligence(
    {
      potentialFit: "unknown",
      leadScore: 10,
      priority: "needs_review",
      recommendedOffer: "general_demo",
      suggestedOutreachAngle: "General intro",
      suggestedFirstMessage:
        "Hi Max, I noticed your interest in integrated messaging solutions and wanted to reach out.",
      reasoningSummary: "Insufficient business information to classify this prospect reliably.",
      needsReview: true,
      confidence: 15,
    },
    "gpt-4o-mini",
    minimalInput,
  );
  assert.doesNotMatch(hallucinated.suggestedFirstMessage || "", /noticed your interest/i);
  assert.match(hallucinated.suggestedFirstMessage || "", /WhaChatCRM/i);
  assert.match(hallucinated.suggestedFirstMessage || "", /Hi max/i);
}

// 2. Unknown business type must not produce "businesses like yours"
{
  const guarded = applyOutreachMessageGuardrails(
    {
      ...needsReviewUnknown,
      suggestedFirstMessage: "We help businesses like yours streamline customer messaging.",
      suggestedOutreachAngle: "General",
    },
    minimalInput,
  );
  assert.doesNotMatch(guarded.suggestedFirstMessage || "", /businesses like yours/i);
}

// 3. Unknown agency status must not mention "your agency" or "your clients"
{
  const guarded = applyOutreachMessageGuardrails(
    {
      ...needsReviewUnknown,
      agencyLikelihood: 20,
      suggestedFirstMessage: "We help your agency and your clients with unified messaging.",
      suggestedOutreachAngle: "Agency pitch",
    },
    minimalInput,
  );
  assert.doesNotMatch(guarded.suggestedFirstMessage || "", /\byour agency\b/i);
  assert.doesNotMatch(guarded.suggestedFirstMessage || "", /\byour clients\b/i);
}

// 4. needs_review + unknown fit forces neutral outreach mode
{
  assert.equal(requiresNeutralOutreachMode(needsReviewUnknown), true);
  const neutral = buildNeutralFirstMessage(minimalInput);
  const guarded = applyOutreachMessageGuardrails(
    {
      ...needsReviewUnknown,
      suggestedFirstMessage: "I noticed your interest in CRM tools for your store.",
      suggestedOutreachAngle: "Assumptive pitch",
    },
    minimalInput,
  );
  assert.equal(guarded.suggestedFirstMessage, neutral);
  assert.match(guarded.suggestedOutreachAngle || "", /Neutral introduction/i);
}

// 5. Evidence-backed agency prospect may use agency-specific language
{
  const agencyInput: ProspectIntelligenceAiInput = {
    name: "Jane Agency",
    company: "Bright Digital Agency",
    originalTags: ["Agency"],
    importReason: "Agency recruitment",
    importTag: "Imported-Agency",
  };
  const agencyResult: ProspectIntelligence = {
    needsReview: false,
    potentialFit: "high",
    priority: "high",
    businessType: "digital marketing agency",
    industry: "marketing",
    agencyLikelihood: 85,
    leadScore: 80,
    confidence: 75,
  };
  const message = "Hi Jane, our partner program helps agencies manage messaging across your clients.";
  assert.equal(detectUnsupportedOutreachClaims(message, agencyInput, agencyResult).length, 0);
  const guarded = applyOutreachMessageGuardrails(
    { ...agencyResult, suggestedFirstMessage: message, suggestedOutreachAngle: "Partner program" },
    agencyInput,
  );
  assert.match(guarded.suggestedFirstMessage || "", /your clients/i);
}

// 6. Evidence-backed Shopify merchant may use store/ecommerce language
{
  const shopifyInput: ProspectIntelligenceAiInput = {
    name: "Sam Merchant",
    company: "Sam's Shopify Shop",
    originalTags: ["Shopify"],
    importTag: "Imported-Shopify",
  };
  const shopifyResult: ProspectIntelligence = {
    needsReview: false,
    potentialFit: "medium",
    priority: "medium",
    businessType: "ecommerce",
    shopifyMerchantLikelihood: 78,
    leadScore: 65,
    confidence: 70,
  };
  const message = "Hi Sam, our Shopify app helps your store recover abandoned carts via WhatsApp.";
  assert.equal(detectUnsupportedOutreachClaims(message, shopifyInput, shopifyResult).length, 0);
  const guarded = applyOutreachMessageGuardrails(
    { ...shopifyResult, suggestedFirstMessage: message, suggestedOutreachAngle: "Shopify app" },
    shopifyInput,
  );
  assert.match(guarded.suggestedFirstMessage || "", /your store/i);
}

// Real contact fixture: name + email only uses neutral message after insufficient-data path
{
  const contact = testContact({
    id: "c-max",
    name: "max zuz",
    email: "max@gmail.com",
    ...prospectImportMeta("job-max"),
  });
  const input = buildProspectIntelligenceInput(contact);
  const guarded = applyOutreachMessageGuardrails(needsReviewUnknown, input);
  assert.doesNotMatch(guarded.suggestedFirstMessage || "", /noticed your interest/i);
  assert.doesNotMatch(guarded.suggestedFirstMessage || "", /businesses like yours/i);
  assert.match(guarded.suggestedFirstMessage || "", /see if this is relevant/i);
}

console.log("prospect-intelligence-outreach.test.ts: OK");
