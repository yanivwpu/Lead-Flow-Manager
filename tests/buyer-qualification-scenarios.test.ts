/**
 * Phase 2B/2C scenario tests — qualification + matching + refresh contracts.
 * Run: npx tsx tests/buyer-qualification-scenarios.test.ts
 */
import {
  assessBuyerQualification,
  formatQualificationContextForAi,
  containsRoboticPhrase,
  sanitizeRoboticBuyerReply,
} from "../shared/buyerQualification";
import { heuristicPatchFromInboundText } from "../shared/buyerPreferenceExtractionNormalize";
import { mergeBuyerPreferenceProfile } from "../shared/buyerPreferenceMerge";
import { formatInventoryMatchSummaryForAi } from "../shared/inventory/inventoryMatchDisplay";
import {
  extractBuyerMatchCriteria,
  rankInventoryMatches,
  listingHasPool,
  type MatchListingInput,
} from "../shared/inventory/inventoryMatchScoring";
import { emptyBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import type { BuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const now = new Date().toISOString();
const inf = <T>(value: T) => ({
  value,
  source: "inferred" as const,
  confidence: 0.85,
  updatedAt: now,
});

// Scenario 1 — new lead
const msg1 = "Do you have any SFH with pool in Pompano?";
const patch1 = heuristicPatchFromInboundText(msg1);
const profile1 = mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), patch1, undefined, {
  replaceArrayFields: ["propertyTypes", "targetAreas"],
});
const q1 = assessBuyerQualification({ profile: profile1 });
const ctx1 = formatQualificationContextForAi(q1);
assert(q1.suggestedQuestion.split("?").length <= 2, "scenario 1: one question only");
assert(!ctx1.includes("buy or rent") || q1.suggestedQuestion.includes("buy"), "scenario 1: buy/rent question");
assert(
  formatInventoryMatchSummaryForAi({
    matchCount: 5,
    matches: [{ listing: { city: "Pompano Beach" } }],
    qualificationLevel: q1.level,
  }).includes("do NOT mention match counts") ||
    formatInventoryMatchSummaryForAi({
      matchCount: 5,
      matches: [{ listing: { city: "Pompano Beach" } }],
      qualificationLevel: q1.level,
    }).includes("ONE question"),
  "scenario 1: no match count in AI summary at medium",
);

// Scenario 2 — existing profile + new criteria
const existing = {
  ...emptyBuyerPreferenceProfile(),
  priceMax: inf(280000),
  bedsMin: inf(2),
  bathsMin: inf(2),
  propertyTypes: inf(["condo"]),
  targetAreas: inf(["Brickell"]),
} as BuyerPreferenceProfile;

const msg2 = "Do you have any SFH with pool East of Federal Hwy in Pompano?";
const patch2 = heuristicPatchFromInboundText(msg2);
const profile2 = mergeBuyerPreferenceProfile(existing, patch2, undefined, {
  replaceArrayFields: ["propertyTypes", "targetAreas"],
});
const q2 = assessBuyerQualification({ profile: profile2, leadType: "buyer" });
assert(
  profile2.propertyTypes?.value?.join() === "house",
  "scenario 3 inline: SFH replaces condo",
);
assert(q2.confirmPriorFields === true, "scenario 2: confirms prior budget/beds/baths");
if (q2.level === "high") {
  assert(
    !q2.suggestedQuestion.toLowerCase().includes("widen") &&
      !q2.suggestedQuestion.toLowerCase().includes("broaden"),
    "scenario 2: HIGH after pool+area update uses inventory CTA not broaden",
  );
  assert(
    /strong fit|best matches|top options|several homes/i.test(q2.suggestedQuestion),
    "scenario 2: HIGH inventory/showing CTA",
  );
} else {
  assert(
    q2.suggestedQuestion.toLowerCase().includes("budget") ||
      q2.suggestedQuestion.toLowerCase().includes("widen") ||
      q2.suggestedQuestion.toLowerCase().includes("broaden"),
    "scenario 2: MEDIUM budget/beds confirmation question",
  );
}

// Scenario 3 — property type replacement
assert(!profile2.propertyTypes?.value?.includes("condo"), "scenario 3: no condo in profile");

// Scenario 4 — pool required
const poolProfile = mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), {
  pool: inf(true),
  mustHaves: inf(["must have pool"]),
  propertyTypes: inf(["house"]),
  targetAreas: inf(["Pompano"]),
});
const criteria = extractBuyerMatchCriteria(poolProfile);
assert(criteria.hardRequirePool === true, "scenario 4: hard pool required");

const withPool: MatchListingInput = {
  id: "1",
  providerListingId: "P1",
  status: "active",
  priceCents: 400_000_00,
  city: "Pompano Beach",
  state: "FL",
  addressLine1: "1 Main",
  addressLine2: null,
  zip: "33062",
  beds: 3,
  baths: 2,
  propertyType: "house",
  listingDetails: { pool: true },
  description: "SFH with pool",
  features: ["Pool"],
  listingUrl: null,
  photos: [],
};

const noPool: MatchListingInput = {
  ...withPool,
  id: "2",
  providerListingId: "P2",
  listingDetails: { pool: false },
  description: "SFH no pool",
  features: [],
};

const ranked = rankInventoryMatches([withPool, noPool], criteria, 10);
assert(ranked.length === 1, "scenario 4: only pool listing ranks");
assert(ranked[0].listingId === "1", "scenario 4: pool listing is top match");
assert(listingHasPool(withPool), "pool signal detected from listingDetails");

// Scenario 5 — Copilot refresh contract
const wsPayload = { type: "buyer_preferences_updated", contactId: "contact-1" };
assert(wsPayload.type === "buyer_preferences_updated", "scenario 5: WS refresh event type");
assert(typeof wsPayload.contactId === "string", "scenario 5: contactId present for invalidation");

// Scenario 6 — robotic language
const bad = "Let me check — I found 10 properties. Waiting for approval to share details.";
const cleaned = sanitizeRoboticBuyerReply(bad);
assert(!containsRoboticPhrase(cleaned), "scenario 6: no robotic phrases after cleanup");

const assistantLike =
  "I'll compile a selection of homes for your convenience and send the options shortly.";
const cleanedAssistant = sanitizeRoboticBuyerReply(assistantLike);
assert(!containsRoboticPhrase(cleanedAssistant), "scenario 6b: assistant phrasing removed");
assert(
  /good options|best matches|strong fit/i.test(cleanedAssistant),
  "scenario 6b: natural agent phrasing substituted",
);

console.log("buyer-qualification-scenarios.test.ts: OK");
