/**
 * SFH rental search must replace relaxed property types and enforce rent budget cap.
 * Run: npx tsx tests/sfh-rent-hard-filters.test.ts
 */
import { heuristicPatchFromInboundText } from "../shared/buyerPreferenceExtractionNormalize";
import {
  detectPreferenceArrayReplacements,
  hasInventoryPreferenceSignals,
} from "../shared/buyerPreferenceInventorySignals";
import { mergeBuyerPreferenceProfile } from "../shared/buyerPreferenceMerge";
import { emptyBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import {
  SHOW_ME_ALL_PROPERTY_RELAX_EVIDENCE,
  applyExplicitPropertyTypeInboundOverride,
} from "../shared/buyerPreferencePropertyTypeRelax";
import {
  extractBuyerMatchCriteria,
  getListingExclusionReason,
  labelExclusionReason,
  rankInventoryMatches,
  type MatchListingInput,
} from "../shared/inventory/inventoryMatchScoring";
import { resolveMatchingBudgetBounds } from "../shared/buyerPreferenceBudget";

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

const relaxMsg = "Show me all the 3/2 in Pompano between $3000 to $3400";
const sfhMsg = "Show me SFH for rent in Pompano up to $3000";

assert(hasInventoryPreferenceSignals(sfhMsg), "SFH rent message triggers fast path");

const relaxedProfile = mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), {
  transactionIntent: inf("rent", "rent intent in message"),
  propertyTypes: inf([...["house", "condo", "townhouse", "multi_family"]], SHOW_ME_ALL_PROPERTY_RELAX_EVIDENCE),
  targetAreas: inf(["Pompano"], "area in message"),
  bedsMin: inf(3, "beds in message"),
  bathsMin: inf(2, "baths in message"),
  priceMin: inf(3000, "budget range in message"),
  priceMax: inf(3400, "budget range in message"),
});

const sfhPatch = heuristicPatchFromInboundText(sfhMsg);
assert(sfhPatch.transactionIntent?.value === "rent", "heuristic detects rent");
assert(
  sfhPatch.propertyTypes?.value?.length === 1 && sfhPatch.propertyTypes.value[0] === "house",
  "heuristic SFH -> house only",
);
assert(sfhPatch.priceMax?.value === 3000, "heuristic up to 3000");
assert(sfhPatch.priceMin == null, "heuristic no priceMin on up-to");

const replaceFields = detectPreferenceArrayReplacements(sfhMsg);
assert(replaceFields.includes("propertyTypes"), "SFH triggers propertyTypes replace");

const merged = mergeBuyerPreferenceProfile(relaxedProfile, sfhPatch, undefined, {
  replaceArrayFields: replaceFields,
});

assert(merged.transactionIntent?.value === "rent", "stays rent");
assert(
  merged.propertyTypes?.value?.join(",") === "house",
  `house only, got ${merged.propertyTypes?.value?.join(",")}`,
);
assert(merged.priceMax?.value === 3000, "priceMax 3000");
assert(merged.priceMin == null, "priceMin cleared");

const budget = resolveMatchingBudgetBounds(merged);
assert(budget.priceMax === 3000 && budget.priceMin == null, "matching budget is cap-only 3000");

const llmPatch = {
  propertyTypes: inf(["house", "condo", "townhouse"], "property type mentioned"),
  priceMin: inf(3000, "budget range in message"),
  priceMax: inf(3400, "budget range in message"),
};
applyExplicitPropertyTypeInboundOverride(llmPatch, sfhMsg);
assert(
  llmPatch.propertyTypes?.value?.join(",") === "house",
  "LLM override forces house from inbound SFH",
);
assert(llmPatch.priceMax?.value === 3000, "LLM override forces up-to 3000");
assert(llmPatch.priceMin == null, "LLM override clears priceMin");

const criteria = extractBuyerMatchCriteria(merged);

const listings: MatchListingInput[] = [
  {
    id: "sfh-ok",
    providerListingId: "H1",
    status: "active",
    priceCents: 2_950_00,
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
    id: "townhouse-over",
    providerListingId: "T1",
    status: "active",
    priceCents: 3_800_00,
    city: "Pompano Beach",
    state: "FL",
    addressLine1: "2 Main",
    addressLine2: null,
    zip: "33062",
    beds: 3,
    baths: 2,
    propertyType: "townhouse",
    description: "Townhouse rent",
    features: [],
    listingUrl: null,
    photos: [],
  },
  {
    id: "house-over",
    providerListingId: "H2",
    status: "active",
    priceCents: 3_900_00,
    city: "Pompano Beach",
    state: "FL",
    addressLine1: "3 Main",
    addressLine2: null,
    zip: "33062",
    beds: 3,
    baths: 2,
    propertyType: "house",
    description: "SFH over budget",
    features: [],
    listingUrl: null,
    photos: [],
  },
];

const ranked = rankInventoryMatches(listings, criteria, 10);
assert(ranked.length === 1, "only in-budget SFH matches");
assert(ranked[0].listing.id === "sfh-ok", "correct listing matched");

assert(
  getListingExclusionReason(listings[1], criteria) === "wrong property type",
  "townhouse excluded by type",
);
assert(
  getListingExclusionReason(listings[2], criteria) === "over rent budget",
  "3900/mo excluded by rent budget",
);
assert(
  labelExclusionReason("over rent budget") === "Over rent budget",
  "inventory health label for over rent budget",
);
assert(
  labelExclusionReason("wrong property type") === "Wrong property type",
  "inventory health label for wrong property type",
);

console.log("sfh-rent-hard-filters.test.ts: OK");
