/**
 * Registry-based geo constraints — Federal/US-1 east-west (v1: pompano_federal_us1).
 * Run: npx tsx tests/inventory-geo-federal-gate.test.ts
 */
import {
  parseGeoConstraintsFromText,
  evaluateGeoConstraintForListing,
  geoConstraintsMatchScore,
  resolveGeoReferenceFromPhrase,
} from "../shared/inventory/buyerGeoConstraints";
import { geoReferenceRegistry, getGeoReference } from "../shared/inventory/geoReferenceRegistry";
import { heuristicPatchFromInboundText } from "../shared/buyerPreferenceExtractionNormalize";
import {
  extractBuyerMatchCriteria,
  rankInventoryMatches,
  type MatchListingInput,
} from "../shared/inventory/inventoryMatchScoring";
import { mergeBuyerPreferenceProfile } from "../shared/buyerPreferenceMerge";
import { emptyBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const POMPANO_REF = getGeoReference("pompano_federal_us1")!;
const FED_LNG = POMPANO_REF.dividerValue;

assert(!!geoReferenceRegistry.pompano_federal_us1, "registry has pompano_federal_us1");
assert(FED_LNG === -80.108, "registry divider longitude");

// Phrase parsing
const msg = "Do you have any SFH with pool East of Federal Hwy in Pompano?";
const parsed = parseGeoConstraintsFromText(msg);
assert(parsed.length === 1, "parses one geo constraint");
assert(parsed[0].referenceId === "pompano_federal_us1", "resolves to registry id");
assert(parsed[0].side === "east", "east side");
assert(parsed[0].cityContext?.toLowerCase().includes("pompano"), "city context");

const us1 = parseGeoConstraintsFromText("west of US-1 in Pompano Beach");
assert(us1[0]?.side === "west" && us1[0]?.referenceId === "pompano_federal_us1", "US-1 alias");

const heuristic = heuristicPatchFromInboundText(msg);
assert(
  heuristic.geoConstraints?.value?.[0]?.referenceId === "pompano_federal_us1",
  "heuristic patch stores geoConstraints",
);

const baseListing = (overrides: Partial<MatchListingInput>): MatchListingInput => ({
  id: "x",
  providerListingId: "PX",
  status: "active",
  priceCents: 400_000_00,
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
  listingDetails: { pool: true },
  latitude: 26.25,
  longitude: -80.095,
  ...overrides,
});

// East of Federal — pass (1240 NE 27th Ter pattern)
const eastPoolHouse = baseListing({
  id: "east1",
  providerListingId: "EAST1",
  addressLine1: "1240 NE 27th Ter",
  longitude: -80.095,
});
const eastResolved = {
  ...parsed[0],
  reference: POMPANO_REF,
};
assert(
  evaluateGeoConstraintForListing(eastPoolHouse, eastResolved) === "pass",
  "east-side house passes east constraint",
);

// West of Federal — fail (610 Misty Oaks pattern)
const westHouse = baseListing({
  id: "west1",
  providerListingId: "WEST1",
  addressLine1: "610 Misty Oaks Ln",
  longitude: -80.184,
  listingDetails: { pool: false },
});
assert(
  evaluateGeoConstraintForListing(westHouse, eastResolved) === "fail",
  "west-side house fails east constraint",
);

const westScore = geoConstraintsMatchScore(westHouse, parsed);
assert(westScore.hardExclude === true, "west house hard excluded for east request");

// Missing coords — unknown, no hard exclude
const noCoords = baseListing({
  id: "nocoords",
  latitude: null,
  longitude: null,
});
const noCoordScore = geoConstraintsMatchScore(noCoords, parsed);
assert(noCoordScore.hardExclude === false, "missing coords does not hard exclude");

// Rank integration
const profile = mergeBuyerPreferenceProfile(
  emptyBuyerPreferenceProfile(),
  heuristic,
  undefined,
  { replaceArrayFields: ["propertyTypes", "targetAreas"] },
);
const criteria = extractBuyerMatchCriteria(profile);
assert(criteria.geoConstraints.length === 1, "criteria includes geo constraints");

const ranked = rankInventoryMatches([eastPoolHouse, westHouse], criteria, 5);
assert(ranked.length === 1, "only east-side house ranks");
assert(ranked[0].listingId === "east1", "east pool house is top match");

// Registry extensibility — matcher uses registry, not inline Pompano constants
const fromRegistry = resolveGeoReferenceFromPhrase("federal highway", "Pompano");
assert(fromRegistry?.id === "pompano_federal_us1", "road resolved via registry only");

console.log("inventory-geo-federal-gate.test.ts: OK");
