/**
 * Prospect AI knowledge-source hierarchy: AI Brain primary over Business Profile.
 * Run: npx tsx tests/prospect-ai-knowledge-hierarchy.test.ts
 */
import assert from "node:assert/strict";
import {
  assembleProspectAiWorkspaceContext,
  detectBusinessContextConflict,
  hasAiBrainIntelligence,
  hasBusinessProfileIdentity,
} from "../server/prospectImport/prospectAiWorkspaceContext";
import {
  applyOutreachMessageGuardrails,
  buildProspectIntelligenceInput,
  buildProspectIntelligencePrompt,
  type ProspectIntelligenceAiInput,
} from "../server/prospectImport/prospectIntelligenceAi";
import type { ProspectIntelligence } from "../shared/prospectImport";
import type { Contact } from "../shared/schema";

const prospectInput: ProspectIntelligenceAiInput = {
  name: "Bright Dental",
  company: "Bright Dental",
  businessType: "dentist",
  address: "Austin, TX",
  websiteUrl: "https://brightdental.example",
  phone: "5125551212",
  rating: 4.6,
  reviewCount: 40,
  discoverySource: "Google Places discovery",
  batchName: "Prospect AI: dentist in Austin, TX",
  importReason: "Local prospect discovery",
  originalTags: [],
  providerPlaceId: "places/abc",
};

function testConflictDetection() {
  assert.equal(
    detectBusinessContextConflict({
      aboutText: "Florida real estate agent serving buyers and sellers.",
      businessName: "Canvas Real Estate",
      servicesProducts:
        "WhachatCRM is an AI-powered customer acquisition and unified inbox platform for SMBs.",
      websiteKnowledgeSummary: "Unified inbox, WhatsApp CRM, AI lead qualification.",
    }),
    true,
  );
  assert.equal(
    detectBusinessContextConflict({
      aboutText: "We help clinics book more consultations.",
      businessName: "Northstar Growth",
      servicesProducts: "paid media and lead nurture for local clinics",
      websiteKnowledgeSummary: "Growth partner for clinics.",
    }),
    false,
  );
}

function testAiBrainWinsOverConflictingProfile() {
  const ctx = assembleProspectAiWorkspaceContext({
    businessName: "Canvas Real Estate",
    aboutText: "Florida real estate agent serving buyers and sellers.",
    displayName: "Canvas Team",
    publicWebsite: "https://canvas.example",
    publicPhone: "3055550100",
    servicesProducts:
      "WhachatCRM — AI-powered customer acquisition and unified inbox for SMBs",
    websiteKnowledgeSummary:
      "WhachatCRM helps small businesses manage WhatsApp, Instagram, and email in one inbox with AI qualification.",
    faqs: [{ question: "What do you sell?", answer: "WhachatCRM SaaS subscriptions." }],
    industry: "saas",
  });

  assert.equal(ctx.aiBrainIsPrimary, true);
  assert.equal(ctx.fallbackUsed, "ai_brain");
  assert.equal(ctx.configured, true);
  assert.equal(ctx.hasBusinessProfile, true);
  assert.match(ctx.executiveSummary || "", /WhachatCRM|unified inbox/i);
  assert.doesNotMatch(ctx.executiveSummary || "", /Florida real estate/i);

  const prompt = buildProspectIntelligencePrompt(prospectInput, ctx);
  assert.match(prompt, /AI Brain = PRIMARY/i);
  assert.match(prompt, /WhachatCRM/);
  assert.match(prompt, /IGNORE Profile About/i);
  assert.match(prompt, /complementary IDENTITY only/i);
  assert.match(prompt, /Canvas Real Estate/); // identity still present
  assert.match(prompt, /outbound_prospect_evaluation/);
  assert.match(prompt, /dentist/); // prospect category reaches analyzer
  assert.match(prompt, /Google Places discovery/);

  // Guardrail rewrite must pitch Brain offer with Profile sender identity — not real estate.
  const unsafe: ProspectIntelligence = {
    needsReview: false,
    potentialFit: "high",
    priority: "high",
    businessType: "dental clinic",
    recommendedOffer: "general_demo",
    leadScore: 80,
    confidence: 80,
    suggestedFirstMessage: "Hi Bright, I noticed your interest in our services.",
  };
  const guarded = applyOutreachMessageGuardrails(unsafe, prospectInput, ctx);
  assert.match(guarded.suggestedFirstMessage || "", /Canvas Team|Canvas Real Estate/i);
  assert.match(guarded.suggestedFirstMessage || "", /WhachatCRM|unified inbox|customer acquisition/i);
  assert.doesNotMatch(guarded.suggestedFirstMessage || "", /Florida real estate|buyers and sellers/i);
  assert.doesNotMatch(guarded.suggestedFirstMessage || "", /noticed your interest/i);
}

function testProfileComplementsIdentityOnly() {
  const ctx = assembleProspectAiWorkspaceContext({
    displayName: "Sam at Whachat",
    businessName: "WhachatCRM",
    publicWebsite: "https://whachat.com",
    aboutText: "We are based in Florida.", // geographic note — must not redefine offer
    servicesProducts: "AI CRM and unified inbox for SMBs",
    websiteKnowledgeSummary: "Multi-channel messaging CRM with AI engagement.",
  });
  assert.equal(ctx.aiBrainIsPrimary, true);
  assert.equal(ctx.displayName, "Sam at Whachat");
  assert.equal(ctx.website, "https://whachat.com");
  assert.match(ctx.executiveSummary || "", /AI CRM|unified inbox|Multi-channel/i);
  assert.doesNotMatch(ctx.executiveSummary || "", /based in Florida/i);
}

function testNoAiBrainFallsBackToProfile() {
  const ctx = assembleProspectAiWorkspaceContext({
    businessName: "Canvas Real Estate",
    aboutText: "Florida real estate agent serving buyers and sellers.",
    displayName: "Alex",
    publicWebsite: "https://canvas.example",
  });
  assert.equal(ctx.aiBrainIsPrimary, false);
  assert.equal(ctx.fallbackUsed, "business_profile");
  assert.equal(ctx.configured, true);
  assert.match(ctx.executiveSummary || "", /Florida real estate/i);

  const prompt = buildProspectIntelligencePrompt(prospectInput, ctx);
  assert.match(prompt, /Business Profile as a cautious fallback/i);
  assert.doesNotMatch(prompt, /AI Brain = PRIMARY/i);
}

function testGenericFallback() {
  const ctx = assembleProspectAiWorkspaceContext(null);
  assert.equal(ctx.configured, false);
  assert.equal(ctx.fallbackUsed, "generic");
  assert.equal(hasAiBrainIntelligence(null), false);
  assert.equal(hasBusinessProfileIdentity(null), false);

  const prompt = buildProspectIntelligencePrompt(prospectInput, ctx);
  assert.match(prompt, /basic prospect analysis only/i);
  assert.match(prompt, /Leave suggestedFirstMessage empty/i);
}

function testProfileOnlyDoesNotCountAsAiBrainIntelligence() {
  assert.equal(
    hasAiBrainIntelligence({
      businessName: "Canvas Real Estate",
      aboutText: "Florida realtor",
      displayName: "Alex",
    }),
    false,
  );
  assert.equal(
    hasBusinessProfileIdentity({
      businessName: "Canvas Real Estate",
      aboutText: "Florida realtor",
    }),
    true,
  );
}

function testProspectFieldsReachAnalyzer() {
  const contact = {
    id: "c1",
    userId: "ws-1",
    name: "Bright Dental",
    phone: "5125551212",
    email: null,
    notes:
      "Company: Bright Dental\nType: dentist\nAddress: Austin, TX\nhttps://brightdental.example",
    tag: "Discovered-ProspectAI",
    source: "import",
    sourceDetails: {
      prospectImportProvider: "prospect_ai",
      prospectAi: {
        placeId: "places/abc",
        businessType: "dentist",
        address: "Austin, TX",
        website: "https://brightdental.example",
        rating: 4.6,
        reviewCount: 40,
        sourceLabel: "Google Places discovery",
        batchName: "Prospect AI: dentist in Austin",
        importReason: "Local prospect discovery",
      },
    },
    customFields: {
      prospectAi: {
        placeId: "places/abc",
        businessType: "dentist",
        address: "Austin, TX",
        website: "https://brightdental.example",
        rating: 4.6,
        reviewCount: 40,
        sourceLabel: "Google Places discovery",
      },
    },
  } as Contact;

  const input = buildProspectIntelligenceInput(contact);
  assert.equal(input.businessType, "dentist");
  assert.equal(input.address, "Austin, TX");
  assert.equal(input.rating, 4.6);
  assert.equal(input.discoverySource, "Google Places discovery");

  const ctx = assembleProspectAiWorkspaceContext({
    servicesProducts: "WhachatCRM unified inbox",
    websiteKnowledgeSummary: "AI CRM for SMBs",
  });
  const prompt = buildProspectIntelligencePrompt(input, ctx);
  assert.match(prompt, /dentist/);
  assert.match(prompt, /Austin, TX/);
  assert.match(prompt, /4\.6/);
  assert.match(prompt, /Google Places discovery/);
  assert.match(prompt, /Prospect AI/);
}

function testLowerPriorityDoesNotOverwriteBrain() {
  const ctx = assembleProspectAiWorkspaceContext({
    aboutText: "We sell houses.",
    businessName: "Canvas Real Estate",
    servicesProducts: "WhachatCRM SaaS",
    websiteKnowledgeSummary: "Customer acquisition CRM",
  });
  // Executive summary must come from Brain fields, not About.
  assert.equal(ctx.executiveSummary, "Customer acquisition CRM");
  assert.equal(ctx.servicesProducts, "WhachatCRM SaaS");
  assert.equal(ctx.aboutText, "We sell houses.");
}

testConflictDetection();
testAiBrainWinsOverConflictingProfile();
testProfileComplementsIdentityOnly();
testNoAiBrainFallsBackToProfile();
testGenericFallback();
testProfileOnlyDoesNotCountAsAiBrainIntelligence();
testProspectFieldsReachAnalyzer();
testLowerPriorityDoesNotOverwriteBrain();
console.log("prospect-ai-knowledge-hierarchy.test.ts: all assertions passed");
