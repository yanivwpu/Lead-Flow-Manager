/**
 * Regression: RESO features in listing haystack vs deal-breaker filtering.
 * Run: npx tsx tests/inventory-matching-regression.test.ts
 */
import {
  extractBuyerMatchCriteria,
  rankInventoryMatches,
  type MatchListingInput,
} from "../shared/inventory/inventoryMatchScoring";
import type { BuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const profile = {
  profileStatus: "complete",
  targetAreas: { value: ["Pompano Beach"], confidence: 0.9 },
  priceMax: { value: 800000, confidence: 0.9 },
  bedsMin: { value: 2, confidence: 0.9 },
  dealBreakers: { value: ["hoa"], confidence: 0.9 },
} as BuyerPreferenceProfile;

const criteria = extractBuyerMatchCriteria(profile);

const base: MatchListingInput = {
  id: "1",
  providerListingId: "M1",
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
  description: "Waterfront home with updates",
  listingUrl: null,
  features: [],
  photos: [{ url: "https://cdn.example.com/1.jpg", order: 0 }],
};

const withoutFeatures = rankInventoryMatches([base], criteria, 10);
const withHoaFeature = rankInventoryMatches(
  [{ ...base, features: ["Central Air", "HOA Fee Paid", "Pool"] }],
  criteria,
  10,
);

assert(withoutFeatures.length === 1, "listing matches when features empty and no HOA in haystack");
assert(
  withHoaFeature.length === 1,
  "MLS feature tokens do not trigger deal-breakers (only description/address fields)",
);

console.log("inventory-matching-regression.test.ts: OK");
