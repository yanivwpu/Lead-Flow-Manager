/**
 * Copilot post-match decision rules.
 * Run: npx tsx tests/copilot-decision.test.ts
 */
import { assessBuyerQualification, formatQualificationContextForAi } from "../shared/buyerQualification";
import { emptyBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import type { BuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const now = new Date().toISOString();
const inf = <T>(value: T) => ({
  value,
  source: "inferred" as const,
  confidence: 0.9,
  updatedAt: now,
  evidence: "test",
});

const searchProfile = {
  ...emptyBuyerPreferenceProfile(),
  transactionIntent: inf("buy"),
  targetAreas: inf(["Coral Springs"]),
  priceMax: inf(400_000),
  propertyTypes: inf(["house"]),
} as BuyerPreferenceProfile;

// 1. Many matches → present inventory, no qualification question
const manyMatches = assessBuyerQualification({
  profile: searchProfile,
  matchCount: 49,
  leadType: "buyer",
  buyRentIntent: "buyer",
});
assert(manyMatches.copilotDecisionReason === "inventory_available", "49 matches → inventory_available");
assert(manyMatches.inventoryMode === true, "inventory mode with matches");
assert(
  !manyMatches.suggestedQuestion.toLowerCase().includes("financing") &&
    !manyMatches.suggestedQuestion.toLowerCase().includes("pre-approved"),
  "49 matches: no financing question",
);
assert(
  /send|matches|options|strong fit/i.test(manyMatches.suggestedQuestion),
  "49 matches: present inventory CTA",
);

// 2. Zero matches → relaxation, no financing
const zeroMatches = assessBuyerQualification({
  profile: searchProfile,
  matchCount: 0,
  leadType: "buyer",
  buyRentIntent: "buyer",
});
assert(
  zeroMatches.copilotDecisionReason === "zero_matches_relax_criteria",
  "0 matches → zero_matches_relax_criteria",
);
assert(zeroMatches.zeroMatchMode === true, "zero match mode");
assert(
  !zeroMatches.suggestedQuestion.toLowerCase().includes("financing") &&
    !zeroMatches.suggestedQuestion.toLowerCase().includes("pre-approved"),
  "0 matches: no financing question",
);
assert(
  /couldn't find|expand|raise the budget|condos/i.test(zeroMatches.suggestedQuestion),
  "0 matches: relaxation suggestions",
);
const zeroCtx = formatQualificationContextForAi(zeroMatches);
assert(zeroCtx.includes("ZERO MATCH"), "AI context is zero match mode");
assert(zeroCtx.includes("FORBIDDEN: financing"), "AI context forbids financing");

// 3. Low profile → qualifying allowed
const sparse = assessBuyerQualification({
  profile: emptyBuyerPreferenceProfile(),
  matchCount: 0,
});
assert(sparse.copilotDecisionReason === "low_profile_qualify", "empty profile → low_profile_qualify");
assert(
  sparse.suggestedQuestion.includes("buy") || sparse.suggestedQuestion.includes("rent"),
  "low profile asks buy/rent",
);

// 4. Rental search with matches → present rentals
const rentProfile = {
  ...emptyBuyerPreferenceProfile(),
  transactionIntent: inf("rent"),
  targetAreas: inf(["Pompano Beach"]),
  priceMax: inf(3000),
  propertyTypes: inf(["house"]),
  bedsMin: inf(3),
  bathsMin: inf(2),
} as BuyerPreferenceProfile;

const rentMatches = assessBuyerQualification({
  profile: rentProfile,
  matchCount: 8,
  inboundText: "Show me SFH for rent in Pompano",
});
assert(rentMatches.copilotDecisionReason === "inventory_available", "rent with matches");
assert(rentMatches.inventoryMode === true, "rent inventory mode");
assert(
  !rentMatches.suggestedQuestion.toLowerCase().includes("financing"),
  "rent matches: no financing",
);

console.log("copilot-decision.test.ts: OK");
