/**
 * Matching pool coverage — hard filters must run before synced_at cap.
 * Run: npx tsx tests/matching-pool-coverage.test.ts
 */
import assert from "node:assert/strict";
import {
  extractBuyerMatchCriteria,
  countQualifyingInventoryMatches,
  type MatchListingInput,
} from "../shared/inventory/inventoryMatchScoring";
import {
  legacySelectNewestSyncedPool,
  selectMatchingPoolCandidates,
} from "../shared/inventory/inventoryMatchingPoolFilters";
import { emptyBuyerPreferenceProfile, normalizeBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import { mergeBuyerPreferenceProfile } from "../shared/buyerPreferenceMerge";
import { heuristicPatchFromInboundText } from "../shared/buyerPreferenceExtractionNormalize";

const NOW = new Date().toISOString();

function field<T>(value: T) {
  return { value, source: "explicit" as const, confidence: 1, updatedAt: NOW };
}

function listing(
  overrides: Partial<MatchListingInput> & {
    id: string;
    providerListingId: string;
    syncedAt: string;
  },
): MatchListingInput & { syncedAt: string } {
  return {
    status: "active",
    priceCents: 650_000_00,
    city: "Miami",
    state: "FL",
    addressLine1: "100 Test St",
    addressLine2: null,
    zip: "33101",
    beds: 3,
    baths: 2,
    propertyType: "Residential",
    propertySubtype: "Single Family Residence",
    squareFeet: null,
    yearBuilt: null,
    hoaFeeCents: null,
    listingDetails: { listingTransactionType: "sale" },
    description: null,
    features: [],
    listingUrl: null,
    photos: [],
    latitude: null,
    longitude: null,
    ...overrides,
  };
}

function buildRentCriteria() {
  const message = "Show me apartment rentals in Pompano beach 2/2 up to $2500 a mo";
  const patch = heuristicPatchFromInboundText(message);
  const profile = mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), patch);
  return extractBuyerMatchCriteria(normalizeBuyerPreferenceProfile(profile));
}

function buildBuyCriteria() {
  const profile = normalizeBuyerPreferenceProfile({
    schemaVersion: 1,
    profileStatus: "partial",
    transactionIntent: field("buy"),
    targetAreas: field(["Pompano Beach"]),
    propertyTypes: field(["house"]),
    priceMax: field(550_000),
  });
  return extractBuyerMatchCriteria(profile);
}

function testPompanoRentOutsideNewest1000() {
  const recentSynced = "2026-06-17T12:00:00.000Z";
  const olderSynced = "2024-01-01T00:00:00.000Z";

  const inventory: Array<MatchListingInput & { syncedAt: string }> = [];

  for (let i = 0; i < 1197; i++) {
    inventory.push(
      listing({
        id: `miami-${i}`,
        providerListingId: `MLS-MIA-${i}`,
        city: "Miami",
        syncedAt: recentSynced,
        listingDetails: { listingTransactionType: "sale" },
        propertyType: "Residential",
        propertySubtype: "Single Family Residence",
        priceCents: 800_000_00,
      }),
    );
  }

  for (let i = 0; i < 3; i++) {
    inventory.push(
      listing({
        id: `pompano-rent-${i}`,
        providerListingId: `MLS-PB-RENT-${i}`,
        city: "Pompano Beach",
        syncedAt: olderSynced,
        propertyType: "Residential Lease",
        propertySubtype: "Condominium",
        priceCents: 2_400_00,
        beds: 2,
        baths: 2,
        listingDetails: { listingTransactionType: "rent" },
      }),
    );
  }

  assert.equal(inventory.length, 1200);

  const criteria = buildRentCriteria();
  assert.equal(criteria.transactionIntent, "rent");
  assert.ok(criteria.areas.some((a) => a.toLowerCase().includes("pompano")));
  assert.equal(criteria.priceMax, 2500);
  assert.equal(criteria.bedsMin, 2);
  assert.equal(criteria.bathsMin, 2);

  const legacyPool = legacySelectNewestSyncedPool(inventory, 1000);
  const legacyPompano = legacyPool.filter((row) =>
    (row.city ?? "").toLowerCase().includes("pompano"),
  );
  assert.equal(legacyPompano.length, 0, "legacy newest-1000 pool misses older Pompano rentals");

  const pool = selectMatchingPoolCandidates(inventory, criteria, 1000);
  assert.equal(pool.dbCandidatesAfterHardFilters, 3);
  assert.equal(pool.cappedAfterHardFilters, false);
  assert.equal(pool.selected.length, 3);
  assert.ok(
    pool.selected.every((row) => (row.city ?? "").toLowerCase().includes("pompano")),
    "hard-filtered pool includes Pompano rentals",
  );

  const matchCount = countQualifyingInventoryMatches(pool.selected, criteria);
  assert.ok(matchCount >= 3, "Pompano rentals qualify for rent search");
  console.log("  Pompano rent outside newest-1000: OK");
}

function testPompanoBuySfhUnaffected() {
  const recentSynced = "2026-06-17T12:00:00.000Z";
  const olderSynced = "2024-01-01T00:00:00.000Z";

  const inventory: Array<MatchListingInput & { syncedAt: string }> = [];

  for (let i = 0; i < 1197; i++) {
    inventory.push(
      listing({
        id: `miami-${i}`,
        providerListingId: `MLS-MIA-${i}`,
        city: "Miami",
        syncedAt: recentSynced,
        listingDetails: { listingTransactionType: "sale" },
        priceCents: 800_000_00,
      }),
    );
  }

  inventory.push(
    listing({
      id: "pompano-sfh",
      providerListingId: "MLS-PB-SFH",
      city: "Pompano Beach",
      syncedAt: olderSynced,
      propertyType: "Residential",
      propertySubtype: "Single Family Residence",
      priceCents: 500_000_00,
      beds: 3,
      baths: 2,
      listingDetails: { listingTransactionType: "sale" },
    }),
  );

  for (let i = 0; i < 2; i++) {
    inventory.push(
      listing({
        id: `pompano-rent-${i}`,
        providerListingId: `MLS-PB-RENT-${i}`,
        city: "Pompano Beach",
        syncedAt: olderSynced,
        propertyType: "Residential Lease",
        propertySubtype: "Condominium",
        priceCents: 2_400_00,
        beds: 2,
        baths: 2,
        listingDetails: { listingTransactionType: "rent" },
      }),
    );
  }

  const criteria = buildBuyCriteria();
  assert.equal(criteria.transactionIntent, "buy");

  const pool = selectMatchingPoolCandidates(inventory, criteria, 1000);
  assert.equal(pool.dbCandidatesAfterHardFilters, 1);
  assert.ok(
    pool.selected.some((row) => row.providerListingId === "MLS-PB-SFH"),
    "buy search finds older Pompano SFH",
  );
  assert.ok(
    !pool.selected.some((row) => row.providerListingId.startsWith("MLS-PB-RENT")),
    "buy search excludes Pompano rentals",
  );

  const matchCount = countQualifyingInventoryMatches(pool.selected, criteria);
  assert.ok(matchCount >= 1);
  console.log("  Pompano buy SFH unaffected: OK");
}

function main() {
  testPompanoRentOutsideNewest1000();
  testPompanoBuySfhUnaffected();
  console.log("matching-pool-coverage.test.ts: all passed");
}

main();
