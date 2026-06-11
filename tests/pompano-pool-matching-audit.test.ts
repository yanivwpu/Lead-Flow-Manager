/**
 * Pompano 4/2 pool up to $1M + sqft max — parsing, budget cap, matching gates.
 * Run: npx tsx tests/pompano-pool-matching-audit.test.ts
 */
import { heuristicPatchFromInboundText } from "../shared/buyerPreferenceExtractionNormalize";
import { mergeBuyerPreferenceProfile } from "../shared/buyerPreferenceMerge";
import { emptyBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import type { BuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import { buildBuyerPreferenceChips } from "../shared/buyerPreferenceDisplay";
import { resolveMatchingBudgetBounds } from "../shared/buyerPreferenceBudget";
import { parseSqftMaxFromProfile, parseSqftMinFromProfile } from "../shared/buyerQualification";
import {
  extractBuyerMatchCriteria,
  getListingExclusionReason,
  rankInventoryMatches,
  listingHasPool,
  type MatchListingInput,
} from "../shared/inventory/inventoryMatchScoring";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const now = new Date().toISOString();
const inf = <T>(value: T, evidence = "test") => ({
  value,
  source: "inferred" as const,
  confidence: 0.9,
  updatedAt: now,
  evidence,
});

const msg =
  "Show me 4/2 up to 2000 SqFt with pool and up to $1mil in Pompano Beach";

const patch = heuristicPatchFromInboundText(msg);
assert(patch.priceMax?.value === 1_000_000, "up to $1mil → priceMax 1M");
assert(patch.priceMin == null, "up to $1mil does not set priceMin");
assert(patch.bedsMin?.value === 4 && patch.bathsMin?.value === 2, "4/2 parsed");
assert(patch.pool?.value === true, "pool parsed");
assert(
  patch.mustHaves?.value?.some((v) => String(v).startsWith("sqft_max:2000")),
  "up to 2000 sqft → sqft_max token",
);

let profile = mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), patch, undefined, {
  replaceArrayFields: ["targetAreas", "propertyTypes"],
});

// Simulate bad LLM state: priceMin duplicated at cap
profile = mergeBuyerPreferenceProfile(
  {
    ...profile,
    priceMin: inf(1_000_000, "budget mentioned"),
    priceMax: inf(1_000_000, "budget mentioned"),
  },
  patch,
);

const budget = resolveMatchingBudgetBounds(profile);
assert(budget.priceMax === 1_000_000, "matching budget max 1M");
assert(budget.priceMin == null, "cap-only budget clears priceMin floor");

const chip = buildBuyerPreferenceChips(profile).find((c) => c.id === "budget");
assert(chip?.value === "Up to $1M", `budget chip shows Up to $1M, got ${chip?.value}`);

assert(parseSqftMaxFromProfile(profile) === 2000, "sqft max 2000");
assert(parseSqftMinFromProfile(profile) == null, "no sqft min from up-to phrase");

const criteria = extractBuyerMatchCriteria(profile);
assert(criteria.priceMax === 1_000_000 && criteria.priceMin == null, "criteria cap-only budget");
assert(criteria.sqftMax === 2000 && criteria.sqftMin == null, "criteria sqft max only");
assert(criteria.bedsMin === 4 && criteria.bathsMin === 2, "criteria beds/baths minimum");
assert(criteria.hardRequirePool === true, "pool required");

const goodListing: MatchListingInput = {
  id: "good-1",
  providerListingId: "MLS-GOOD",
  status: "active",
  priceCents: 950_000_00,
  city: "Pompano Beach",
  state: "FL",
  addressLine1: "100 Ocean Dr",
  addressLine2: null,
  zip: "33062",
  beds: 4,
  baths: 2,
  propertyType: "house",
  propertySubtype: "Single Family Residence",
  squareFeet: 1850,
  listingDetails: { pool: true },
  description: "SFH with pool",
  features: ["Private Pool"],
  listingUrl: null,
  photos: [],
};

const overBudget: MatchListingInput = {
  ...goodListing,
  id: "over-budget",
  providerListingId: "MLS-HIGH",
  priceCents: 1_100_000_00,
};

const overSqft: MatchListingInput = {
  ...goodListing,
  id: "over-sqft",
  providerListingId: "MLS-BIG",
  squareFeet: 2400,
};

const underBudgetWithBadFloor: MatchListingInput = {
  ...goodListing,
  id: "cheap",
  providerListingId: "MLS-CHEAP",
  priceCents: 850_000_00,
};

assert(listingHasPool(goodListing), "pool detected from listingDetails + features");
assert(getListingExclusionReason(goodListing, criteria) == null, "good listing not excluded");

const ranked = rankInventoryMatches(
  [goodListing, overBudget, overSqft, underBudgetWithBadFloor],
  criteria,
  10,
);
assert(ranked.length >= 2, "good + cheap listing match when no budget floor");
assert(ranked.some((m) => m.listingId === "good-1"), "950k Pompano 4/2 pool ranks");
assert(ranked.some((m) => m.listingId === "cheap"), "850k listing not blocked by $1M floor");

assert(
  getListingExclusionReason(overBudget, criteria) === "over budget",
  "over budget excluded",
);
assert(
  getListingExclusionReason(overSqft, criteria) === "over max sqft",
  "over max sqft excluded",
);

console.log("pompano-pool-matching-audit.test.ts: all passed");
