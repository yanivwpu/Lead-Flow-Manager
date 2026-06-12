/**
 * Rental intent — extraction, matching, budget, lead score.
 * Run: npx tsx tests/rental-intent-matching.test.ts
 */
import { heuristicPatchFromInboundText } from "../shared/buyerPreferenceExtractionNormalize";
import { mergeBuyerPreferenceProfile } from "../shared/buyerPreferenceMerge";
import { emptyBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import { resolveMatchingBudgetBounds } from "../shared/buyerPreferenceBudget";
import {
  extractBuyerMatchCriteria,
  getListingExclusionReason,
  rankInventoryMatches,
  type MatchListingInput,
} from "../shared/inventory/inventoryMatchScoring";
import {
  formatListingPriceDisplay,
  listingIsRentalOrLease,
} from "../shared/inventory/listingTransactionIntent";
import { scoreLead } from "../client/src/lib/leadScoring";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const rentalMsg = "Show me SFH for rent in Pompano 3/2 between $2600 to $3400";

const patch = heuristicPatchFromInboundText(rentalMsg);
assert(patch.transactionIntent?.value === "rent", "transactionIntent rent from for rent");
assert(patch.bedsMin?.value === 3 && patch.bathsMin?.value === 2, "3/2 parsed");
assert(patch.priceMin?.value === 2600 && patch.priceMax?.value === 3400, "monthly rent range parsed");

const profile = mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), patch);
assert(profile.transactionIntent?.value === "rent", "merged profile keeps rent intent");

const budget = resolveMatchingBudgetBounds(profile);
assert(budget.priceMin === 2600 && budget.priceMax === 3400, "matching budget uses monthly rent");

const criteria = extractBuyerMatchCriteria(profile);
assert(criteria.transactionIntent === "rent", "criteria transactionIntent rent");

const saleListing: MatchListingInput = {
  id: "sale-795",
  providerListingId: "S795",
  status: "active",
  priceCents: 795_000_00,
  city: "Pompano Beach",
  state: "FL",
  addressLine1: "100 Sale St",
  addressLine2: null,
  zip: "33062",
  beds: 3,
  baths: 2,
  propertyType: "house",
  description: "Single family for sale",
  features: [],
  listingUrl: null,
  photos: [],
};

const rentalListing: MatchListingInput = {
  ...saleListing,
  id: "rent-3200",
  providerListingId: "R3200",
  priceCents: 3_200_00,
  propertyType: "Residential Lease",
  propertySubtype: "Single Family Residence",
  description: "SFH for rent in Pompano",
  features: ["Pool"],
};

assert(listingIsRentalOrLease(rentalListing), "lease listing detected");

const saleExclusion = getListingExclusionReason(saleListing, criteria);
assert(
  saleExclusion === "for-sale listing" ||
    saleExclusion === "over budget" ||
    saleExclusion === "not a rental/lease listing",
  `sale listing excluded for rent intent (got: ${saleExclusion})`,
);

const ranked = rankInventoryMatches([saleListing, rentalListing], criteria, 10);
assert(ranked.length === 1, "only rental listing ranks");
assert(ranked[0].listingId === "rent-3200", "rental listing returned");

assert(
  formatListingPriceDisplay(rentalListing.priceCents, rentalListing, { transactionIntent: "rent" }) ===
    "$3,200/mo",
  "rental price formatted monthly",
);

const buyProfile = mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), {
  transactionIntent: {
    value: "buy",
    source: "explicit",
    confidence: 1,
    updatedAt: new Date().toISOString(),
    evidence: "buy intent in message",
  },
  priceMax: { value: 1_000_000, source: "explicit", confidence: 1, updatedAt: new Date().toISOString(), evidence: "budget" },
});
const buyCriteria = extractBuyerMatchCriteria(buyProfile);
assert(
  getListingExclusionReason(rentalListing, buyCriteria) === "rental/lease listing",
  "rental excluded for buy intent",
);

const priorHot = scoreLead(
  [
    { direction: "inbound", content: "Looking to buy a home in Pompano up to $900k" },
    { direction: "outbound", content: "Great, what beds and baths?" },
  ],
  { industry: "real_estate" },
);

const afterRental = scoreLead(
  [
    { direction: "inbound", content: "Looking to buy a home in Pompano up to $900k" },
    { direction: "outbound", content: "Great, what beds and baths?" },
    { direction: "inbound", content: rentalMsg },
  ],
  { industry: "real_estate" },
);

assert(afterRental.score >= 75, "specific rental criteria keeps high intent score");
assert(afterRental.bucket === "hot", "rental search stays hot bucket");
assert(afterRental.score >= priorHot.score - 5, "score does not drop sharply after rental pivot");

console.log("rental-intent-matching.test.ts: OK");
