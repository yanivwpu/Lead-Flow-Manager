/**
 * Susu rental search audit — legacy prefs, exclusions, qualification, merge.
 * Run: npx tsx tests/rental-match-audit.test.ts
 */
import { heuristicPatchFromInboundText } from "../shared/buyerPreferenceExtractionNormalize";
import {
  mergeBuyerPreferenceProfile,
  stripConflictingSalePreferences,
} from "../shared/buyerPreferenceMerge";
import { emptyBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import {
  assessBuyerQualification,
} from "../shared/buyerQualification";
import {
  countExclusionReasons,
  extractBuyerMatchCriteria,
  rankInventoryMatches,
  summarizeExclusionCounts,
  type MatchListingInput,
} from "../shared/inventory/inventoryMatchScoring";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const now = new Date().toISOString();
const inf = <T>(value: T) => ({
  value,
  source: "explicit" as const,
  confidence: 0.95,
  updatedAt: now,
  evidence: "test",
});

const rentalMsg =
  "Show me SFH for rent in Pompano Beach 3/2 between $2600 to $3400";

const legacyBuyProfile = mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), {
  pool: inf(true),
  waterfront: inf(true),
  modernStyle: inf(true),
  investmentIntent: inf(true),
  priceMin: inf(500_000),
  priceMax: inf(1_000_000),
  mustHaves: inf(["Ocean View", "sqft_max:2000"]),
  transactionIntent: inf("buy"),
});

const rentPatch = heuristicPatchFromInboundText(rentalMsg);
const rentalProfile = mergeBuyerPreferenceProfile(legacyBuyProfile, rentPatch);

assert(rentalProfile.transactionIntent?.value === "rent", "rent replaces buy intent");
assert(rentalProfile.pool == null, "pool cleared on rent switch");
assert(rentalProfile.waterfront == null, "waterfront cleared on rent switch");
assert(rentalProfile.modernStyle == null, "modern cleared on rent switch");
assert(rentalProfile.priceMax?.value === 3400, "rent budget max applied");
assert(
  !rentalProfile.mustHaves?.value?.some((v) => /ocean|sqft_max/i.test(String(v))),
  "purchase must-haves cleared",
);

const criteria = extractBuyerMatchCriteria(rentalProfile);
assert(criteria.transactionIntent === "rent", "criteria rent");
assert(!criteria.hardRequirePool, "pool not hard-required after rent merge");
assert(!criteria.hardRequireWaterfront, "waterfront not hard-required after rent merge");
assert(criteria.priceMax === 3400, "monthly rent cap in criteria");

const qual = assessBuyerQualification({
  profile: rentalProfile,
  inboundText: "Do you have any other listings?",
  matchCount: 1,
});
assert(qual.hasBuyRentIntent, "persisted rent counts as buy/rent intent");
assert(!qual.missing.includes("buy_rent"), "must not gap on buy/rent when rent persisted");
assert(
  !qual.suggestedQuestion.toLowerCase().includes("buying or renting"),
  "follow-up must not ask buying or renting",
);

const saleRows: MatchListingInput[] = Array.from({ length: 900 }, (_, i) => ({
  id: `sale-${i}`,
  providerListingId: `S${i}`,
  status: "active",
  priceCents: 600_000_00 + i * 1000_00,
  city: "Pompano Beach",
  state: "FL",
  addressLine1: `${i} Main`,
  addressLine2: null,
  zip: "33062",
  beds: 3,
  baths: 2,
  propertyType: "house",
  description: "For sale",
  features: [],
  listingUrl: null,
  photos: [],
}));

const rentals: MatchListingInput[] = [
  {
    id: "rent-1",
    providerListingId: "R1",
    status: "active",
    priceCents: 3_100_00,
    city: "Pompano Beach",
    state: "FL",
    addressLine1: "10 Rent Ln",
    addressLine2: null,
    zip: "33062",
    beds: 3,
    baths: 2,
    propertyType: "Residential Lease",
    propertySubtype: "Single Family Residence",
    description: "SFH for rent",
    features: [],
    listingUrl: null,
    photos: [],
  },
  {
    id: "rent-2",
    providerListingId: "R2",
    status: "active",
    priceCents: 3_300_00,
    city: "Pompano Beach",
    state: "FL",
    addressLine1: "12 Rent Ln",
    addressLine2: null,
    zip: "33062",
    beds: 3,
    baths: 2,
    propertyType: "Residential Lease",
    propertySubtype: "Single Family Residence",
    description: "Another rental",
    features: [],
    listingUrl: null,
    photos: [],
  },
];

const all = [...saleRows, ...rentals];
const counts = countExclusionReasons(all, criteria);
const summary = summarizeExclusionCounts(counts);
assert(summary.includes("Wrong transaction type (for sale)"), "sale rows counted in exclusions");
assert((counts.get("for-sale listing") ?? 0) >= 900, "bulk of inventory excluded as for-sale");

const ranked = rankInventoryMatches(all, criteria, 10);
assert(ranked.length >= 1, "at least one rental survives");
assert(ranked.every((m) => m.listing.priceCents! <= 340_000), "matches within rent budget");

stripConflictingSalePreferences(legacyBuyProfile);
assert(legacyBuyProfile.pool == null, "strip helper clears pool");

console.log("rental-match-audit.test.ts: OK");
console.log("Exclusion sample:", summary.slice(0, 200));
