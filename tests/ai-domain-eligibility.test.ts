/**
 * AI domain eligibility — Copilot + Suggest Reply share one routing rule.
 * Includes system-email Copilot / Buyer Preferences regression coverage.
 * Run: npx tsx tests/ai-domain-eligibility.test.ts
 */
import assert from "node:assert/strict";
import {
  resolveAiConversationDomain,
  resolveAiDomainEligibility,
  shouldInjectBuyerRealEstateContext,
  shouldShowBuyerPreferencesPanel,
  shouldShowRealEstateCopilotRecommendations,
  shouldUseRealEstateAiPersona,
  stripIneligibleRealEstateContactContext,
  looksLikeSystemOrNotificationEmail,
} from "../shared/aiDomainEligibility";
import { resolveCopilotDominantIntent } from "../shared/copilotIntent";
import { buildContextualNextActions } from "../shared/customerInsights";
import { shouldShowCopilotBuyerPreferences } from "../client/src/lib/copilotRgeVisibility";

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

const GOOGLE_TOS = `
  Google Terms of Service
  We've updated our Terms of Service and Privacy Policy.
  You can review the purchase terms in the agreement.
  Availability of services may vary by region.
`;

run("A. Google Terms / noreply system email — no lead actions, prefs hidden, no-action state", () => {
  const email = "google-noreply@google.com";
  assert.equal(
    looksLikeSystemOrNotificationEmail({ contactEmail: email, inboundText: GOOGLE_TOS }),
    true,
  );
  const decision = resolveAiDomainEligibility({
    inboundText: GOOGLE_TOS,
    contactEmail: email,
    ...RGE_WORKSPACE,
  });
  assert.equal(decision.domain, "system");
  assert.equal(decision.isSystemNotification, true);
  assert.equal(decision.copilotNoActionNeeded, true);
  assert.equal(decision.suppressLeadWorkflowActions, true);
  assert.equal(decision.showBuyerPreferencesPanel, false);
  assert.equal(decision.injectBuyerContext, false);

  const actions = buildContextualNextActions({
    inboundText: GOOGLE_TOS,
    latestInboundText: GOOGLE_TOS,
    contactEmail: email,
    hasShowingIntent: true,
    hasStrongPurchaseIntent: true,
    bucket: "cold",
    leadLabel: "Cold",
    confidence: 0.2,
    ...RGE_WORKSPACE,
  });
  const labels = actions.map((a) => a.label);
  assert.deepEqual(labels, ["No action needed"]);
  assert.equal(actions[0]?.behavior, "info");
  assert.ok(!labels.some((l) => /assign agent/i.test(l)));
  assert.ok(!labels.some((l) => /nurture/i.test(l)));
  assert.ok(!labels.some((l) => /matching listings|schedule showing/i.test(l)));

  assert.equal(
    shouldShowCopilotBuyerPreferences({
      inventoryStatus: { canUse: true, rgeInstalled: true } as any,
      industry: "Real Estate",
      inboundText: GOOGLE_TOS,
      contactEmail: email,
    }),
    false,
    "Buyer Preferences hidden for system email",
  );
});

run("B. SaaS/GHL agency inquiry — actionable generic, Buyer Preferences hidden", () => {
  const msg =
    "Does WhachatCRM work with GoHighLevel agencies? We need CRM integration for our agency.";
  const decision = resolveAiDomainEligibility({
    inboundText: msg,
    contactEmail: "owner@agencycrm.com",
    ...RGE_WORKSPACE,
  });
  assert.equal(decision.domain, "generic");
  assert.equal(decision.isSystemNotification, false);
  assert.equal(decision.copilotNoActionNeeded, false);
  assert.equal(decision.showBuyerPreferencesPanel, false);

  const actions = buildContextualNextActions({
    inboundText: msg,
    latestInboundText: msg,
    contactEmail: "owner@agencycrm.com",
    bucket: "warm",
    leadLabel: "Warm",
    ...RGE_WORKSPACE,
  });
  const labels = actions.map((a) => a.label);
  assert.ok(!labels.some((l) => /no action needed/i.test(l)), "still actionable");
  assert.ok(!labels.some((l) => /matching listings|schedule showing/i.test(l)));
  assert.equal(
    shouldShowBuyerPreferencesPanel({ inboundText: msg, ...RGE_WORKSPACE }),
    false,
  );
});

run("C. Real estate buyer — prefs visible, matching/showing available", () => {
  const msg = "I'm looking to buy a condo in Pompano under $500k.";
  const decision = resolveAiDomainEligibility({
    inboundText: msg,
    ...RGE_WORKSPACE,
  });
  assert.equal(decision.domain, "real_estate_buyer");
  assert.equal(decision.showBuyerPreferencesPanel, true);
  assert.equal(decision.injectBuyerContext, true);
  assert.equal(resolveCopilotDominantIntent({ inboundText: msg }), "buyer");

  const actions = buildContextualNextActions({
    inboundText: msg,
    latestInboundText: msg,
    ...RGE_WORKSPACE,
  });
  assert.ok(actions.some((a) => /share matching listings/i.test(a.label)));
  assert.equal(
    shouldShowCopilotBuyerPreferences({
      inventoryStatus: { canUse: true, rgeInstalled: true } as any,
      industry: "Real Estate",
      inboundText: msg,
    }),
    true,
  );
});

run("D. Rental lead — Buyer Preferences visible", () => {
  const msg = "I need a 2 bedroom rental in Pompano.";
  const decision = resolveAiDomainEligibility({
    inboundText: msg,
    ...RGE_WORKSPACE,
  });
  assert.equal(decision.domain, "real_estate_rental");
  assert.equal(decision.showBuyerPreferencesPanel, true);
  assert.equal(shouldInjectBuyerRealEstateContext({ inboundText: msg, ...RGE_WORKSPACE }), true);
  assert.equal(
    shouldShowCopilotBuyerPreferences({
      inventoryStatus: { canUse: true, rgeInstalled: true } as any,
      industry: "Real Estate",
      inboundText: msg,
    }),
    true,
  );
});

run("E. Seller-only conversation — Buyer Preferences hidden", () => {
  const msg = "I want to sell my house in Boca. Can you do a CMA?";
  const decision = resolveAiDomainEligibility({
    inboundText: msg,
    sellerIntent: "seller_valuation",
    ...RGE_WORKSPACE,
  });
  assert.equal(decision.domain, "real_estate_seller");
  assert.equal(decision.showBuyerPreferencesPanel, false);
  assert.equal(decision.injectBuyerContext, false);
  assert.equal(decision.injectSellerContext, true);
  assert.equal(
    shouldShowCopilotBuyerPreferences({
      inventoryStatus: { canUse: true, rgeInstalled: true } as any,
      industry: "Real Estate",
      inboundText: msg,
      sellerIntent: "seller_valuation",
    }),
    false,
  );
});

run("Company sales inquiry is not classified as system", () => {
  const msg = "Hi, can you help us evaluate WhachatCRM for our brokerage team?";
  assert.equal(
    looksLikeSystemOrNotificationEmail({
      contactEmail: "support@acmebrokerage.com",
      inboundText: msg,
    }),
    false,
  );
  assert.equal(
    resolveAiConversationDomain({
      inboundText: msg,
      contactEmail: "support@acmebrokerage.com",
    }),
    "generic",
  );
});

run("RGE workspace alone does not show Buyer Preferences on generic chat", () => {
  const msg = "Hi, can you send me your pricing for the WhatsApp CRM plan?";
  const decision = resolveAiDomainEligibility({
    inboundText: msg,
    ...RGE_WORKSPACE,
    leadType: "buyer",
  });
  assert.equal(decision.domain, "generic");
  assert.equal(decision.showBuyerPreferencesPanel, false);
  assert.equal(shouldUseRealEstateAiPersona({ inboundText: msg, ...RGE_WORKSPACE }), false);
});

run("Copilot and Suggest Reply use equivalent context eligibility", () => {
  const cases = [
    { msg: "Does WhachatCRM work with GoHighLevel agencies?", email: "a@b.com" },
    { msg: GOOGLE_TOS, email: "google-noreply@google.com" },
    { msg: "I'm looking to buy a condo in Pompano under $500k.", email: null },
    { msg: "I need a 2 bedroom rental in Pompano.", email: null },
    { msg: "Just checking in on our onboarding call tomorrow.", email: null },
  ];
  for (const { msg, email } of cases) {
    const decision = resolveAiDomainEligibility({
      inboundText: msg,
      contactEmail: email,
      ...RGE_WORKSPACE,
    });
    assert.equal(
      shouldShowRealEstateCopilotRecommendations({
        inboundText: msg,
        contactEmail: email,
        ...RGE_WORKSPACE,
      }),
      decision.showRealEstateCopilotRecommendations,
    );
    assert.equal(
      shouldInjectBuyerRealEstateContext({
        inboundText: msg,
        contactEmail: email,
        ...RGE_WORKSPACE,
      }),
      decision.injectBuyerContext,
    );
    assert.equal(
      shouldShowBuyerPreferencesPanel({
        inboundText: msg,
        contactEmail: email,
        ...RGE_WORKSPACE,
      }),
      decision.showBuyerPreferencesPanel,
    );
    assert.equal(
      resolveAiConversationDomain({ inboundText: msg, contactEmail: email, ...RGE_WORKSPACE }),
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
