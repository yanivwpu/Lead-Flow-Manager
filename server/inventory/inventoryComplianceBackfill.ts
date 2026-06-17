import { and, eq, inArray, or, sql } from "drizzle-orm";
import { MATCHABLE_INVENTORY_STATUSES } from "@shared/inventory/inventoryListingSchema";
import {
  canRenderPublicListingAttribution,
  normalizeListingCompliance,
} from "@shared/inventory/inventoryListingCompliance";
import {
  providerSupportsListingSync,
  type InventoryProvider,
} from "@shared/inventory/inventoryProviderSchema";
import { publicListingMlsGateSql } from "@shared/inventory/publicListingMlsGateSql";
import { isProductionDevSeedGuardEnabled } from "@shared/inventory/inventoryDevSeedGuard";
import { inventoryListings, inventorySources } from "@shared/schema";
import { db } from "../../drizzle/db";
import { upsertInventoryListing } from "./inventoryDb";
import {
  canBackfillInventorySource,
  fetchResoPropertiesByListingIds,
} from "./inventoryFlyerBackfill";
import { buildAdapterContext } from "./inventorySourceService";
import { getInventoryProviderAdapter } from "./inventoryProviderRegistry";

const BACKFILL_BATCH_SIZE = 40;
const DEFAULT_MAX_PER_RUN = 5000;

export type ComplianceBackfillStats = {
  attempted: number;
  updated: number;
  skipped: number;
};

export type ComplianceFieldPopulationCounts = {
  total: number;
  matchable: number;
  withExtractedAt: number;
  withListOfficeName: number;
  withMlsListingId: number;
  withMlsSourceName: number;
  attributionComplete: number;
  complianceEligible: number;
};

function devSeedListingExcludeCondition() {
  if (!isProductionDevSeedGuardEnabled()) return null;
  return sql`${inventoryListings.providerListingId} not like 'dev-seed-%'`;
}

export function listingNeedsComplianceBackfill(compliance: unknown): boolean {
  const normalized = normalizeListingCompliance(compliance);
  if (!normalized.extractedAt) return true;
  return !canRenderPublicListingAttribution(normalized);
}

/** Count how many rows have IDX-style attribution fields populated. */
export async function countListingComplianceFieldPopulation(): Promise<ComplianceFieldPopulationCounts> {
  const lc = inventoryListings.listingCompliance;
  const base = devSeedListingExcludeCondition();
  const where = base ? and(base) : undefined;

  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      matchable: sql<number>`count(*) filter (where ${inventoryListings.status} in ('active', 'coming_soon'))::int`,
      withExtractedAt: sql<number>`count(*) filter (where ${lc}->>'extractedAt' is not null)::int`,
      withListOfficeName: sql<number>`count(*) filter (where coalesce(${lc}->>'listOfficeName', '') <> '')::int`,
      withMlsListingId: sql<number>`count(*) filter (where coalesce(${lc}->>'mlsListingId', '') <> '')::int`,
      withMlsSourceName: sql<number>`count(*) filter (where coalesce(${lc}->>'mlsSourceName', '') <> '')::int`,
      attributionComplete: sql<number>`count(*) filter (where
        coalesce(${lc}->>'listOfficeName', '') <> ''
        and coalesce(${lc}->>'mlsListingId', '') <> ''
        and coalesce(${lc}->>'mlsSourceName', '') <> ''
      )::int`,
      complianceEligible: sql<number>`count(*) filter (where ${publicListingMlsGateSql()})::int`,
    })
    .from(inventoryListings)
    .where(where);

  return {
    total: row?.total ?? 0,
    matchable: row?.matchable ?? 0,
    withExtractedAt: row?.withExtractedAt ?? 0,
    withListOfficeName: row?.withListOfficeName ?? 0,
    withMlsListingId: row?.withMlsListingId ?? 0,
    withMlsSourceName: row?.withMlsSourceName ?? 0,
    attributionComplete: row?.attributionComplete ?? 0,
    complianceEligible: row?.complianceEligible ?? 0,
  };
}

/**
 * Re-fetch MLS rows for listings missing compliance snapshot and upsert listing_compliance.
 */
export async function backfillMissingListingComplianceForSource(
  userId: string,
  sourceId: string,
  options?: { maxListings?: number; activeOnly?: boolean },
): Promise<ComplianceBackfillStats> {
  const maxListings = options?.maxListings ?? DEFAULT_MAX_PER_RUN;
  const activeOnly = options?.activeOnly !== false;

  const listingConditions = [
    eq(inventoryListings.sourceId, sourceId),
    eq(inventoryListings.userId, userId),
    or(
      sql`${inventoryListings.listingCompliance} = '{}'::jsonb`,
      sql`${inventoryListings.listingCompliance}->>'extractedAt' is null`,
      sql`coalesce(${inventoryListings.listingCompliance}->>'listOfficeName', '') = ''`,
      sql`coalesce(${inventoryListings.listingCompliance}->>'mlsSourceName', '') = ''`,
      sql`coalesce(${inventoryListings.listingCompliance}->>'mlsListingId', '') = ''`,
    ),
  ];
  if (activeOnly) {
    listingConditions.push(inArray(inventoryListings.status, [...MATCHABLE_INVENTORY_STATUSES]));
  }
  const devSeedExclude = devSeedListingExcludeCondition();
  if (devSeedExclude) listingConditions.push(devSeedExclude);

  const rows = await db
    .select({
      id: inventoryListings.id,
      providerListingId: inventoryListings.providerListingId,
    })
    .from(inventoryListings)
    .where(and(...listingConditions))
    .limit(maxListings);

  if (rows.length === 0) {
    return { attempted: 0, updated: 0, skipped: 0 };
  }

  const [source] = await db
    .select()
    .from(inventorySources)
    .where(and(eq(inventorySources.id, sourceId), eq(inventorySources.userId, userId)))
    .limit(1);

  if (!source || !providerSupportsListingSync(source.provider as InventoryProvider)) {
    return { attempted: rows.length, updated: 0, skipped: rows.length };
  }

  const ctx = buildAdapterContext(source);
  const credentialCheck = canBackfillInventorySource(source, ctx);
  if (!credentialCheck.ok) {
    console.warn("[inventory-compliance-backfill] skip source — credentials unavailable", {
      sourceId,
      provider: source.provider,
      reason: credentialCheck.reason,
    });
    return { attempted: rows.length, updated: 0, skipped: rows.length };
  }

  const adapter = getInventoryProviderAdapter(source.provider as InventoryProvider);

  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += BACKFILL_BATCH_SIZE) {
    const batch = rows.slice(i, i + BACKFILL_BATCH_SIZE);
    const ids = batch.map((r) => r.providerListingId);

    let rawRows: unknown[] = [];
    try {
      rawRows = await fetchResoPropertiesByListingIds(ctx, ids);
    } catch (err) {
      console.warn("[inventory-compliance-backfill] fetch batch failed", {
        sourceId,
        batchSize: ids.length,
        error: err instanceof Error ? err.message : String(err),
      });
      skipped += batch.length;
      continue;
    }

    const rawByListingId = new Map<string, unknown>();
    for (const raw of rawRows) {
      const normalized = adapter.normalizeListing(raw, ctx);
      if (normalized?.providerListingId) {
        rawByListingId.set(normalized.providerListingId, raw);
      }
    }

    for (const listing of batch) {
      const raw = rawByListingId.get(listing.providerListingId);
      if (!raw) {
        skipped += 1;
        continue;
      }
      const normalized = adapter.normalizeListing(raw, ctx);
      if (!normalized?.listingCompliance) {
        skipped += 1;
        continue;
      }
      try {
        await upsertInventoryListing(userId, sourceId, normalized);
        updated += 1;
      } catch (err) {
        console.warn("[inventory-compliance-backfill] upsert failed", {
          listingId: listing.id,
          providerListingId: listing.providerListingId,
          error: err instanceof Error ? err.message : String(err),
        });
        skipped += 1;
      }
    }
  }

  console.log("[inventory-compliance-backfill] complete", {
    sourceId,
    attempted: rows.length,
    updated,
    skipped,
  });

  return { attempted: rows.length, updated, skipped };
}

/** Backfill compliance for every connected listing-sync source for a user. */
export async function backfillListingComplianceForUser(
  userId: string,
  options?: { maxListingsPerSource?: number; activeOnly?: boolean },
): Promise<Record<string, ComplianceBackfillStats>> {
  const sources = await db
    .select()
    .from(inventorySources)
    .where(eq(inventorySources.userId, userId));

  const results: Record<string, ComplianceBackfillStats> = {};
  for (const source of sources) {
    if (!providerSupportsListingSync(source.provider as InventoryProvider)) continue;
    results[source.id] = await backfillMissingListingComplianceForSource(
      userId,
      source.id,
      {
        maxListings: options?.maxListingsPerSource,
        activeOnly: options?.activeOnly,
      },
    );
  }
  return results;
}
