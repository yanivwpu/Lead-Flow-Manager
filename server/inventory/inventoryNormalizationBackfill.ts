import { and, eq, inArray, sql } from "drizzle-orm";
import { MATCHABLE_INVENTORY_STATUSES } from "@shared/inventory/inventoryListingSchema";
import type { InventoryListingDetails } from "@shared/inventory/inventoryListingSchema";
import type { InventoryProvider } from "@shared/inventory/inventoryProviderSchema";
import { providerSupportsListingSync } from "@shared/inventory/inventoryProviderSchema";
import { renormalizeStoredListingFields } from "@shared/inventory/reso/resoListingClassification";
import { inventoryListings, inventorySources } from "@shared/schema";
import { db } from "../../drizzle/db";
import { backfillMissingFlyerColumnsForSource } from "./inventoryFlyerBackfill";
import { buildAdapterContext, inventorySourceHasSyncCredentials } from "./inventorySourceService";

const BATCH_SIZE = 500;

export type NormalizationBackfillStats = {
  scanned: number;
  updated: number;
  unchanged: number;
  poolSet: number;
  saleCount: number;
  rentCount: number;
  houseCount: number;
};

function parseFeatures(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(String).filter(Boolean);
}

function parseListingDetails(raw: unknown): InventoryListingDetails {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const out: InventoryListingDetails = {};
  if (typeof o.parkingGarage === "string") out.parkingGarage = o.parkingGarage;
  if (typeof o.waterfront === "boolean") out.waterfront = o.waterfront;
  if (typeof o.pool === "boolean") out.pool = o.pool;
  if (typeof o.view === "string") out.view = o.view;
  if (o.listingTransactionType === "sale" || o.listingTransactionType === "rent") {
    out.listingTransactionType = o.listingTransactionType;
  }
  return out;
}

function detailsEqual(a: InventoryListingDetails, b: InventoryListingDetails): boolean {
  return (
    a.parkingGarage === b.parkingGarage &&
    a.waterfront === b.waterfront &&
    a.pool === b.pool &&
    a.view === b.view &&
    a.listingTransactionType === b.listingTransactionType
  );
}

/**
 * Recompute propertyType, listingTransactionType, and pool from persisted columns.
 * Safe for all rows — does not delete inventory.
 */
export async function backfillStoredListingNormalizationForUser(
  userId: string,
  options?: { limit?: number; activeOnly?: boolean },
): Promise<NormalizationBackfillStats> {
  const stats: NormalizationBackfillStats = {
    scanned: 0,
    updated: 0,
    unchanged: 0,
    poolSet: 0,
    saleCount: 0,
    rentCount: 0,
    houseCount: 0,
  };

  const conditions = [eq(inventoryListings.userId, userId)];
  if (options?.activeOnly !== false) {
    conditions.push(inArray(inventoryListings.status, [...MATCHABLE_INVENTORY_STATUSES]));
  }

  let offset = 0;
  const limit = options?.limit ?? Number.MAX_SAFE_INTEGER;

  while (stats.scanned < limit) {
    const rows = await db
      .select({
        id: inventoryListings.id,
        propertyType: inventoryListings.propertyType,
        propertySubtype: inventoryListings.propertySubtype,
        priceCents: inventoryListings.priceCents,
        description: inventoryListings.description,
        features: inventoryListings.features,
        listingDetails: inventoryListings.listingDetails,
      })
      .from(inventoryListings)
      .where(and(...conditions))
      .orderBy(inventoryListings.id)
      .limit(Math.min(BATCH_SIZE, limit - stats.scanned))
      .offset(offset);

    if (!rows.length) break;
    offset += rows.length;

    for (const row of rows) {
      stats.scanned += 1;
      const features = parseFeatures(row.features);
      const existingDetails = parseListingDetails(row.listingDetails);
      const normalized = renormalizeStoredListingFields({
        propertyType: row.propertyType,
        propertySubtype: row.propertySubtype,
        priceCents: row.priceCents,
        description: row.description,
        features,
        addressLine1: row.addressLine1,
        addressLine2: row.addressLine2,
        listingDetails: existingDetails,
      });

      if (normalized.listingTransactionType === "sale") stats.saleCount += 1;
      else stats.rentCount += 1;
      if (normalized.propertyType === "house") stats.houseCount += 1;

      const nextDetails: InventoryListingDetails = {
        ...existingDetails,
        listingTransactionType: normalized.listingTransactionType,
      };
      if (normalized.pool != null) {
        nextDetails.pool = normalized.pool;
        if (existingDetails.pool == null) stats.poolSet += 1;
      }

      const propertyChanged = normalized.propertyType !== row.propertyType;
      const detailsChanged = !detailsEqual(existingDetails, nextDetails);

      if (!propertyChanged && !detailsChanged) {
        stats.unchanged += 1;
        continue;
      }

      await db
        .update(inventoryListings)
        .set({
          propertyType: normalized.propertyType,
          listingDetails: nextDetails,
          updatedAt: new Date(),
        })
        .where(eq(inventoryListings.id, row.id));

      stats.updated += 1;
    }
  }

  return stats;
}

export async function countListingNormalizationSummary(userId: string) {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      sale: sql<number>`count(*) filter (where ${inventoryListings.listingDetails}->>'listingTransactionType' = 'sale')::int`,
      rent: sql<number>`count(*) filter (where ${inventoryListings.listingDetails}->>'listingTransactionType' = 'rent')::int`,
      house: sql<number>`count(*) filter (where ${inventoryListings.propertyType} = 'house')::int`,
      poolKnown: sql<number>`count(*) filter (where (${inventoryListings.listingDetails}->>'pool') is not null)::int`,
    })
    .from(inventoryListings)
    .where(
      and(
        eq(inventoryListings.userId, userId),
        inArray(inventoryListings.status, [...MATCHABLE_INVENTORY_STATUSES]),
      ),
    );
  return row ?? { total: 0, sale: 0, rent: 0, house: 0, poolKnown: 0 };
}

/** Re-fetch from RESO where possible, then re-normalize all stored rows. */
export async function backfillAllSourcesForUser(userId: string): Promise<NormalizationBackfillStats> {
  const sources = await db
    .select()
    .from(inventorySources)
    .where(eq(inventorySources.userId, userId));

  for (const source of sources) {
    const provider = source.provider as InventoryProvider;
    if (!providerSupportsListingSync(provider)) continue;
    const ctx = buildAdapterContext(source);
    if (!inventorySourceHasSyncCredentials(provider, ctx.credentials)) continue;
    await backfillMissingFlyerColumnsForSource(userId, source.id, { maxListings: 500 });
  }

  return backfillStoredListingNormalizationForUser(userId, { activeOnly: false });
}
