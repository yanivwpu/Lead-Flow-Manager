/**
 * Buyer qualification completeness scoring.
 * Run: npx tsx tests/buyer-qualification-completeness.test.ts
 */
import {
  assessBuyerQualification,
  formatQualificationContextForAi,
  sanitizeRoboticBuyerReply,
  containsRoboticPhrase,
} from "../shared/buyerQualification";
import { emptyBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import type { BuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const now = new Date().toISOString();
const inf = <T>(value: T) => ({
  value,
  source: "inferred" as const,
  confidence: 0.8,
  updatedAt: now,
});

const newLeadProfile = {
  ...emptyBuyerPreferenceProfile(),
  targetAreas: inf(["Pompano"]),
  propertyTypes: inf(["house"]),
  pool: inf(true),
} as BuyerPreferenceProfile;

const newLeadQ = assessBuyerQualification({ profile: newLeadProfile });
assert(newLeadQ.level === "medium", "SFH+pool+Pompano without budget is MEDIUM");
assert(
  newLeadQ.suggestedQuestion.includes("buy") || newLeadQ.suggestedQuestion.includes("rent"),
  "new lead asks buy/rent first",
);
assert(
  !formatQualificationContextForAi(newLeadQ).includes("I found"),
  "LOW/MEDIUM context does not encourage match claims",
);

const existingProfile = {
  ...newLeadProfile,
  priceMax: inf(280000),
  bedsMin: inf(2),
  bathsMin: inf(2),
  targetAreas: inf(["East of the Federal Hwy in Pompano"]),
} as BuyerPreferenceProfile;

const existingQ = assessBuyerQualification({
  profile: existingProfile,
  leadType: "buyer",
});
assert(existingQ.confirmPriorFields === true, "existing budget+beds+baths triggers confirm");
assert(
  existingQ.suggestedQuestion.toLowerCase().includes("budget") ||
    existingQ.suggestedQuestion.toLowerCase().includes("broaden"),
  "existing profile suggests budget/beds confirmation",
);

const highProfile = {
  ...existingProfile,
  timeline: inf("asap"),
  financingStatus: inf("pre_approved"),
} as BuyerPreferenceProfile;

const highQ = assessBuyerQualification({
  profile: highProfile,
  leadType: "buyer",
  buyRentIntent: "buyer",
});
assert(highQ.level === "high", "full profile reaches HIGH");
assert(highQ.mayPresentMatches === true, "HIGH may present matches");

const sanitized = sanitizeRoboticBuyerReply(
  "Let me check our listings — I found 10 properties waiting for approval.",
);
assert(!containsRoboticPhrase(sanitized), "sanitizer removes robotic phrases");
assert(sanitized.toLowerCase().includes("few homes") || sanitized.includes("narrow"), "sanitizer substitutes natural phrasing");

console.log("buyer-qualification-completeness.test.ts: OK");
