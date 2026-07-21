/**
 * Prospect AI must consume existing AI Brain context without creating another setup.
 * Run: npx tsx tests/prospect-ai-brain-context.test.ts
 */
import assert from "node:assert/strict";
import {
  applyOutreachMessageGuardrails,
  buildProspectIntelligencePrompt,
  type ProspectIntelligenceAiInput,
} from "../server/prospectImport/prospectIntelligenceAi";
import type { ProspectWorkspaceBusinessContext } from "../server/prospectImport/prospectAiWorkspaceContext";
import type { ProspectIntelligence } from "@shared/prospectImport";

const input: ProspectIntelligenceAiInput = {
  name: "Taylor",
  company: "Local Dental Group",
  websiteUrl: "https://example.test",
  originalTags: [],
};

const context: ProspectWorkspaceBusinessContext = {
  configured: true,
  aiBrainIsPrimary: true,
  hasAiBrain: true,
  hasBusinessProfile: true,
  fallbackUsed: "ai_brain",
  businessName: "Northstar Growth",
  displayName: "Northstar Growth",
  industry: "Marketing",
  servicesProducts: "help local clinics generate and follow up with qualified consultation leads",
  websiteKnowledgeSummary: "Northstar provides paid media and lead nurture services.",
  faqs: [{ question: "Who do you serve?", answer: "Local service businesses." }],
  executiveSummary: "Growth partner for local service businesses.",
};

const prompt = buildProspectIntelligencePrompt(input, context);
assert.match(prompt, /AI Brain = PRIMARY/i);
assert.match(prompt, /Northstar Growth/);
assert.match(prompt, /ProductsAndServices|productsAndServices/);
assert.doesNotMatch(prompt, /canonical WhachatCRM capabilities/i);
assert.doesNotMatch(prompt, /What do you sell/i);

const noBrainPrompt = buildProspectIntelligencePrompt(input, {
  configured: false,
  aiBrainIsPrimary: false,
  hasAiBrain: false,
  hasBusinessProfile: false,
  fallbackUsed: "generic",
});
assert.match(noBrainPrompt, /basic prospect analysis only/i);
assert.match(noBrainPrompt, /leave suggestedFirstMessage empty/i);
assert.doesNotMatch(noBrainPrompt, /canonical WhachatCRM capabilities/i);

const unsafe: ProspectIntelligence = {
  needsReview: false,
  potentialFit: "high",
  priority: "high",
  businessType: "dental clinic",
  industry: "healthcare",
  recommendedOffer: "general_demo",
  leadScore: 80,
  confidence: 80,
  suggestedFirstMessage: "Hi Taylor, I noticed your interest in our services.",
};

const guarded = applyOutreachMessageGuardrails(unsafe, input, context);
assert.match(guarded.suggestedFirstMessage || "", /Northstar Growth/);
assert.doesNotMatch(guarded.suggestedFirstMessage || "", /WhachatCRM/i);
assert.doesNotMatch(guarded.suggestedFirstMessage || "", /noticed your interest/i);

console.log("prospect-ai-brain-context.test.ts: all assertions passed");
