/**
 * "Show me all…" broadens property type only — keeps rent/area/beds/budget.
 * Run: npx tsx tests/show-me-all-property-relax.test.ts
 */
import { heuristicPatchFromInboundText } from "../shared/buyerPreferenceExtractionNormalize";
import {
  detectPreferenceArrayReplacements,
  hasInventoryPreferenceSignals,
} from "../shared/buyerPreferenceInventorySignals";
import { mergeBuyerPreferenceProfile } from "../shared/buyerPreferenceMerge";
import { emptyBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import {
  extractBuyerMatchCriteria,
  getListingExclusionReason,
  rankInventoryMatches,
  type MatchListingInput,
} from "../shared/inventory/inventoryMatchScoring";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const now = new Date().toISOString();
const inf = <T>(value: T, evidence: string) => ({
  value,
  source: "inferred" as const,
  confidence: 0.9,
  updatedAt: now,
  evidence,
});

const relaxMsg =
  "Show me all the 3/2 in Pompano between $3000 to $3400";

assert(hasInventoryPreferenceSignals(relaxMsg), "beds/budget triggers fast path");
assert(
  detectPreferenceArrayReplacements(relaxMsg).includes("propertyTypes"),
  "show me all triggers propertyTypes replace",
);

const patch = heuristicPatchFromInboundText(relaxMsg);
assert(patch.propertyTypes?.value?.includes("condo"), "relaxes to condo");
assert(patch.propertyTypes?.value?.includes("house"), "relaxes to house");
assert(patch.propertyTypes?.value?.includes("townhouse"), "relaxes to townhouse");
assert(patch.bedsMin?.value === 3, "keeps 3 beds min");
assert(patch.bathsMin?.value === 2, "keeps 2 baths min");
assert(patch.priceMin?.value === 3000 && patch.priceMax?.value === 3400, "keeps budget");
assert(patch.transactionIntent == null, "does not flip to buy on show me all");

const priorSfhRent = mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), {
  transactionIntent: inf("rent", "rent intent in message"),
  propertyTypes: inf(["house"], "property type in message"),
  targetAreas: inf(["Pompano"], "area in message"),
  bedsMin: inf(3, "beds in message"),
  bedsMax: inf(4, "beds correction in message"),
  bathsMin: inf(2, "baths in message"),
  priceMin: inf(3000, "budget range in message"),
  priceMax: inf(3400, "budget range in message"),
  mustHaves: inf(["SFH", "no HOA"], "mustHaves mentioned"),
});

const merged = mergeBuyerPreferenceProfile(priorSfhRent, patch, undefined, {
  replaceArrayFields: detectPreferenceArrayReplacements(relaxMsg),
});

assert(merged.transactionIntent?.value === "rent", "keeps rent intent");
assert(merged.bedsMin?.value === 3, "beds min unchanged");
assert(merged.bedsMax?.value === 4, "beds max not relaxed");
assert(merged.priceMin?.value === 3000 && merged.priceMax?.value === 3400, "budget unchanged");
assert(merged.propertyTypes?.value?.includes("condo"), "profile includes condo after relax");
assert(!merged.mustHaves?.value?.some((v) => /sfh/i.test(String(v))), "SFH must-have cleared");

const criteria = extractBuyerMatchCriteria(merged);
assert(criteria.propertyTypes.includes("condo"), "matcher allows condo");

const listings: MatchListingInput[] = [
  {
    id: "sfh",
    providerListingId: "H1",
    status: "active",
    priceCents: 3_200_00,
    city: "Pompano Beach",
    state: "FL",
    addressLine1: "1 Main",
    addressLine2: null,
    zip: "33062",
    beds: 3,
    baths: 2,
    propertyType: "house",
    description: "SFH rent",
    features: [],
    listingUrl: null,
    photos: [],
  },
  {
    id: "condo",
    providerListingId: "C1",
    status: "active",
    priceCents: 3_100_00,
    city: "Pompano Beach",
    state: "FL",
    addressLine1: "2 Main",
    addressLine2: null,
    zip: "33062",
    beds: 3,
    baths: 2,
    propertyType: "condo",
    description: "Condo rent",
    features: [],
    listingUrl: null,
    photos: [],
  },
  {
    id: "commercial",
    providerListingId: "X1",
    status: "active",
    priceCents: 3_000_00,
    city: "Pompano Beach",
    state: "FL",
    addressLine1: "3 Main",
    addressLine2: null,
    zip: "33062",
    beds: 3,
    baths: 2,
    propertyType: "commercial_sale",
    description: "Commercial",
    features: [],
    listingUrl: null,
    photos: [],
  },
];

const ranked = rankInventoryMatches(listings, criteria, 10);
assert(ranked.length >= 2, "house and condo match");
assert(ranked.some((m) => m.listing.propertyType === "condo"), "condo included after relax");
assert(
  getListingExclusionReason(listings[2], criteria) === "wrong property type",
  "commercial excluded",
);

const specificTypeMsg = "Show me all condos in Pompano 3/2";
const specificPatch = heuristicPatchFromInboundText(specificTypeMsg);
assert(
  specificPatch.propertyTypes?.value?.length === 1 &&
    specificPatch.propertyTypes?.value?.[0] === "condo",
  "show me all condos does not broaden to every type",
);

console.log("show-me-all-property-relax.test.ts: OK");
