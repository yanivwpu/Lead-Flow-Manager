/**
 * Hard matching gates — property type, pool, waterfront.
 * Run: npx tsx tests/inventory-matching-hard-gates.test.ts
 */
import {
  extractBuyerMatchCriteria,
  rankInventoryMatches,
  listingPassesHardGatesForCriteria,
  normalizeListingPropertyType,
  type MatchListingInput,
} from "../shared/inventory/inventoryMatchScoring";
import { emptyBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const now = new Date().toISOString();
const inf = <T>(value: T) => ({
  value,
  source: "explicit" as const,
  confidence: 1,
  updatedAt: now,
});

const base = (overrides: Partial<MatchListingInput>): MatchListingInput => ({
  id: "x",
  providerListingId: "PX",
  status: "active",
  priceCents: 500_000_00,
  city: "Pompano Beach",
  state: "FL",
  addressLine1: "1 Main St",
  addressLine2: null,
  zip: "33062",
  beds: 3,
  baths: 2,
  propertyType: "house",
  description: "",
  features: [],
  listingUrl: null,
  photos: [],
  ...overrides,
});

assert(normalizeListingPropertyType("Single Family Residence", "SFH") === "house", "SFH normalizes to house");

const houseCriteria = extractBuyerMatchCriteria({
  ...emptyBuyerPreferenceProfile(),
  propertyTypes: inf(["house"]),
  targetAreas: inf(["Pompano"]),
});

const condoListing = base({ id: "c1", providerListingId: "C1", propertyType: "condo" });
const houseListing = base({ id: "h1", providerListingId: "H1", propertyType: "house" });

assert(
  !listingPassesHardGatesForCriteria(condoListing, houseCriteria),
  "condo excluded when buyer wants house",
);
assert(
  listingPassesHardGatesForCriteria(houseListing, houseCriteria),
  "house passes when buyer wants house",
);

const rankedType = rankInventoryMatches([condoListing, houseListing], houseCriteria, 10);
assert(rankedType.length === 1 && rankedType[0].listing.propertyType === "house", "only house in results");

const poolCriteria = extractBuyerMatchCriteria({
  ...emptyBuyerPreferenceProfile(),
  propertyTypes: inf(["house"]),
  pool: inf(true),
  mustHaves: inf(["must have pool"]),
});

const poolListing = base({
  id: "p1",
  providerListingId: "P1",
  listingDetails: { pool: true },
  features: ["Pool"],
});
const dryListing = base({
  id: "p2",
  providerListingId: "P2",
  listingDetails: { pool: false },
  description: "No pool here",
});

const rankedPool = rankInventoryMatches([poolListing, dryListing], poolCriteria, 10);
assert(rankedPool.length === 1, "no-pool listing excluded when pool required");
assert(rankedPool[0].listingId === "p1", "pool listing ranks");

const wfCriteria = extractBuyerMatchCriteria({
  ...emptyBuyerPreferenceProfile(),
  waterfront: inf(true),
});

const wfListing = base({
  id: "w1",
  providerListingId: "W1",
  listingDetails: { waterfront: true },
  description: "waterfront home",
});
const inland = base({ id: "w2", providerListingId: "W2", description: "inland lot" });

const rankedWf = rankInventoryMatches([wfListing, inland], wfCriteria, 10);
assert(rankedWf.length === 1, "non-waterfront excluded when waterfront required");

console.log("inventory-matching-hard-gates.test.ts: OK");
