/**
 * Buy → rent pivot: apartment + monthly budget for friend, anywhere.
 * Run: npx tsx tests/buy-to-rent-friend-apartment.test.ts
 */
import { heuristicPatchFromInboundText } from "../shared/buyerPreferenceExtractionNormalize";
import { mergeBuyerPreferenceProfile } from "../shared/buyerPreferenceMerge";
import { emptyBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import { parseBuyerSearchCommand } from "../shared/buyerSearchCommand";
import { describeActiveSearchFilters } from "../shared/buyerSearchCommandDebug";
import { resolveMatchingBudgetBounds } from "../shared/buyerPreferenceBudget";
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
const inf = <T>(value: T, evidence = "test") => ({
  value,
  source: "inferred" as const,
  confidence: 0.9,
  updatedAt: now,
  evidence,
});

const priorBuyProfile = mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), {
  transactionIntent: inf("buy", "buy intent in message"),
  priceMax: inf(500_000, "up to budget in message"),
  propertyTypes: inf(["house"], "sfh"),
  targetAreas: inf(["Pompano Beach"], "area"),
  pool: inf(true, "pool required in message"),
});

const MSG =
  "Actually I also looking for 2 bed apartment for my friend anywhere between 2000-2500 dollars";

const patch = heuristicPatchFromInboundText(MSG);
assert(patch.transactionIntent?.value === "rent", `rent intent (got ${patch.transactionIntent?.value})`);
assert(patch.priceMin?.value === 2000, `priceMin 2000 (got ${patch.priceMin?.value})`);
assert(patch.priceMax?.value === 2500, `priceMax 2500 (got ${patch.priceMax?.value})`);
assert(patch.bedsMin?.value === 2, `bedsMin 2 (got ${patch.bedsMin?.value})`);
assert(
  patch.propertyTypes?.value?.includes("condo") === true,
  `apartment -> condo (got ${patch.propertyTypes?.value?.join()})`,
);
assert(
  patch.targetAreas?.value?.length === 0,
  `anywhere clears areas (got ${JSON.stringify(patch.targetAreas?.value)})`,
);

const cmd = parseBuyerSearchCommand(MSG, priorBuyProfile);
assert(
  cmd.kind === "transaction_pivot" || cmd.kind === "new_search",
  `pivot or replacement (got ${cmd.kind})`,
);
assert(cmd.clearUnmentionedHardGates === true, "clears stale buy gates on rent pivot");

const merged = mergeBuyerPreferenceProfile(priorBuyProfile, cmd.patch, undefined, {
  replaceArrayFields: cmd.replaceArrayFields,
  clearUnmentionedHardGates: cmd.clearUnmentionedHardGates,
  currentMessagePatch: cmd.clearUnmentionedHardGates ? cmd.patch : undefined,
});

const criteria = extractBuyerMatchCriteria(merged);
const budget = resolveMatchingBudgetBounds(merged);

assert(merged.transactionIntent?.value === "rent", "persisted rent intent");
assert(budget.priceMin === 2000, `merged priceMin 2000 (got ${budget.priceMin})`);
assert(budget.priceMax === 2500, `merged priceMax 2500 (got ${budget.priceMax})`);
assert(criteria.bedsMin === 2, "bedsMin 2");
assert(criteria.propertyTypes.includes("condo"), "condo/apartment type");
assert(criteria.areas.length === 0, `areas cleared (got ${criteria.areas.join()})`);
assert(merged.pool == null, "pool cleared on rent pivot");
assert(criteria.hardRequirePool === false, "hardRequirePool false");
assert(criteria.priceMax === 2500 && criteria.priceMax < 10_000, "no sale budget cap");

const filters = describeActiveSearchFilters(merged, criteria);
assert(filters.includes("Rent"), `filters show Rent (got ${filters})`);
assert(filters.includes("/mo") || filters.includes("2,000"), `filters show rent budget (got ${filters})`);
assert(!filters.includes("600k") && !filters.includes("500k"), `no sale budget in filters (got ${filters})`);
assert(!filters.includes("Pompano"), `no stale area (got ${filters})`);

const saleCondo: MatchListingInput = {
  id: "sale-600k",
  providerListingId: "S600",
  status: "active",
  priceCents: 600_000_00,
  city: "Pompano Beach",
  state: "FL",
  addressLine1: "1 Sale St",
  addressLine2: null,
  zip: "33062",
  beds: 2,
  baths: 2,
  propertyType: "Condominium",
  listingDetails: { listingTransactionType: "sale" },
  description: "Condo for sale",
  features: [],
  listingUrl: null,
  photos: [],
};

const rentApartment: MatchListingInput = {
  ...saleCondo,
  id: "rent-2200",
  providerListingId: "R2200",
  priceCents: 2_200_00,
  propertyType: "Residential Lease",
  propertySubtype: "Apartment",
  listingDetails: { listingTransactionType: "rent" },
  description: "Apartment for rent",
};

const rentTooHigh: MatchListingInput = {
  ...rentApartment,
  id: "rent-3000",
  providerListingId: "R3000",
  priceCents: 3_000_00,
};

assert(
  getListingExclusionReason(saleCondo, criteria) === "for-sale listing",
  "sale condo excluded for rent search",
);
assert(
  getListingExclusionReason(rentApartment, criteria) == null,
  "qualifying rent apartment not excluded",
);
assert(
  getListingExclusionReason(rentTooHigh, criteria) === "over rent budget",
  "over-budget rent excluded",
);

const ranked = rankInventoryMatches([saleCondo, rentApartment, rentTooHigh], criteria, 10);
assert(ranked.length === 1 && ranked[0].listingId === "rent-2200", "only in-budget rent ranks");

console.log("buy-to-rent-friend-apartment.test.ts: OK");
