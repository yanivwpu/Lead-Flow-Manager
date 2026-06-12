/**
 * Rental profile → for-sale pivot must clear monthly budget and exclude rentals.
 * Run: npx tsx tests/rent-to-buy-pivot.test.ts
 */
import { heuristicPatchFromInboundText } from "../shared/buyerPreferenceExtractionNormalize";
import { mergeBuyerPreferenceProfile } from "../shared/buyerPreferenceMerge";
import { resolveMatchingBudgetBounds } from "../shared/buyerPreferenceBudget";
import { formatBuyerPreferenceBudgetLabel } from "../shared/buyerPreferenceDisplay";
import { emptyBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import {
  extractBuyerMatchCriteria,
  getListingExclusionReason,
  rankInventoryMatches,
  type MatchListingInput,
} from "../shared/inventory/inventoryMatchScoring";
import { formatListingPriceDisplay } from "../shared/inventory/listingTransactionIntent";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const now = new Date().toISOString();
const inf = <T>(value: T, evidence = "test") => ({
  value,
  source: "explicit" as const,
  confidence: 0.95,
  updatedAt: now,
  evidence,
});

const rentalProfile = mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), {
  transactionIntent: inf("rent", "rent intent in message"),
  priceMin: inf(3000, "budget range in message"),
  priceMax: inf(3400, "budget range in message"),
  bedsMin: inf(3),
  bathsMin: inf(2),
  targetAreas: inf(["Pompano Beach"]),
  propertyTypes: inf(["house"]),
  petFriendly: inf(true),
});

const buyMsg = "Show me homes for sale in Pompano with pool up to $850k";
const buyPatch = heuristicPatchFromInboundText(buyMsg);

assert(buyPatch.transactionIntent?.value === "buy", "for sale message sets buy intent");
assert(buyPatch.pool?.value === true, "pool parsed");
assert(buyPatch.priceMax?.value === 850_000, "sale cap $850k parsed");
assert(buyPatch.transactionIntent == null || buyPatch.transactionIntent.value !== "rent", "not rent");

const buyProfile = mergeBuyerPreferenceProfile(rentalProfile, buyPatch);

assert(buyProfile.transactionIntent?.value === "buy", "merged profile is buy");
assert(buyProfile.priceMax?.value === 850_000, "sale budget applied");
assert(buyProfile.priceMin == null, "monthly rent floor cleared");
assert(buyProfile.petFriendly == null, "rent-only field cleared");
assert(buyProfile.pool?.value === true, "pool kept on buy pivot");

const budget = resolveMatchingBudgetBounds(buyProfile);
assert(budget.priceMax === 850_000, "matching budget up to $850k");
assert(budget.priceMin == null, "no monthly rent min in matching");

const budgetLabel = formatBuyerPreferenceBudgetLabel(buyProfile);
assert(budgetLabel != null && budgetLabel.includes("850"), "preference chip shows sale budget not $3k rent");
assert(!budgetLabel?.includes("3,400"), "chip does not show old rent cap");

const beachPatch = heuristicPatchFromInboundText("Close to the beach");
assert(beachPatch.transactionIntent == null, "beach follow-up does not set intent");
assert(
  beachPatch.targetAreas?.value?.some((a) => /close to beach/i.test(a)),
  "beach proximity captured as area",
);

const afterBeach = mergeBuyerPreferenceProfile(buyProfile, beachPatch);
assert(afterBeach.transactionIntent?.value === "buy", "buy intent preserved after beach");
assert(
  afterBeach.targetAreas?.value?.some((a) => /close to beach/i.test(a)),
  "beach area merged",
);

const criteria = extractBuyerMatchCriteria(afterBeach);
assert(criteria.transactionIntent === "buy", "criteria buy");
assert(criteria.priceMax === 850_000, "criteria sale cap");
assert(criteria.hardRequirePool, "pool required");

const saleListing: MatchListingInput = {
  id: "sale-pool",
  providerListingId: "S1",
  status: "active",
  priceCents: 799_000_00,
  city: "Pompano Beach",
  state: "FL",
  addressLine1: "100 Ocean Dr",
  addressLine2: null,
  zip: "33062",
  beds: 3,
  baths: 2,
  propertyType: "house",
  listingDetails: { pool: true },
  description: "Pool home for sale",
  features: ["Pool"],
  listingUrl: null,
  photos: [],
};

const rentalListing: MatchListingInput = {
  ...saleListing,
  id: "rent-3900",
  providerListingId: "R3900",
  priceCents: 3_900_00,
  propertyType: "Residential Lease",
  propertySubtype: "Single Family Residence",
  description: "SFH for rent",
};

assert(
  getListingExclusionReason(rentalListing, criteria) === "rental/lease listing",
  "lease listing excluded for buy",
);

const monthlyPricedRow: MatchListingInput = {
  ...saleListing,
  id: "rent-monthly",
  providerListingId: "R3900b",
  priceCents: 3_900_00,
  propertyType: "house",
  description: "Active listing",
};

assert(
  getListingExclusionReason(monthlyPricedRow, criteria) === "rental/lease listing",
  "$3,900 row treated as monthly rent for buy intent",
);

const ranked = rankInventoryMatches([saleListing, rentalListing, monthlyPricedRow], criteria, 10);
assert(ranked.length === 1 && ranked[0].listingId === "sale-pool", "only for-sale listing ranks");

assert(
  formatListingPriceDisplay(saleListing.priceCents, saleListing, { transactionIntent: "buy" }) === "$799k",
  "sale listing shows sale price not /mo",
);

console.log("rent-to-buy-pivot.test.ts: OK");
