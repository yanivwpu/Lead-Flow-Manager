/**
 * AI domain eligibility — Copilot + Suggest Reply share one routing rule.
 * Run: npx tsx tests/ai-domain-eligibility.test.ts
 */
import assert from "node:assert/strict";
import {
  resolveAiConversationDomain,
  resolveAiDomainEligibility,
  shouldInjectBuyerRealEstateContext,
  shouldShowRealEstateCopilotRecommendations,
  shouldUseRealEstateAiPersona,
  stripIneligibleRealEstateContactContext,
} from "../shared/aiDomainEligibility";
import { resolveCopilotDominantIntent } from "../shared/copilotIntent";
import { buildContextualNextActions } from "../shared/customerInsights";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

const RGE_WORKSPACE = {
  rgeInstalled: true,
  industry: "Real Estate",
} as const;

run("1. Generic GHL agency email → no real-estate context", () => {
  const msg =
    "Does WhachatCRM work with GoHighLevel agencies? We need CRM integration for our agency.";
  const decision = resolveAiDomainEligibility({
    inboundText: msg,
    ...RGE_WORKSPACE,
  });
  assert.equal(decision.domain, "generic");
  assert.equal(decision.injectBuyerContext, false);
  assert.equal(decision.useRealEstatePromptPersona, false);
  assert.equal(decision.showRealEstateCopilotRecommendations, false);

  const actions = buildContextualNextActions({
    inboundText: msg,
    latestInboundText: msg,
    ...RGE_WORKSPACE,
  });
  const labels = actions.map((a) => a.label);
  assert.ok(!labels.some((l) => /matching listings|schedule showing|buy or rent/i.test(l)));
});

run("2. Google/system email → no listing/showing recommendations", () => {
  const msg = `
    Google Terms of Service
    We've updated our Terms of Service and Privacy Policy.
    You can review the purchase terms in the agreement.
    Availability of services may vary by region.
  `;
  const decision = resolveAiDomainEligibility({
    inboundText: msg,
    contactEmail: "noreply@google.com",
    ...RGE_WORKSPACE,
  });
  assert.equal(decision.domain, "generic");
  assert.equal(shouldShowRealEstateCopilotRecommendations({
    inboundText: msg,
    contactEmail: "noreply@google.com",
    ...RGE_WORKSPACE,
  }), false);

  const actions = buildContextualNextActions({
    inboundText: msg,
    latestInboundText: msg,
    contactEmail: "noreply@google.com",
    hasShowingIntent: true,
    hasStrongPurchaseIntent: true,
    ...RGE_WORKSPACE,
  });
  const labels = actions.map((a) => a.label);
  assert.ok(!labels.some((l) => /share matching listings/i.test(l)), "no Share matching listings");
  assert.ok(!labels.some((l) => /schedule showing/i.test(l)), "no Schedule showing");
});

run("3. Real buyer inquiry → RGE context works", () => {
  const msg = "I'm looking to buy a condo in Pompano under $500k.";
  const decision = resolveAiDomainEligibility({
    inboundText: msg,
    ...RGE_WORKSPACE,
  });
  assert.equal(decision.domain, "real_estate_buyer");
  assert.equal(decision.injectBuyerContext, true);
  assert.equal(decision.injectInventoryContext, true);
  assert.equal(decision.useRealEstatePromptPersona, true);
  assert.equal(resolveCopilotDominantIntent({ inboundText: msg }), "buyer");

  const actions = buildContextualNextActions({
    inboundText: msg,
    latestInboundText: msg,
    ...RGE_WORKSPACE,
  });
  assert.ok(actions.some((a) => /share matching listings/i.test(a.label)));
});

run("4. Rental inquiry → rental context works", () => {
  const msg = "I need a 2 bedroom rental in Pompano.";
  const decision = resolveAiDomainEligibility({
    inboundText: msg,
    ...RGE_WORKSPACE,
  });
  assert.equal(decision.domain, "real_estate_rental");
  assert.equal(decision.injectBuyerContext, true);
  assert.equal(shouldInjectBuyerRealEstateContext({ inboundText: msg, ...RGE_WORKSPACE }), true);
});

run("5. Generic conversation in RGE-enabled workspace → still generic", () => {
  const msg = "Hi, can you send me your pricing for the WhatsApp CRM plan?";
  const decision = resolveAiDomainEligibility({
    inboundText: msg,
    ...RGE_WORKSPACE,
    leadType: "buyer", // lead type alone must not force RE workflows
  });
  assert.equal(decision.domain, "generic");
  assert.equal(decision.injectBuyerContext, false);
  assert.equal(shouldUseRealEstateAiPersona({ inboundText: msg, ...RGE_WORKSPACE }), false);
});

run("6. Copilot and Suggest Reply use equivalent context eligibility", () => {
  const cases = [
    "Does WhachatCRM work with GoHighLevel agencies?",
    "Google Terms of Service — we updated our purchase terms in the agreement.",
    "I'm looking to buy a condo in Pompano under $500k.",
    "I need a 2 bedroom rental in Pompano.",
    "Just checking in on our onboarding call tomorrow.",
  ];
  for (const msg of cases) {
    const decision = resolveAiDomainEligibility({ inboundText: msg, ...RGE_WORKSPACE });
    const copilot = shouldShowRealEstateCopilotRecommendations({
      inboundText: msg,
      ...RGE_WORKSPACE,
    });
    const suggestBuyer = shouldInjectBuyerRealEstateContext({
      inboundText: msg,
      ...RGE_WORKSPACE,
    });
    const persona = shouldUseRealEstateAiPersona({ inboundText: msg, ...RGE_WORKSPACE });
    // Copilot RE actions and Suggest Reply buyer injection share the same domain gate.
    assert.equal(
      copilot,
      decision.showRealEstateCopilotRecommendations,
      `copilot mismatch for: ${msg}`,
    );
    assert.equal(
      suggestBuyer,
      decision.injectBuyerContext,
      `suggest-reply mismatch for: ${msg}`,
    );
    assert.equal(persona, decision.useRealEstatePromptPersona, `persona mismatch for: ${msg}`);
    assert.equal(
      resolveAiConversationDomain({ inboundText: msg, ...RGE_WORKSPACE }),
      decision.domain,
    );
  }
});

run("stripIneligibleRealEstateContactContext removes buyer/inventory fields", () => {
  const decision = resolveAiDomainEligibility({
    inboundText: "Does GHL integrate with WhachatCRM?",
    ...RGE_WORKSPACE,
  });
  const stripped = stripIneligibleRealEstateContactContext(
    {
      name: "Agency Lead",
      buyerPreferences: "Wants 3/2 condo",
      buyerQualificationContext: "Ask buy or rent",
      inventoryMatchSummary: "10 listings",
      budget: "$500k",
    },
    decision,
  );
  assert.equal(stripped.buyerPreferences, undefined);
  assert.equal(stripped.buyerQualificationContext, undefined);
  assert.equal(stripped.inventoryMatchSummary, undefined);
  assert.equal(stripped.budget, undefined);
  assert.equal(stripped.useRealEstatePromptPersona, false);
  assert.equal(stripped.aiConversationDomain, "generic");
  assert.equal(stripped.name, "Agency Lead");
});

console.log("\nAll AI domain eligibility tests passed.");
