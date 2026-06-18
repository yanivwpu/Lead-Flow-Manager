/**
 * Inventory match diagnostics builder + DB funnel payload.
 * Run: npx tsx tests/inventory-match-diagnostics.test.ts
 */
import {
  buildDbInventoryMatchDiagnostics,
  buildInventoryMatchDiagnostics,
  formatFunnelExcludedSampleLine,
  formatInventoryMatchRunTime,
} from "../shared/inventory/inventoryMatchDiagnostics";
import { inventoryMatchDiagnosticsSchema } from "../shared/inventory/inventoryMatchTypes";
import { auditBuySearchMatchFunnel, extractBuyerMatchCriteria } from "../shared/inventory/inventoryMatchScoring";
import { emptyBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import { buildPersistedProfileSnapshotForDiagnostics } from "../shared/buyerSearchCommandDebug";
import type { MatchListingInput } from "../shared/inventory/inventoryMatchScoring";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const built = buildInventoryMatchDiagnostics({
  activeInventoryCount: 613,
  listingsScored: 613,
  matchesReturned: 4,
  totalQualifyingMatches: 60,
  lastMatchingError: null,
  lastMatchRunAt: "2026-06-09T12:00:00.000Z",
});

const parsed = inventoryMatchDiagnosticsSchema.safeParse(built);
assert(parsed.success, "diagnostics schema validates");
assert(built.activeInventoryCount === 613, "active count");
assert(built.matchesReturned === 4, "matches returned");
assert(built.lastMatchingError === null, "no error");
assert(formatInventoryMatchRunTime(built.lastMatchRunAt).length > 0, "formats run time");

const listings: MatchListingInput[] = [
  {
    id: "a",
    providerListingId: "MLS-A",
    status: "active",
    priceCents: 500_000_00,
    city: "Pompano Beach",
    state: "FL",
    addressLine1: "1 Main",
    addressLine2: null,
    zip: "33062",
    beds: 4,
    baths: 2,
    propertyType: "house",
    propertySubtype: null,
    listingDetails: { pool: true },
    description: null,
    features: [],
    listingUrl: null,
    photos: [],
  },
];

const criteria = extractBuyerMatchCriteria({
  ...emptyBuyerPreferenceProfile(),
  transactionIntent: { value: "buy", source: "explicit", confidence: 1, updatedAt: "", evidence: "" },
  targetAreas: { value: ["Pompano Beach"], source: "explicit", confidence: 1, updatedAt: "", evidence: "" },
  propertyTypes: { value: ["house"], source: "explicit", confidence: 1, updatedAt: "", evidence: "" },
  priceMax: { value: 899_000, source: "explicit", confidence: 1, updatedAt: "", evidence: "" },
  pool: { value: true, source: "explicit", confidence: 1, updatedAt: "", evidence: "" },
  bedsMin: { value: 4, source: "explicit", confidence: 1, updatedAt: "", evidence: "" },
});

const funnel = auditBuySearchMatchFunnel(listings, criteria, { rankLimit: 10, sampleLimit: 20 });
const dbDiag = buildDbInventoryMatchDiagnostics({
  activeInventoryCount: 933,
  agentShareEligibleCount: 900,
  agentShareExclusions: {
    inactive: 10,
    missingInternetDisplay: 15,
    missingAttribution: 8,
  },
  dbCandidatesAfterHardFilters: 900,
  rowsLoadedForScoring: 900,
  matchesReturned: 1,
  totalQualifyingMatches: 1,
  matchingFetchLimit: 1000,
  funnel,
  persistedProfileSnapshot: buildPersistedProfileSnapshotForDiagnostics(
    {
      ...emptyBuyerPreferenceProfile(),
      priceMax: { value: 899_000, source: "explicit", confidence: 1, updatedAt: "", evidence: "" },
      pool: { value: true, source: "explicit", confidence: 1, updatedAt: "", evidence: "" },
    },
    criteria,
  ),
});

assert(inventoryMatchDiagnosticsSchema.safeParse(dbDiag).success, "DB funnel diagnostics validate");
assert(dbDiag.funnelSteps != null && dbDiag.funnelSteps.length > 0, "includes funnel steps");
assert(dbDiag.inventoryCapTruncated === false, "cap not truncated when under limit");
assert(
  formatFunnelExcludedSampleLine({
    listingId: "x",
    providerListingId: "MLS-X",
    address: "1 Main",
    city: "Pompano Beach",
    priceCents: 500_000_00,
    beds: 4,
    propertyType: "house",
    propertySubtype: "Single Family Residence",
    resolvedType: "house",
    listingTransactionType: "sale",
    poolDetected: true,
    exclusionReason: "Missing pool",
    matched: false,
    score: null,
  }).includes("Missing pool"),
  "rich sample formatter",
);
assert(
  formatFunnelExcludedSampleLine({
    listingId: "y",
    providerListingId: "MLS-Y",
    address: "111 SE 7th Ave",
    city: "Pompano Beach",
    priceCents: 3_900_00,
    beds: 4,
    propertyType: "townhouse",
    propertySubtype: "Townhouse",
    resolvedType: "townhouse",
    listingTransactionType: "rent",
    poolDetected: false,
    exclusionReason: "PASS resolved=townhouse rawType=townhouse rawSub=Townhouse txn=rent",
    matched: true,
    score: 72,
  }).includes("MATCH") && formatFunnelExcludedSampleLine({
    listingId: "y",
    providerListingId: "MLS-Y",
    address: "111 SE 7th Ave",
    city: "Pompano Beach",
    priceCents: 3_900_00,
    beds: 4,
    propertyType: "townhouse",
    propertySubtype: "Townhouse",
    resolvedType: "townhouse",
    listingTransactionType: "rent",
    poolDetected: false,
    exclusionReason: "PASS resolved=townhouse",
    matched: true,
    score: 72,
  }).includes("txn=rent"),
  "matched sample shows txn and pass reason",
);

const withError = buildInventoryMatchDiagnostics({
  activeInventoryCount: 100,
  listingsScored: 0,
  matchesReturned: 0,
  lastMatchingError: 'column "square_feet" does not exist',
});
assert(withError.lastMatchingError?.includes("square_feet") === true, "stores error");

console.log("inventory-match-diagnostics.test.ts: OK");
