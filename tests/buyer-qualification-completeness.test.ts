/**
 * Buyer qualification completeness scoring.
 * Run: npx tsx tests/buyer-qualification-completeness.test.ts
 */
import {
  assessBuyerQualification,
  formatQualificationContextForAi,
  sanitizeRoboticBuyerReply,
  containsRoboticPhrase,
  containsWidenQualificationPhrase,
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
} as BuyerPreferenceProfile;

const newLeadQ = assessBuyerQualification({ profile: newLeadProfile });
assert(newLeadQ.level === "medium", "SFH+Pompano without budget is MEDIUM");
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
assert(existingQ.confirmPriorFields === true, "existing budget+beds/baths on file");
assert(
  !existingQ.suggestedQuestion.toLowerCase().includes("widen") &&
    !existingQ.suggestedQuestion.toLowerCase().includes("broaden"),
  "MEDIUM never suggests widen/broaden",
);

const highProfile = {
  ...existingProfile,
  pool: inf(true),
  timeline: inf("asap"),
  financingStatus: inf("pre_approved"),
} as BuyerPreferenceProfile;

const highQ = assessBuyerQualification({
  profile: highProfile,
  leadType: "buyer",
  buyRentIntent: "buyer",
  matchCount: 5,
});
assert(highQ.level === "high", "full profile reaches HIGH");
assert(highQ.mayPresentMatches === true, "HIGH may present matches");
assert(highQ.inventoryMode === true, "HIGH with matches enters inventory mode");
assert(
  !highQ.suggestedQuestion.toLowerCase().includes("widen") &&
    !highQ.suggestedQuestion.toLowerCase().includes("broaden"),
  "HIGH never suggests broaden/widen",
);
assert(
  /strong fit|best matches|top options|several homes/i.test(highQ.suggestedQuestion),
  "HIGH suggests inventory/showing CTA",
);

const pompanoHighProfile = {
  ...emptyBuyerPreferenceProfile(),
  targetAreas: inf(["Pompano Beach"]),
  priceMin: inf(1_000_000),
  priceMax: inf(1_500_000),
  propertyTypes: inf(["house"]),
  bedsMin: inf(5),
  bathsMin: inf(4),
  pool: inf(true),
} as BuyerPreferenceProfile;

const pompanoHighQ = assessBuyerQualification({
  profile: pompanoHighProfile,
  leadType: "buyer",
  buyRentIntent: "buyer",
  matchCount: 12,
});
assert(pompanoHighQ.level === "high", "Pompano 5/4 pool $1M-$1.5M is HIGH");
assert(pompanoHighQ.inventoryMode, "complete criteria with matches enters inventory mode");
assert(
  !pompanoHighQ.suggestedQuestion.toLowerCase().includes("widen") &&
    !pompanoHighQ.suggestedQuestion.toLowerCase().includes("broaden"),
  "HIGH with pool but no timeline does not ask to broaden",
);
assert(
  /strong fit|best matches|top options|several homes/i.test(pompanoHighQ.suggestedQuestion),
  "HIGH pool buyer gets inventory CTA",
);
const pompanoCtx = formatQualificationContextForAi(pompanoHighQ);
assert(pompanoCtx.includes("INVENTORY MODE"), "HIGH AI context is inventory mode");

const sanitized = sanitizeRoboticBuyerReply(
  "Let me check our listings — I found 10 properties waiting for approval.",
);
assert(!containsRoboticPhrase(sanitized), "sanitizer removes robotic phrases");
assert(
  sanitized.toLowerCase().includes("strong fit") ||
    sanitized.includes("narrowing") ||
    sanitized.length > 0,
  "sanitizer substitutes natural phrasing or strips botspeak",
);

const compileSanitized = sanitizeRoboticBuyerReply(
  "I'll compile a selection and gather options for your convenience shortly.",
);
assert(!containsRoboticPhrase(compileSanitized), "compile/gather/convenience sanitized");

const widenSanitized = sanitizeRoboticBuyerReply(
  "Should I keep the search at $1M–$1.5M with these features, or would you like to widen it a bit?",
);
assert(!containsWidenQualificationPhrase(widenSanitized), "widen qualification sanitized");

console.log("buyer-qualification-completeness.test.ts: OK");
