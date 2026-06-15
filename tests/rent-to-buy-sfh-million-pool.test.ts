/**
 * Rent profile → SFH + $1M + pool must clear rental gates and match sale listings only.
 * Run: npx tsx tests/rent-to-buy-sfh-million-pool.test.ts
 */
import { heuristicPatchFromInboundText } from "../shared/buyerPreferenceExtractionNormalize";
import { parseBuyerSearchCommand } from "../shared/buyerSearchCommand";
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
  priceMax: inf(4000, "monthly budget in message"),
  bedsMin: inf(3, "beds in message"),
  bedsMax: inf(5, "beds in message"),
  bathsMin: inf(2, "baths in message"),
  propertyTypes: inf(["house"], "sfh"),
  targetAreas: inf(["Pompano Beach"], "area in message"),
});

const msg = "Show me SFH up to $1 mil with pool in pompano";
const patch = heuristicPatchFromInboundText(msg);

assert(patch.transactionIntent?.value === "buy", "sale budget + SFH sets buy intent");
assert(patch.priceMax?.value === 1_000_000, "$1 mil parsed as sale cap");
assert(patch.pool?.value === true, "pool required parsed");
assert(
  patch.targetAreas?.value?.some((a) => /pompano/i.test(a)),
  "Pompano area parsed",
);

const cmd = parseBuyerSearchCommand(msg, rentalProfile);
assert(cmd.kind === "transaction_pivot", "rent→buy is transaction_pivot");
assert(cmd.clearUnmentionedHardGates === true, "full replacement clears stale rental gates");

const merged = mergeBuyerPreferenceProfile(rentalProfile, patch, {}, {
  replaceArrayFields: cmd.replaceArrayFields,
  clearUnmentionedHardGates: cmd.clearUnmentionedHardGates,
  currentMessagePatch: cmd.clearUnmentionedHardGates ? cmd.patch : undefined,
});

assert(merged.transactionIntent?.value === "buy", "merged profile is buy");
assert(merged.priceMax?.value === 1_000_000, "sale budget $1M applied");
assert(merged.priceMin == null, "rental priceMin cleared");
assert(merged.bedsMin == null, "stale bedsMin cleared");
assert(merged.bedsMax == null, "stale bedsMax cleared");
assert(merged.bathsMin == null, "stale bathsMin cleared");
assert(merged.pool?.value === true, "pool required on profile");

const budget = resolveMatchingBudgetBounds(merged);
assert(budget.priceMax === 1_000_000, "matching budget up to $1M");
assert(budget.priceMin == null, "no monthly rent min in matching");

const budgetLabel = formatBuyerPreferenceBudgetLabel(merged);
assert(budgetLabel != null && /1[,.]?0{3}[,.]?0{3}|1\s*m/i.test(budgetLabel), "chip shows $1M not $4k rent");
assert(!budgetLabel?.includes("4,000"), "chip does not show old rent cap");

const criteria = extractBuyerMatchCriteria(merged);
assert(criteria.transactionIntent === "buy", "criteria buy");
assert(criteria.priceMax === 1_000_000, "criteria sale cap");
assert(criteria.hardRequirePool, "pool hard-required");
assert(criteria.bedsMin == null, "criteria bedsMin cleared");
assert(criteria.bedsMax == null, "criteria bedsMax cleared");
assert(criteria.bathsMin == null, "criteria bathsMin cleared");

const saleListing: MatchListingInput = {
  id: "sale-pool-1m",
  providerListingId: "S1",
  status: "active",
  priceCents: 950_000_00,
  city: "Pompano Beach",
  state: "FL",
  addressLine1: "200 Pool Ln",
  addressLine2: null,
  zip: "33062",
  beds: 4,
  baths: 3,
  propertyType: "house",
  listingDetails: { pool: true },
  description: "SFH with pool for sale",
  features: ["Pool"],
  listingUrl: null,
  photos: [],
};

const rentalListing: MatchListingInput = {
  ...saleListing,
  id: "rent-4k",
  providerListingId: "R4k",
  priceCents: 4_000_00,
  propertyType: "Residential Lease",
  propertySubtype: "Single Family Residence",
  description: "SFH for rent",
};

assert(
  getListingExclusionReason(rentalListing, criteria) === "rental/lease listing",
  "lease listing excluded for buy",
);

const ranked = rankInventoryMatches([saleListing, rentalListing], criteria, 10);
assert(ranked.length === 1 && ranked[0].listingId === "sale-pool-1m", "only for-sale listing ranks");

console.log("rent-to-buy-sfh-million-pool.test.ts: OK");
