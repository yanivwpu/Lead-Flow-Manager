/**
 * Buyer inventory search must override stale seller profile in Copilot.
 * Run: npx tsx tests/copilot-buyer-intent-over-seller.test.ts
 */
import assert from "node:assert/strict";
import { classifySellerIntent } from "../shared/sellerIntent";
import { resolveCopilotDominantIntent } from "../shared/copilotIntent";
import { buildContextualNextActions } from "../shared/customerInsights";

const MSG = "show me 3/2 apartment for sale up to 1 mil";

const sellerIntent = classifySellerIntent({
  inboundText: MSG,
  hasSellerProfile: true,
  priorSellerIntent: "seller_new",
});

assert.equal(
  sellerIntent,
  null,
  "buyer search nullifies stale seller profile intent class",
);

const dominantIntent = resolveCopilotDominantIntent({
  inboundText: MSG,
  sellerIntent,
});

assert.equal(dominantIntent, "buyer", "dominantIntent=buyer for inventory search");

const actions = buildContextualNextActions({
  inboundText: MSG,
  sellerIntent,
});

const labels = actions.map((a) => a.label);

assert.ok(
  !labels.some((l) => /book listing consultation/i.test(l)),
  "primaryRecommendation is NOT Book Listing Consultation",
);
assert.ok(
  !labels.some((l) => /assign listing agent|request property address/i.test(l)),
  "seller actions hidden",
);
assert.ok(
  labels.some((l) => /share matching listings/i.test(l)),
  "Share matching listings shown",
);
assert.ok(
  labels.some((l) => /send more matches|schedule showing|confirm showing availability/i.test(l)),
  "buyer inventory actions shown",
);

assert.ok(
  !/book listing consultation/i.test(actions[0]?.label ?? ""),
  "primary action is not seller consultation",
);

console.log("copilot-buyer-intent-over-seller.test.ts: OK");
