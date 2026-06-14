/**
 * Regression: "3-5 bedrooms" must parse as bedsMin=3 bedsMax=5, not bedsMin=5.
 * Run: npx tsx tests/sfh-rent-bedroom-range-pompano.test.ts
 */
import {
  heuristicPatchFromInboundText,
  parseBedroomRangeFromText,
} from "../shared/buyerPreferenceExtractionNormalize";
import { detectPreferenceArrayReplacements } from "../shared/buyerPreferenceInventorySignals";
import { mergeBuyerPreferenceProfile } from "../shared/buyerPreferenceMerge";
import { emptyBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import { resolveMatchingBudgetBounds } from "../shared/buyerPreferenceBudget";
import {
  auditBuySearchMatchFunnel,
  extractBuyerMatchCriteria,
  getListingExclusionReason,
  rankInventoryMatches,
  type MatchListingInput,
} from "../shared/inventory/inventoryMatchScoring";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const msg = "Show me SFH 3-5 bedrooms 2 bath rentals in Pompano up to 4000";

assert(parseBedroomRangeFromText("3-5 bedrooms")?.min === 3, "range dash min");
assert(parseBedroomRangeFromText("3-5 bedrooms")?.max === 5, "range dash max");
assert(parseBedroomRangeFromText("3 to 5 bedrooms")?.min === 3, "range to min");
assert(parseBedroomRangeFromText("between 3 and 5 bedrooms")?.max === 5, "between max");

const patch = heuristicPatchFromInboundText(msg);
assert(patch.transactionIntent?.value === "rent", "rent intent");
assert(
  patch.propertyTypes?.value?.length === 1 && patch.propertyTypes.value[0] === "house",
  "SFH -> house",
);
assert(patch.priceMax?.value === 4000, "priceMax 4000");
assert(patch.bedsMin?.value === 3, `bedsMin 3, got ${patch.bedsMin?.value}`);
assert(patch.bedsMax?.value === 5, `bedsMax 5, got ${patch.bedsMax?.value}`);
assert(patch.bathsMin?.value === 2, "bathsMin 2");
assert(patch.bedsMin?.value !== 5, "must not treat upper bound as bedsMin");

const replaceFields = detectPreferenceArrayReplacements(msg);
const profile = mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), patch, undefined, {
  replaceArrayFields: replaceFields,
});
const budget = resolveMatchingBudgetBounds(profile);
assert(budget.priceMax === 4000, "budget cap 4000");

const criteria = extractBuyerMatchCriteria(profile);
assert(criteria.transactionIntent === "rent", "criteria rent");
assert(criteria.propertyTypes.join(",") === "house", "criteria house");
assert(criteria.bedsMin === 3, "criteria bedsMin 3");
assert(criteria.bedsMax === 5, "criteria bedsMax 5");
assert(criteria.bathsMin === 2, "criteria bathsMin 2");
assert(criteria.priceMax === 4000, "criteria priceMax");

const rental = (id: string, beds: number, price: number): MatchListingInput => ({
  id,
  providerListingId: id,
  status: "active",
  priceCents: price * 100,
  city: "Pompano Beach",
  state: "FL",
  addressLine1: `${beds} Main St`,
  addressLine2: null,
  zip: "33062",
  beds,
  baths: 2,
  propertyType: "house",
  propertySubtype: "Single Family Residence",
  listingDetails: { listingTransactionType: "rent" },
  description: "SFH rental",
  features: [],
  listingUrl: null,
  photos: [],
});

const listings = [
  rental("ok-3bd", 3, 3500),
  rental("ok-4bd", 4, 3800),
  rental("ok-5bd", 5, 3900),
  rental("low-2bd", 2, 3200),
  rental("high-6bd", 6, 3600),
  rental("over-budget", 4, 4200),
];

const ranked = rankInventoryMatches(listings, criteria, 50);
assert(ranked.length === 3, `3 in-range SFH rentals, got ${ranked.length}`);
assert(
  getListingExclusionReason(listings[3], criteria) === "under beds",
  "2bd excluded under min",
);
assert(
  getListingExclusionReason(listings[4], criteria) === "over bedroom max",
  "6bd excluded over max",
);

const funnel = auditBuySearchMatchFunnel(listings, criteria, { rankLimit: 50, sampleLimit: 20 });
const bedsStep = funnel.steps.find((s) => s.label.startsWith("Beds:"));
assert(bedsStep != null, "funnel has Beds step");
assert(bedsStep!.label === "Beds: 3–5 (or unknown)", `funnel label, got ${bedsStep!.label}`);
assert(bedsStep!.count === 3, `funnel beds gate count 3, got ${bedsStep!.count}`);
assert(funnel.rankedCount === 3, "funnel total qualifying 3");

console.log("sfh-rent-bedroom-range-pompano.test.ts: OK");
