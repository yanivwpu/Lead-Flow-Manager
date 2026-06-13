/**
 * Cash buyer SFH Pompano pool $899k 4+ beds — parsing + matching gates.
 * Run: npx tsx tests/pompano-sfh-cash-buyer-matching.test.ts
 */
import { heuristicPatchFromInboundText } from "../shared/buyerPreferenceExtractionNormalize";
import { mergeBuyerPreferenceProfile } from "../shared/buyerPreferenceMerge";
import { emptyBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import { resolveMatchingBudgetBounds } from "../shared/buyerPreferenceBudget";
import { parseBuyerSearchCommand } from "../shared/buyerSearchCommand";
import {
  extractBuyerMatchCriteria,
  getListingExclusionReason,
  rankInventoryMatches,
  normalizeListingPropertyType,
  countExclusionReasons,
  type MatchListingInput,
} from "../shared/inventory/inventoryMatchScoring";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const msg =
  "I'm a cash buyer I can buy a home up to $899. Looking for SFH in Pompano with pool at east 4 bedrooms";

const patch = heuristicPatchFromInboundText(msg);
assert(patch.transactionIntent?.value === "buy", "buy intent");
assert(patch.priceMax?.value === 899_000, `priceMax 899k (got ${patch.priceMax?.value})`);
assert(patch.propertyTypes?.value?.join() === "house", "SFH -> house only");
assert(patch.pool?.value === true, "pool required");
assert(patch.bedsMin?.value === 4, "at least 4 beds (at east typo)");
assert(
  patch.targetAreas?.value?.some((a) => /pompano/i.test(a)) === true,
  `Pompano area (got ${patch.targetAreas?.value?.join(", ")})`,
);
assert(
  !patch.targetAreas?.value?.some((a) => /with pool/i.test(a)),
  "area must not include 'with pool'",
);

let profile = mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), patch, {
  replaceArrayFields: parseBuyerSearchCommand(msg, emptyBuyerPreferenceProfile()).replaceArrayFields,
});

const budget = resolveMatchingBudgetBounds(profile);
assert(budget.priceMax === 899_000, "matching budget 899k");
assert(budget.priceMin == null, "cap-only budget");

const criteria = extractBuyerMatchCriteria(profile);
assert(criteria.transactionIntent === "buy", "criteria buy");
assert(criteria.priceMax === 899_000, "criteria price max");
assert(criteria.propertyTypes.join() === "house", "criteria house only");
assert(criteria.hardRequirePool === true, "pool hard gate");
assert(criteria.bedsMin === 4, "beds min 4");
assert(criteria.areas.some((a) => /pompano/i.test(a)), "criteria has Pompano");

const goodHouse: MatchListingInput = {
  id: "good-sfh",
  providerListingId: "MLS-GOOD",
  status: "active",
  priceCents: 875_000_00,
  city: "Pompano Beach",
  state: "FL",
  addressLine1: "100 Ocean Dr",
  addressLine2: null,
  zip: "33062",
  beds: 4,
  baths: 3,
  propertyType: "house",
  propertySubtype: "Single Family Residence",
  listingDetails: { pool: true },
  description: "SFH with pool",
  features: ["Private Pool"],
  listingUrl: null,
  photos: [],
};

const townhouse: MatchListingInput = {
  ...goodHouse,
  id: "townhouse",
  providerListingId: "MLS-TH",
  propertyType: "Townhouse",
  propertySubtype: "Townhouse",
};

const townhome: MatchListingInput = {
  ...goodHouse,
  id: "townhome",
  providerListingId: "MLS-TH2",
  propertyType: "Townhome",
  propertySubtype: null,
};

const noPool: MatchListingInput = {
  ...goodHouse,
  id: "no-pool",
  providerListingId: "MLS-NP",
  listingDetails: { pool: false },
  features: [],
  description: "No pool",
};

const threeBeds: MatchListingInput = {
  ...goodHouse,
  id: "3-bed",
  providerListingId: "MLS-3",
  beds: 3,
};

const overBudget: MatchListingInput = {
  ...goodHouse,
  id: "over",
  providerListingId: "MLS-HIGH",
  priceCents: 950_000_00,
};

const wrongCity: MatchListingInput = {
  ...goodHouse,
  id: "boca",
  providerListingId: "MLS-BOCA",
  city: "Boca Raton",
};

const rental: MatchListingInput = {
  ...goodHouse,
  id: "rent",
  providerListingId: "MLS-RENT",
  propertyType: "Residential Lease",
  priceCents: 4_500_00,
};

assert(normalizeListingPropertyType("Townhome") === "townhouse", "townhome -> townhouse not house");

assert(getListingExclusionReason(goodHouse, criteria) == null, "good SFH matches");
assert(getListingExclusionReason(townhouse, criteria) === "wrong property type", "townhouse excluded");
assert(getListingExclusionReason(townhome, criteria) === "wrong property type", "townhome excluded");
assert(getListingExclusionReason(noPool, criteria) === "missing pool", "no pool excluded");
assert(getListingExclusionReason(threeBeds, criteria) === "under beds", "3 beds excluded");
assert(getListingExclusionReason(overBudget, criteria) === "over budget", "over budget excluded");
assert(getListingExclusionReason(wrongCity, criteria) === "outside area", "outside area excluded");
assert(
  getListingExclusionReason(rental, criteria) === "rental/lease listing" ||
    getListingExclusionReason(rental, criteria) === "not a rental/lease listing",
  "rental excluded for buy",
);

const pool = [
  goodHouse,
  townhouse,
  townhome,
  noPool,
  threeBeds,
  overBudget,
  wrongCity,
  rental,
  { ...goodHouse, id: "cheap", providerListingId: "MLS-CHEAP", priceCents: 650_000_00 },
];

const ranked = rankInventoryMatches(pool, criteria, 10);
assert(ranked.length === 2, `two SFH matches in Pompano (got ${ranked.length})`);
assert(ranked.every((m) => m.listingId === "good-sfh" || m.listingId === "cheap"), "only valid SFH");
assert(ranked.every((m) => m.score >= 35), "scores above min threshold");

const counts = countExclusionReasons(pool, criteria);
assert((counts.get("wrong property type") ?? 0) >= 2, "exclusion counts track property type");

const poolOptionalMsg =
  "I'm a cash buyer I can buy a home up to $899. Looking for SFH in Pompano with or without pool at least 3 bedrooms";
const poolOptPatch = heuristicPatchFromInboundText(poolOptionalMsg);
assert(poolOptPatch.pool?.value === false, "with or without pool -> pool optional");
assert(poolOptPatch.bedsMin?.value === 3, "relaxed message -> 3 beds min");

let strictProfile = mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), patch, undefined, {
  replaceArrayFields: parseBuyerSearchCommand(msg, emptyBuyerPreferenceProfile()).replaceArrayFields,
});
strictProfile = mergeBuyerPreferenceProfile(strictProfile, poolOptPatch, undefined, {
  replaceArrayFields: parseBuyerSearchCommand(poolOptionalMsg, emptyBuyerPreferenceProfile()).replaceArrayFields,
});
assert(strictProfile.pool == null, "pool optional clears prior pool=true");

const relaxedProfile = mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), poolOptPatch, undefined, {
  replaceArrayFields: parseBuyerSearchCommand(poolOptionalMsg, emptyBuyerPreferenceProfile()).replaceArrayFields,
});
const relaxedCriteria = extractBuyerMatchCriteria(relaxedProfile);
assert(relaxedCriteria.hardRequirePool === false, "relaxed search no pool gate");
assert(relaxedCriteria.bedsMin === 3, "relaxed beds min 3");
assert(getListingExclusionReason(noPool, relaxedCriteria) == null, "no pool allowed when optional");

const relaxedRanked = rankInventoryMatches(pool, relaxedCriteria, 10);
assert(relaxedRanked.length >= 2, `relaxed pool matches include no-pool SFH (got ${relaxedRanked.length})`);
assert(
  relaxedRanked.some((m) => m.listingId === "no-pool"),
  "no-pool listing included when pool optional",
);

console.log("pompano-sfh-cash-buyer-matching.test.ts: OK");
