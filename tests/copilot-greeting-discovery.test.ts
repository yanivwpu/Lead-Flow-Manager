/**
 * Greeting / low-evidence Copilot must not recommend Realtor listing actions.
 * Run: npx tsx tests/copilot-greeting-discovery.test.ts
 */
import assert from "node:assert/strict";
import { classifySellerIntent } from "../shared/sellerIntent";
import {
  looksLikeGreetingOnly,
  resolveAiConversationDomain,
  resolveAiDomainEligibility,
} from "../shared/aiDomainEligibility";
import { resolveCopilotDominantIntent } from "../shared/copilotIntent";
import { buildContextualNextActions } from "../shared/customerInsights";

const MSG = "Hellooooo";
const TRAVEL_WS = {
  industry: "Travel & Tourism",
  rgeInstalled: false,
} as const;

assert.equal(looksLikeGreetingOnly(MSG), true, "Hellooooo is greeting-only");
assert.equal(
  classifySellerIntent({
    inboundText: MSG,
    hasSellerProfile: true,
    priorSellerIntent: "seller_new",
  }),
  null,
  "greeting does not inherit stale seller profile",
);

const domain = resolveAiConversationDomain({
  inboundText: MSG,
  sellerIntent: null,
  sellerProfileHasData: true,
  ...TRAVEL_WS,
});
assert.equal(domain, "generic", "Travel greeting stays generic domain");

const decision = resolveAiDomainEligibility({
  inboundText: MSG,
  sellerIntent: null,
  sellerProfileHasData: true,
  ...TRAVEL_WS,
});
assert.equal(
  decision.showRealEstateCopilotRecommendations,
  false,
  "no Realtor Copilot actions in Travel workspace",
);
assert.equal(resolveCopilotDominantIntent({ inboundText: MSG, ...TRAVEL_WS }), "neutral");

const actions = buildContextualNextActions({
  inboundText: MSG,
  latestInboundText: MSG,
  sellerIntent: null,
  sellerProfileHasData: true,
  confidence: 0.28,
  bucket: "unqualified",
  leadLabel: "Unqualified",
  ...TRAVEL_WS,
});
const labels = actions.map((a) => a.label);

assert.equal(labels[0], "Understand Intent", "primary is Understand Intent");
assert.ok(
  !labels.some((l) =>
    /book listing consultation|assign listing agent|request property address|schedule showing|share matching listings/i.test(
      l,
    ),
  ),
  "no high-intent Realtor / booking actions",
);
assert.ok(
  labels.some((l) => /discover needs|ask clarifying question|qualify visitor/i.test(l)),
  "includes discovery secondary actions",
);

// Even in a Realtor workspace, greeting-only must not book listing consultation.
const reGreeting = buildContextualNextActions({
  inboundText: MSG,
  latestInboundText: MSG,
  sellerIntent: null,
  sellerProfileHasData: true,
  confidence: 0.28,
  bucket: "unqualified",
  leadLabel: "Unqualified",
  rgeInstalled: true,
  industry: "Real Estate",
});
assert.equal(
  reGreeting[0]?.label,
  "Understand Intent",
  "RE workspace greeting still discovers intent first",
);
assert.ok(
  !reGreeting.some((a) => /book listing consultation/i.test(a.label)),
  "RE greeting must not recommend Book Listing Consultation",
);

// Explicit seller intent in RE workspace still gets listing consultation.
const sellerActions = buildContextualNextActions({
  inboundText: "I want to sell my house in Boca",
  latestInboundText: "I want to sell my house in Boca",
  sellerIntent: "seller_new",
  confidence: 0.8,
  bucket: "warm",
  leadLabel: "Warm",
  rgeInstalled: true,
  industry: "Real Estate",
});
assert.ok(
  sellerActions.some((a) => /book listing consultation/i.test(a.label)),
  "explicit seller intent still recommends listing consultation in RE workspace",
);

// Explicit seller language must not leak into Travel workspace.
const travelSellerLeak = buildContextualNextActions({
  inboundText: "I want to sell my house in Boca",
  latestInboundText: "I want to sell my house in Boca",
  sellerIntent: "seller_new",
  confidence: 0.9,
  bucket: "warm",
  leadLabel: "Warm",
  ...TRAVEL_WS,
});
assert.ok(
  !travelSellerLeak.some((a) => /book listing consultation|assign listing agent/i.test(a.label)),
  "Travel workspace never surfaces Realtor listing actions",
);

console.log("copilot-greeting-discovery.test.ts: OK");
