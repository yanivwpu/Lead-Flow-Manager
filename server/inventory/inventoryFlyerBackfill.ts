import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { MATCHABLE_INVENTORY_STATUSES } from "@shared/inventory/inventoryListingSchema";
import {
  providerSupportsListingSync,
  type InventoryProvider,
} from "@shared/inventory/inventoryProviderSchema";
import {
  assertProductionDevSeedSourceAllowed,
  isProductionDevSeedGuardEnabled,
} from "@shared/inventory/inventoryDevSeedGuard";
import {
  buildPropertyCollectionUrl,
  escapeODataString,
  oDataValueRows,
} from "@shared/inventory/reso/resoOData";
import type { ResoReplicationProviderContract } from "@shared/inventory/reso/resoProviderContract";
import { inventoryListings, inventorySources, type InventorySource } from "@shared/schema";
import { db } from "../../drizzle/db";
import { upsertInventoryListing } from "./inventoryDb";
import {
  buildAdapterContext,
  inventorySourceHasSyncCredentials,
} from "./inventorySourceService";
import { getInventoryProviderAdapter } from "./inventoryProviderRegistry";
import { createBridgeInteractiveResoProvider } from "./providers/bridgeInteractiveResoProvider";
import { createMlsGridResoProvider } from "./providers/mlsGridResoProvider";
import { createTrestleResoProvider } from "./providers/trestleResoProvider";
import { fetchTrestleAccessToken } from "./providers/trestleAuth";
import { trestleCredentialsSchema } from "@shared/inventory/inventoryListingSchema";
import type { InventoryAdapterContext } from "./providers/types";
import { emptyResoFetchMetrics, ResoClient } from "./reso/resoClient";

const BACKFILL_BATCH_SIZE = 40;
const BACKFILL_MAX_PER_SYNC = 200;

export type FlyerBackfillStats = {
  attempted: number;
  updated: number;
  skipped: number;
};

/** True when share-page flyer columns are missing from Neon. */
export function listingNeedsFlyerColumnBackfill(row: {
  squareFeet?: number | null;
  yearBuilt?: number | null;
}): boolean {
  return row.squareFeet == null || row.yearBuilt == null;
}

function buildListingIdFilter(providerListingIds: string[]): string {
  return providerListingIds
    .map((id) => `ListingId eq '${escapeODataString(id)}'`)
    .join(" or ");
}

/** Provider-specific credential field used for MLS API auth (not interchangeable). */
export function expectedSyncCredentialField(provider: InventoryProvider): string | null {
  switch (provider) {
    case "bridge_interactive":
      return "serverToken";
    case "mls_grid":
      return "accessToken";
    case "trestle":
      return "clientId/clientSecret";
    default:
      return null;
  }
}

function devSeedListingExcludeCondition() {
  if (!isProductionDevSeedGuardEnabled()) return null;
  return sql`${inventoryListings.providerListingId} not like 'dev-seed-%'`;
}

export function canBackfillInventorySource(source: InventorySource, ctx: InventoryAdapterContext): {
  ok: boolean;
  reason?: string;
} {
  const provider = source.provider as InventoryProvider;
  const devSeedGuard = assertProductionDevSeedSourceAllowed(
    (source.config || {}) as Record<string, unknown>,
  );
  if (!devSeedGuard.ok) {
    return { ok: false, reason: devSeedGuard.message };
  }
  if (!inventorySourceHasSyncCredentials(provider, ctx.credentials)) {
    const expected = expectedSyncCredentialField(provider);
    return {
      ok: false,
      reason: `missing ${expected ?? "sync credentials"} in inventory_sources.credentialsEnc (keys: ${Object.keys(ctx.credentials).join(", ") || "none"})`,
    };
  }
  return { ok: true };
}

async function resolveResoProvider(
  ctx: InventoryAdapterContext,
): Promise<ResoReplicationProviderContract | null> {
  const provider = ctx.source.provider as InventoryProvider;
  if (!inventorySourceHasSyncCredentials(provider, ctx.credentials)) {
    return null;
  }

  switch (provider) {
    case "bridge_interactive":
      return createBridgeInteractiveResoProvider(ctx);
    case "mls_grid":
      return createMlsGridResoProvider(ctx);
    case "trestle": {
      const creds = trestleCredentialsSchema.parse(ctx.credentials);
      const accessToken = await fetchTrestleAccessToken(
        ctx.source.id,
        creds.clientId,
        creds.clientSecret,
      );
      return createTrestleResoProvider(ctx, accessToken);
    }
    default:
      return null;
  }
}

export async function fetchResoPropertiesByListingIds(
  ctx: InventoryAdapterContext,
  providerListingIds: string[],
): Promise<unknown[]> {
  if (providerListingIds.length === 0) return [];

  const provider = await resolveResoProvider(ctx);
  if (!provider) return [];

  const endpoint = provider.getEndpointConfig();
  const auth = provider.getAuth();
  const client = new ResoClient(ctx.source.id, auth, endpoint.rateLimits, endpoint.providerLabel);
  const metrics = emptyResoFetchMetrics();

  const propertyResource =
    provider.resolvePropertyResource?.("incremental") ?? endpoint.propertyResource;
  const filter = buildListingIdFilter(providerListingIds);
  const url = buildPropertyCollectionUrl(endpoint.baseUrl, propertyResource, {
    filter,
    top: providerListingIds.length,
  });

  const body = (await client.fetchJson(url, metrics)) as Record<string, unknown>;
  return oDataValueRows(body);
}

/**
 * Re-fetch MLS rows for active listings missing square_feet/year_built and upsert flyer columns.
 * Incremental sync skips unchanged listings, so flyer columns added after initial import stay null
 * until this backfill runs.
 */
export async function backfillMissingFlyerColumnsForSource(
  userId: string,
  sourceId: string,
  options?: { maxListings?: number },
): Promise<FlyerBackfillStats> {
  const maxListings = options?.maxListings ?? BACKFILL_MAX_PER_SYNC;

  const listingConditions = [
    eq(inventoryListings.sourceId, sourceId),
    eq(inventoryListings.userId, userId),
    inArray(inventoryListings.status, [...MATCHABLE_INVENTORY_STATUSES]),
    or(isNull(inventoryListings.squareFeet), isNull(inventoryListings.yearBuilt)),
  ];
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
    console.warn("[inventory-flyer-backfill] skip source — credentials unavailable", {
      sourceId,
      provider: source.provider,
      reason: credentialCheck.reason,
      credentialKeys: Object.keys(ctx.credentials),
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
      console.warn("[inventory-flyer-backfill] fetch batch failed", {
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
      if (!normalized) {
        skipped += 1;
        continue;
      }
      if (normalized.squareFeet == null && normalized.yearBuilt == null) {
        skipped += 1;
        continue;
      }
      try {
        await upsertInventoryListing(userId, sourceId, normalized);
        updated += 1;
      } catch (err) {
        console.warn("[inventory-flyer-backfill] upsert failed", {
          listingId: listing.id,
          providerListingId: listing.providerListingId,
          error: err instanceof Error ? err.message : String(err),
        });
        skipped += 1;
      }
    }
  }

  console.log("[inventory-flyer-backfill] complete", {
    sourceId,
    attempted: rows.length,
    updated,
    skipped,
  });

  return { attempted: rows.length, updated, skipped };
}

/** Repair one shareable listing when flyer columns are missing in Neon. */
export async function backfillFlyerColumnsForListingId(listingId: string): Promise<boolean> {
  const [row] = await db
    .select({
      id: inventoryListings.id,
      userId: inventoryListings.userId,
      sourceId: inventoryListings.sourceId,
      providerListingId: inventoryListings.providerListingId,
      squareFeet: inventoryListings.squareFeet,
      yearBuilt: inventoryListings.yearBuilt,
      status: inventoryListings.status,
    })
    .from(inventoryListings)
    .where(eq(inventoryListings.id, listingId))
    .limit(1);

  if (!row) return false;
  if (row.status !== "active" && row.status !== "coming_soon") return false;
  if (!listingNeedsFlyerColumnBackfill(row)) return false;

  const [source] = await db
    .select()
    .from(inventorySources)
    .where(eq(inventorySources.id, row.sourceId))
    .limit(1);

  if (!source || !providerSupportsListingSync(source.provider as InventoryProvider)) {
    return false;
  }

  const ctx = buildAdapterContext(source);
  const credentialCheck = canBackfillInventorySource(source, ctx);
  if (!credentialCheck.ok) {
    console.warn("[inventory-flyer-backfill] single listing repair skipped — credentials unavailable", {
      listingId,
      sourceId: source.id,
      provider: source.provider,
      reason: credentialCheck.reason,
      credentialKeys: Object.keys(ctx.credentials),
    });
    return false;
  }

  const adapter = getInventoryProviderAdapter(source.provider as InventoryProvider);

  try {
    const rawRows = await fetchResoPropertiesByListingIds(ctx, [row.providerListingId]);
    const raw = rawRows[0];
    if (!raw) return false;

    const normalized = adapter.normalizeListing(raw, ctx);
    if (!normalized) return false;

    await upsertInventoryListing(row.userId, row.sourceId, normalized);
    return !listingNeedsFlyerColumnBackfill({
      squareFeet: normalized.squareFeet ?? null,
      yearBuilt: normalized.yearBuilt ?? null,
    });
  } catch (err) {
    console.warn("[inventory-flyer-backfill] single listing repair failed", {
      listingId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
