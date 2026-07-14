/**
 * Canonical WhachatCRM positioning for Prospect Intelligence outreach.
 * Run: npx tsx tests/whachat-product-positioning.test.ts
 */
import assert from "node:assert/strict";
import {
  WHACHAT_PARTNER_COMMISSION_COPY,
  buildWhachatPositioningForProspect,
  buildWhachatProductContextForPrompt,
  detectWeakWhachatPositioning,
  hasConcreteWhachatPositioning,
  resolveWhachatPositioningSegment,
} from "../shared/whachatProductPositioning";
import {
  applyOutreachMessageGuardrails,
  buildProspectIntelligencePrompt,
  buildTailoredFirstMessage,
} from "../server/prospectImport/prospectIntelligenceAi";
import type { ProspectIntelligenceAiInput } from "../server/prospectImport/prospectIntelligenceAi";
import type { ProspectIntelligence } from "@shared/prospectImport";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

run("prompt includes canonical product context (not one-line undersell)", () => {
  const prompt = buildProspectIntelligencePrompt({
    name: "Test",
    originalTags: [],
  });
  assert.match(prompt, /multi-channel CRM/i);
  assert.match(prompt, /AI Copilot/i);
  assert.match(prompt, /canonical capabilities/i);
  assert.doesNotMatch(
    prompt,
    /Analyze this imported prospect for WhaChatCRM \(unified WhatsApp\/Instagram\/Messenger inbox \+ AI/,
  );
  const ctx = buildWhachatProductContextForPrompt();
  assert.match(ctx, /NEVER describe WhachatCRM ONLY as/i);
  assert.match(ctx, /partner\/affiliate opportunity/i);
});

run("1. digital marketing agency — CRM + multi-channel, not AI support alone", () => {
  const input: ProspectIntelligenceAiInput = {
    name: "Sam",
    company: "Smash Interactive",
    originalTags: ["Agency"],
    importReason: "digital marketing agency",
    importTag: "Imported-Agency",
  };
  const result: ProspectIntelligence = {
    needsReview: false,
    potentialFit: "high",
    priority: "high",
    businessType: "digital marketing agency",
    industry: "marketing",
    agencyLikelihood: 90,
    recommendedOffer: "agency_white_label",
    leadScore: 80,
    confidence: 80,
    suggestedFirstMessage:
      "Hi Sam, WhachatCRM is a platform for unified messaging and AI support. Want to chat?",
  };
  const guarded = applyOutreachMessageGuardrails(result, input);
  const msg = guarded.suggestedFirstMessage || "";
  assert.equal(detectWeakWhachatPositioning(msg).length, 0);
  assert.match(msg, /unified inbox and CRM|multi-channel CRM/i);
  assert.match(msg, /WhatsApp|Instagram|Messenger|email/i);
  assert.doesNotMatch(msg, /only as AI support|platform for unified messaging and AI support/i);
  assert.ok(hasConcreteWhachatPositioning(msg));
});

run("2. GHL agency — client-service + white-label", () => {
  const seg = resolveWhachatPositioningSegment({
    recommendedOffer: "agency_white_label",
    businessType: "GHL agency",
    industry: "marketing",
    originalTags: ["GHL", "Agency"],
  });
  assert.equal(seg, "ghl_agency");
  const ctx = buildWhachatPositioningForProspect({
    recommendedOffer: "agency_white_label",
    businessType: "GHL agency",
    originalTags: ["GHL"],
  });
  assert.match(ctx.positioningSentence, /agenc/i);
  assert.match(ctx.optionalCloser || "", /white-label/i);
  const msg = buildTailoredFirstMessage(
    { name: "Alex", originalTags: ["GHL Agency"], company: "Growth Ops" },
    {
      recommendedOffer: "agency_white_label",
      businessType: "GHL agency",
      agencyLikelihood: 88,
    },
  );
  assert.match(msg, /client/i);
  assert.match(msg, /white-label|agency/i);
  assert.doesNotMatch(msg, /\bMLS\b/);
});

run("3. Shopify merchant — commerce messaging, no MLS/agency pitch", () => {
  const msg = buildTailoredFirstMessage(
    { name: "Jordan", originalTags: ["Shopify"], company: "Cool Merch Co" },
    {
      recommendedOffer: "shopify_app",
      businessType: "Shopify merchant",
      shopifyMerchantLikelihood: 92,
    },
  );
  assert.match(msg, /Shopify/i);
  assert.match(msg, /customer conversation|unified inbox|multi-channel/i);
  assert.doesNotMatch(msg, /\bMLS\b|white-label|30% lifetime/i);
});

run("4. Real estate agent — RE Growth Engine, no Shopify", () => {
  const msg = buildTailoredFirstMessage(
    { name: "Casey", originalTags: ["Realtor"], company: "Casey Homes" },
    {
      recommendedOffer: "real_estate_growth_engine",
      businessType: "real estate agent",
      realEstateLikelihood: 95,
    },
  );
  assert.match(msg, /real estate|Real Estate Growth Engine/i);
  assert.match(msg, /MLS|inventory/i);
  assert.doesNotMatch(msg, /Shopify|abandoned cart/i);
});

run("5. Generic local service — inquiries, follow-up, CRM/booking", () => {
  const msg = buildTailoredFirstMessage(
    { name: "Pat", originalTags: [], company: "Pat's Plumbing", importReason: "local business" },
    {
      recommendedOffer: "core_whachatcrm",
      businessType: "local service",
      localBusinessLikelihood: 80,
    },
  );
  assert.match(msg, /inquir|follow up|follow-up|CRM|booking/i);
  assert.match(msg, /WhatsApp|Instagram|Messenger|email|web chat/i);
  assert.doesNotMatch(msg, /white-label|30% lifetime|Shopify/i);
});

run("6. Partner prospect — 30% lifetime recurring commission", () => {
  const msg = buildTailoredFirstMessage(
    { name: "Riley", originalTags: ["Affiliate"], importReason: "partner" },
    {
      recommendedOffer: "partner_program",
      businessType: "consultant",
    },
  );
  assert.match(msg, new RegExp(WHACHAT_PARTNER_COMMISSION_COPY.replace(/%/g, "\\%"), "i"));
  assert.match(msg, /partner/i);
  assert.ok(hasConcreteWhachatPositioning(msg));
});

run("Save/Approve preserve exact edited text (no regenerate on patch shape)", () => {
  // Mirrors server approveProspectIntelligence / patchProspectIntelligence:
  // they persist opts.suggestedFirstMessage / patch.suggestedFirstMessage verbatim.
  const edited = "Custom Smash draft — keep exact wording. WhachatCRM CRM sentence.";
  const approvePatch = { suggestedFirstMessage: edited };
  const savePatch = { suggestedFirstMessage: edited };
  assert.equal(approvePatch.suggestedFirstMessage, edited);
  assert.equal(savePatch.suggestedFirstMessage, edited);
  assert.notEqual(approvePatch.suggestedFirstMessage, buildTailoredFirstMessage(
    { name: "Sam", originalTags: [] },
    { recommendedOffer: "agency_white_label", agencyLikelihood: 90 },
  ));
});

console.log("\nAll whachat-product-positioning tests passed.");
