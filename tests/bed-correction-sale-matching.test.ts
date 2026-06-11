/**
 * Bed correction + sale-only matching filters.
 * Run: npx tsx tests/bed-correction-sale-matching.test.ts
 */
import { heuristicPatchFromInboundText } from "../shared/buyerPreferenceExtractionNormalize";
import { mergeBuyerPreferenceProfile } from "../shared/buyerPreferenceMerge";
import { emptyBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import {
  extractBuyerMatchCriteria,
  getListingExclusionReason,
  rankInventoryMatches,
  type MatchListingInput,
} from "../shared/inventory/inventoryMatchScoring";
import {
  listingIsLikelyMonthlyRentPrice,
  listingIsRentalOrLease,
} from "../shared/inventory/listingTransactionIntent";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const correctionMsg =
  "5 beds is too big. Show me 4/2 up to 2000 SqFt with pool and up to $1mil in Pompano Beach";

const patch = heuristicPatchFromInboundText(correctionMsg);
assert(patch.bedsMin?.value === 4 && patch.bedsMax?.value === 4, "correction sets beds 4 min+max");
assert(patch.bathsMin?.value === 2, "correction sets 2 baths");
assert(patch.transactionIntent?.value === "buy", "show me implies buy intent");

let profile = mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), {
  bedsMin: { value: 5, source: "inferred", confidence: 0.8, updatedAt: new Date().toISOString(), evidence: "beds in message" },
  bathsMin: { value: 4, source: "inferred", confidence: 0.8, updatedAt: new Date().toISOString(), evidence: "baths in message" },
});

profile = mergeBuyerPreferenceProfile(profile, patch);

assert(profile.bedsMin?.value === 4, "merged bedsMin corrected to 4");
assert(profile.bedsMax?.value === 4, "merged bedsMax set to 4");
assert(profile.bathsMin?.value === 2, "merged bathsMin corrected to 2");

const criteria = extractBuyerMatchCriteria(profile);
assert(criteria.bedsMax === 4, "criteria bedsMax 4");
assert(criteria.transactionIntent === "buy", "defaults to buy");

const saleListing: MatchListingInput = {
  id: "sale-1",
  providerListingId: "S1",
  status: "active",
  priceCents: 950_000_00,
  city: "Pompano Beach",
  state: "FL",
  addressLine1: "1 Main",
  addressLine2: null,
  zip: "33062",
  beds: 4,
  baths: 2,
  propertyType: "house",
  squareFeet: 1800,
  listingDetails: { pool: true },
  description: "SFH with pool",
  features: ["Private Pool"],
  listingUrl: null,
  photos: [],
};

const fiveBedSale: MatchListingInput = {
  ...saleListing,
  id: "five-bed",
  providerListingId: "S5",
  beds: 5,
};

const rentalListing: MatchListingInput = {
  ...saleListing,
  id: "rent-1",
  providerListingId: "R1",
  priceCents: 8_000_00,
  propertyType: "Residential Lease",
  propertySubtype: "Single Family Residence",
  description: "For rent — residential lease",
  features: ["Pool"],
};

assert(listingIsRentalOrLease(rentalListing), "lease property type detected");
assert(
  listingIsLikelyMonthlyRentPrice(8_000_00, { transactionIntent: "buy", priceMax: 1_000_000 }),
  "$8k treated as monthly rent for $1M buyer",
);

assert(
  getListingExclusionReason(fiveBedSale, criteria) === "over bedroom max",
  "5-bed excluded after correction",
);
assert(
  getListingExclusionReason(rentalListing, criteria) === "rental/lease listing",
  "rental excluded for buy intent",
);

const ranked = rankInventoryMatches([saleListing, fiveBedSale, rentalListing], criteria, 10);
assert(ranked.length === 1 && ranked[0].listingId === "sale-1", "only 4-bed sale ranks");

console.log("bed-correction-sale-matching.test.ts: all passed");
