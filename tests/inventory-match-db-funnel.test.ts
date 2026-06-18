/**
 * Live DB inventory match funnel — contract test (same path as findMatchingListingsForContact).
 * Run: npx tsx tests/inventory-match-db-funnel.test.ts
 * With DB: npx tsx tests/inventory-match-db-funnel.test.ts --live
 */
import "dotenv/config";
import { heuristicPatchFromInboundText } from "../shared/buyerPreferenceExtractionNormalize";
import { mergeBuyerPreferenceProfile } from "../shared/buyerPreferenceMerge";
import { emptyBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import { parseBuyerSearchCommand } from "../shared/buyerSearchCommand";
import { buildPersistedProfileSnapshotForDiagnostics } from "../shared/buyerSearchCommandDebug";
import {
  buildDbInventoryMatchDiagnostics,
  formatFunnelExcludedSampleLine,
} from "../shared/inventory/inventoryMatchDiagnostics";
import { inventoryMatchDiagnosticsSchema } from "../shared/inventory/inventoryMatchTypes";
import {
  auditBuySearchMatchFunnel,
  countQualifyingInventoryMatches,
  extractBuyerMatchCriteria,
  type MatchListingInput,
} from "../shared/inventory/inventoryMatchScoring";
import { inventoryListingToMatchInput } from "../server/inventory/inventoryMatchingService";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

/** Minimal row shaped like fetchActiveListingsForMatching output. */
function dbRow(overrides: Partial<MatchListingInput> & { id: string; providerListingId: string }) {
  return {
    id: overrides.id,
    providerListingId: overrides.providerListingId,
    status: overrides.status ?? "active",
    priceCents: overrides.priceCents ?? 650_000_00,
    city: overrides.city ?? "Pompano Beach",
    state: overrides.state ?? "FL",
    addressLine1: overrides.addressLine1 ?? "100 Test St",
    addressLine2: overrides.addressLine2 ?? null,
    zip: overrides.zip ?? "33062",
    beds: overrides.beds ?? 4,
    baths: overrides.baths ?? 2,
    propertyType: overrides.propertyType ?? "house",
    propertySubtype: overrides.propertySubtype ?? "Single Family Residence",
    squareFeet: overrides.squareFeet ?? null,
    yearBuilt: overrides.yearBuilt ?? null,
    hoaFeeCents: overrides.hoaFeeCents ?? null,
    listingDetails: overrides.listingDetails,
    description: overrides.description ?? null,
    features: overrides.features ?? [],
    listingUrl: overrides.listingUrl ?? null,
    photos: overrides.photos ?? [],
    latitude: overrides.latitude ?? null,
    longitude: overrides.longitude ?? null,
  } satisfies MatchListingInput;
}

const poolHouse = dbRow({
  id: "1",
  providerListingId: "MLS-POOL",
  listingDetails: { pool: true },
});
const noPoolHouse = dbRow({ id: "2", providerListingId: "MLS-NP", listingDetails: { pool: false } });
const townhouse = dbRow({
  id: "3",
  providerListingId: "MLS-TH",
  propertyType: "Townhouse",
  propertySubtype: "Townhouse",
});
const rental = dbRow({
  id: "4",
  providerListingId: "MLS-RENT",
  propertyType: "Residential Lease",
  priceCents: 2_500_00,
  beds: 2,
});
const overBudget = dbRow({
  id: "5",
  providerListingId: "MLS-HIGH",
  priceCents: 1_200_000_00,
});

const listings = [poolHouse, noPoolHouse, townhouse, rental, overBudget];

const strictMsg =
  "I'm a cash buyer I can buy a home up to $899. Looking for SFH in Pompano with pool at least 4 bedrooms";
const strictPatch = heuristicPatchFromInboundText(strictMsg);
const strictProfile = mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), strictPatch, undefined, {
  replaceArrayFields: parseBuyerSearchCommand(strictMsg, emptyBuyerPreferenceProfile()).replaceArrayFields,
});
const strictCriteria = extractBuyerMatchCriteria(strictProfile);

const strictFunnel = auditBuySearchMatchFunnel(listings, strictCriteria, { rankLimit: 10, sampleLimit: 20 });
assert(strictFunnel.rankedCount === 1, `strict pool: 1 match (got ${strictFunnel.rankedCount})`);
assert(
  strictFunnel.steps.some((s) => s.label.includes("verified pool") && s.count === 1),
  "funnel has pool gate step",
);

const relaxedMsg =
  "I'm a cash buyer I can buy a home up to $899. Looking for SFH in Pompano with or without pool at least 3 bedrooms";
const relaxedPatch = heuristicPatchFromInboundText(relaxedMsg);
const relaxedProfile = mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), relaxedPatch, undefined, {
  replaceArrayFields: parseBuyerSearchCommand(relaxedMsg, emptyBuyerPreferenceProfile()).replaceArrayFields,
});
const relaxedCriteria = extractBuyerMatchCriteria(relaxedProfile);
assert(relaxedCriteria.hardRequirePool === false, "relaxed: no pool gate");

const relaxedFunnel = auditBuySearchMatchFunnel(listings, relaxedCriteria, { rankLimit: 10, sampleLimit: 20 });
assert(
  countQualifyingInventoryMatches(listings, relaxedCriteria) >= 2,
  "relaxed includes no-pool SFH",
);

const snapshot = buildPersistedProfileSnapshotForDiagnostics(relaxedProfile, relaxedCriteria);
const diagnostics = buildDbInventoryMatchDiagnostics({
  activeInventoryCount: 613,
  agentShareEligibleCount: listings.length,
  agentShareExclusions: {
    inactive: 0,
    missingInternetDisplay: 0,
    missingAttribution: 0,
  },
  dbCandidatesAfterHardFilters: listings.length,
  rowsLoadedForScoring: listings.length,
  matchesReturned: 2,
  totalQualifyingMatches: relaxedFunnel.rankedCount,
  matchingFetchLimit: 1000,
  funnel: relaxedFunnel,
  persistedProfileSnapshot: snapshot,
  activeFilterSummary: "Buy · SFH",
});

const parsed = inventoryMatchDiagnosticsSchema.safeParse(diagnostics);
assert(parsed.success, `diagnostics schema: ${parsed.success ? "ok" : parsed.error?.message}`);
assert(diagnostics.funnelSteps != null && diagnostics.funnelSteps.length >= 5, "funnel steps in API payload");
assert(diagnostics.funnelExcludedSamples != null, "rich excluded samples");
assert(diagnostics.persistedProfileSnapshot?.priceMax === 899_000, "profile snapshot priceMax");
assert(diagnostics.exclusionByReason != null, "exclusion counts");
assert(
  formatFunnelExcludedSampleLine(diagnostics.funnelExcludedSamples![0]).includes("MLS-"),
  "formats rich sample line",
);

async function runLiveDbCheck() {
  if (!process.argv.includes("--live")) return;
  const { prepareDbTestEnvironment } = await import("./helpers/dbTestGuard.js");
  prepareDbTestEnvironment("inventory-match-db-funnel.test.ts --live");
  const { db } = await import("../drizzle/db");
  const { inventoryListings } = await import("../shared/schema");
  const { sql } = await import("drizzle-orm");
  const { fetchActiveListingsForMatching, resolveMatchingListingLimitForUser } = await import(
    "../server/inventory/inventoryDb"
  );

  const [topUser] = await db
    .select({ userId: inventoryListings.userId, count: sql<number>`count(*)::int` })
    .from(inventoryListings)
    .groupBy(inventoryListings.userId)
    .orderBy(sql`count(*) desc`)
    .limit(1);
  if (!topUser?.userId) return;

  const limit = await resolveMatchingListingLimitForUser(topUser.userId);
  const rows = await fetchActiveListingsForMatching(topUser.userId, limit);
  const inputs = rows.map(inventoryListingToMatchInput);
  const liveFunnel = auditBuySearchMatchFunnel(inputs, strictCriteria, { rankLimit: 10, sampleLimit: 20 });
  assert(liveFunnel.steps[0].count === inputs.length, "live funnel starts with loaded row count");
  console.log(`live DB: ${inputs.length} rows, strict qualifying=${liveFunnel.rankedCount}`);
}

await runLiveDbCheck();

console.log("inventory-match-db-funnel.test.ts: OK");
