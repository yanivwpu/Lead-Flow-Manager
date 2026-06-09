import { and, desc, eq, inArray, notInArray, or, sql } from "drizzle-orm";
import {
  inventoryListings,
  inventorySources,
  type InventoryListing,
  type InventorySource,
} from "@shared/schema";
import type { NormalizedInventoryListing } from "@shared/inventory/inventoryListingSchema";
import { MATCHABLE_INVENTORY_STATUSES } from "@shared/inventory/inventoryListingSchema";
import type { SyncAlertStatus } from "@shared/inventory/inventoryOpportunityTypes";
import {
  assertProductionDevSeedListingAllowed,
  isDevSeedProviderListingId,
  isProductionDevSeedGuardEnabled,
} from "@shared/inventory/inventoryDevSeedGuard";
import { db } from "../../drizzle/db";
import { decryptIntegrationConfig, encryptIntegrationConfig } from "../integrationConfigCrypto";

function devSeedListingExcludeCondition() {
  if (!isProductionDevSeedGuardEnabled()) return null;
  return sql`${inventoryListings.providerListingId} not like 'dev-seed-%'`;
}

function isBlockedDevSeedListingRow(row: InventoryListing): boolean {
  return isProductionDevSeedGuardEnabled() && isDevSeedProviderListingId(row.providerListingId);
}

export function decryptSourceCredentials(
  credentialsEnc: Record<string, unknown>,
): Record<string, unknown> {
  return decryptIntegrationConfig(credentialsEnc);
}

export function encryptSourceCredentials(
  credentials: Record<string, unknown>,
): Record<string, unknown> {
  return encryptIntegrationConfig(credentials);
}

export async function listInventorySources(userId: string): Promise<InventorySource[]> {
  return db
    .select()
    .from(inventorySources)
    .where(eq(inventorySources.userId, userId))
    .orderBy(desc(inventorySources.updatedAt));
}

export async function getInventorySource(
  userId: string,
  sourceId: string,
): Promise<InventorySource | undefined> {
  const [row] = await db
    .select()
    .from(inventorySources)
    .where(and(eq(inventorySources.id, sourceId), eq(inventorySources.userId, userId)))
    .limit(1);
  return row;
}

export async function getInventorySourceByProvider(
  userId: string,
  provider: string,
): Promise<InventorySource | undefined> {
  const [row] = await db
    .select()
    .from(inventorySources)
    .where(and(eq(inventorySources.userId, userId), eq(inventorySources.provider, provider)))
    .limit(1);
  return row;
}

export async function insertInventorySource(
  values: typeof inventorySources.$inferInsert,
): Promise<InventorySource> {
  const [row] = await db.insert(inventorySources).values(values).returning();
  return row;
}

export async function patchInventorySource(
  sourceId: string,
  userId: string,
  patch: Partial<typeof inventorySources.$inferInsert>,
): Promise<InventorySource | undefined> {
  const [row] = await db
    .update(inventorySources)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(inventorySources.id, sourceId), eq(inventorySources.userId, userId)))
    .returning();
  return row;
}

export async function deleteInventorySource(sourceId: string, userId: string): Promise<boolean> {
  const deleted = await db
    .delete(inventorySources)
    .where(and(eq(inventorySources.id, sourceId), eq(inventorySources.userId, userId)))
    .returning({ id: inventorySources.id });
  return deleted.length > 0;
}

function listingRowFromNormalized(
  userId: string,
  sourceId: string,
  normalized: NormalizedInventoryListing,
): typeof inventoryListings.$inferInsert {
  const sourceUpdatedAt = normalized.sourceUpdatedAt
    ? new Date(normalized.sourceUpdatedAt)
    : null;
  return {
    userId,
    sourceId,
    provider: normalized.provider,
    providerListingId: normalized.providerListingId,
    status: normalized.status,
    priceCents: normalized.priceCents,
    currency: normalized.currency ?? "USD",
    addressLine1: normalized.address.line1 ?? null,
    addressLine2: normalized.address.line2 ?? null,
    city: normalized.address.city ?? null,
    state: normalized.address.state ?? null,
    zip: normalized.address.zip ?? null,
    country: normalized.address.country ?? "US",
    latitude: normalized.latitude,
    longitude: normalized.longitude,
    beds: normalized.beds != null ? String(normalized.beds) : null,
    baths: normalized.baths != null ? String(normalized.baths) : null,
    propertyType: normalized.propertyType,
    description: normalized.description ?? null,
    features: normalized.features,
    photos: normalized.photos,
    listingUrl: normalized.listingUrl ?? null,
    sourceUpdatedAt,
    syncedAt: new Date(),
    updatedAt: new Date(),
  };
}

export type ListingUpsertResult = {
  listingId: string;
  syncAlertStatus: SyncAlertStatus;
  previousPriceCents: number | null;
  currentPriceCents: number | null;
  priceReduced: boolean;
};

export async function upsertInventoryListing(
  userId: string,
  sourceId: string,
  normalized: NormalizedInventoryListing,
): Promise<ListingUpsertResult> {
  const listingGuard = assertProductionDevSeedListingAllowed(normalized.providerListingId);
  if (!listingGuard.ok) {
    throw new Error(listingGuard.message);
  }

  const row = listingRowFromNormalized(userId, sourceId, normalized);
  const now = new Date();

  const [existing] = await db
    .select()
    .from(inventoryListings)
    .where(
      and(
        eq(inventoryListings.sourceId, sourceId),
        eq(inventoryListings.providerListingId, normalized.providerListingId),
      ),
    )
    .limit(1);

  if (!existing) {
    const [inserted] = await db
      .insert(inventoryListings)
      .values({
        ...row,
        syncAlertStatus: "new",
        firstSeenAt: now,
      })
      .returning({ id: inventoryListings.id });
    return {
      listingId: inserted.id,
      syncAlertStatus: "new",
      previousPriceCents: null,
      currentPriceCents: row.priceCents ?? null,
      priceReduced: false,
    };
  }

  let syncAlertStatus: SyncAlertStatus = "existing";
  let previousPriceCents: number | null = existing.previousPriceCents ?? null;
  let lastPriceChangeAt: Date | null = existing.lastPriceChangeAt ?? null;

  if (
    existing.priceCents != null &&
    row.priceCents != null &&
    existing.priceCents !== row.priceCents
  ) {
    syncAlertStatus = "price_changed";
    previousPriceCents = existing.priceCents;
    lastPriceChangeAt = now;
  }

  const currentPriceCents = row.priceCents ?? null;
  const priceReduced =
    syncAlertStatus === "price_changed" &&
    previousPriceCents != null &&
    currentPriceCents != null &&
    currentPriceCents < previousPriceCents;

  const [updated] = await db
    .update(inventoryListings)
    .set({
      status: row.status,
      priceCents: row.priceCents,
      currency: row.currency,
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2,
      city: row.city,
      state: row.state,
      zip: row.zip,
      country: row.country,
      latitude: row.latitude,
      longitude: row.longitude,
      beds: row.beds,
      baths: row.baths,
      propertyType: row.propertyType,
      description: row.description,
      features: row.features,
      photos: row.photos,
      listingUrl: row.listingUrl,
      sourceUpdatedAt: row.sourceUpdatedAt,
      syncAlertStatus,
      previousPriceCents: syncAlertStatus === "price_changed" ? previousPriceCents : existing.previousPriceCents,
      lastPriceChangeAt,
      syncedAt: now,
      updatedAt: now,
    })
    .where(eq(inventoryListings.id, existing.id))
    .returning({ id: inventoryListings.id });

  return {
    listingId: updated.id,
    syncAlertStatus,
    previousPriceCents: syncAlertStatus === "price_changed" ? previousPriceCents : null,
    currentPriceCents,
    priceReduced,
  };
}

export async function markListingsInactiveExcept(
  sourceId: string,
  seenProviderListingIds: string[],
): Promise<number> {
  const now = new Date();
  if (seenProviderListingIds.length === 0) {
    const result = await db
      .update(inventoryListings)
      .set({ status: "inactive", updatedAt: now })
      .where(
        and(eq(inventoryListings.sourceId, sourceId), sql`${inventoryListings.status} <> 'inactive'`),
      );
    return result.rowCount ?? 0;
  }
  const result = await db
    .update(inventoryListings)
    .set({ status: "inactive", updatedAt: now })
    .where(
      and(
        eq(inventoryListings.sourceId, sourceId),
        notInArray(inventoryListings.providerListingId, seenProviderListingIds),
        sql`${inventoryListings.status} <> 'inactive'`,
      ),
    );
  return result.rowCount ?? 0;
}

export type ListInventoryListingsParams = {
  userId: string;
  sourceId?: string;
  status?: string;
  city?: string;
  page: number;
  limit: number;
};

export async function countListingsBySourceForUser(
  userId: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select({
      sourceId: inventoryListings.sourceId,
      count: sql<number>`count(*)::int`,
    })
    .from(inventoryListings)
    .where(eq(inventoryListings.userId, userId))
    .groupBy(inventoryListings.sourceId);

  const out: Record<string, number> = {};
  for (const row of rows) {
    out[row.sourceId] = row.count;
  }
  return out;
}

export async function fetchActiveListingsForMatching(
  userId: string,
  limit = 2500,
): Promise<InventoryListing[]> {
  const conditions = [
    eq(inventoryListings.userId, userId),
    inArray(inventoryListings.status, [...MATCHABLE_INVENTORY_STATUSES]),
  ];
  const devSeedExclude = devSeedListingExcludeCondition();
  if (devSeedExclude) conditions.push(devSeedExclude);

  return db
    .select()
    .from(inventoryListings)
    .where(and(...conditions))
    .orderBy(desc(inventoryListings.syncedAt))
    .limit(limit);
}

export async function countActiveListingsForUser(userId: string): Promise<number> {
  const conditions = [
    eq(inventoryListings.userId, userId),
    inArray(inventoryListings.status, [...MATCHABLE_INVENTORY_STATUSES]),
  ];
  const devSeedExclude = devSeedListingExcludeCondition();
  if (devSeedExclude) conditions.push(devSeedExclude);

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryListings)
    .where(and(...conditions));
  return row?.count ?? 0;
}

export async function countInventorySourcesForUser(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventorySources)
    .where(eq(inventorySources.userId, userId));
  return row?.count ?? 0;
}

export async function countAllListingsForUser(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryListings)
    .where(eq(inventoryListings.userId, userId));
  return row?.count ?? 0;
}

/** Active listing-sync sources ready for scheduled reconciliation. */
export async function listListingSyncSourcesForReconciliation(): Promise<InventorySource[]> {
  const rows = await db
    .select()
    .from(inventorySources)
    .where(
      and(
        sql`${inventorySources.provider} in ('mls_grid', 'trestle', 'bridge_interactive')`,
        eq(inventorySources.isActive, true),
        sql`${inventorySources.connectionStatus} = 'connected'`,
      ),
    );

  return rows.filter((row) => {
    const cfg = (row.config || {}) as Record<string, unknown>;
    return cfg.initialImportComplete === true;
  });
}

/** @deprecated Use listListingSyncSourcesForReconciliation */
export async function listMlsGridSourcesForReconciliation(): Promise<InventorySource[]> {
  return listListingSyncSourcesForReconciliation();
}

export async function listInventoryListings(
  params: ListInventoryListingsParams,
): Promise<{ rows: InventoryListing[]; total: number }> {
  const { userId, sourceId, status, city, page, limit } = params;
  const offset = (page - 1) * limit;
  const conditions = [eq(inventoryListings.userId, userId)];
  if (sourceId) conditions.push(eq(inventoryListings.sourceId, sourceId));
  if (status) conditions.push(eq(inventoryListings.status, status));
  if (city) conditions.push(eq(inventoryListings.city, city));
  const where = and(...conditions);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryListings)
    .where(where);

  const rows = await db
    .select()
    .from(inventoryListings)
    .where(where)
    .orderBy(desc(inventoryListings.syncedAt))
    .limit(limit)
    .offset(offset);

  return { rows, total: countRow?.count ?? 0 };
}

export async function getInventoryListing(
  userId: string,
  listingId: string,
): Promise<InventoryListing | undefined> {
  const [row] = await db
    .select()
    .from(inventoryListings)
    .where(and(eq(inventoryListings.id, listingId), eq(inventoryListings.userId, userId)))
    .limit(1);
  if (!row || isBlockedDevSeedListingRow(row)) return undefined;
  return row;
}

/** Public share page — active/coming_soon listings only. */
export async function getPublicShareListing(listingId: string): Promise<InventoryListing | undefined> {
  const [row] = await db
    .select()
    .from(inventoryListings)
    .where(eq(inventoryListings.id, listingId))
    .limit(1);
  if (!row || isBlockedDevSeedListingRow(row)) return undefined;
  if (row.status !== "active" && row.status !== "coming_soon") return undefined;
  return row;
}

export async function getInventoryListingsByIds(
  userId: string,
  listingIds: string[],
): Promise<InventoryListing[]> {
  if (listingIds.length === 0) return [];
  const rows = await db
    .select()
    .from(inventoryListings)
    .where(and(eq(inventoryListings.userId, userId), inArray(inventoryListings.id, listingIds)));
  if (!isProductionDevSeedGuardEnabled()) return rows;
  return rows.filter((row) => !isDevSeedProviderListingId(row.providerListingId));
}

/** Active listings flagged new or price-reduced since last sync — for opportunity rebuild. */
export async function fetchActiveListingsWithOpportunityAlerts(
  userId: string,
  sourceId?: string,
): Promise<InventoryListing[]> {
  const conditions = [
    eq(inventoryListings.userId, userId),
    inArray(inventoryListings.status, [...MATCHABLE_INVENTORY_STATUSES]),
    or(
      eq(inventoryListings.syncAlertStatus, "new"),
      and(
        eq(inventoryListings.syncAlertStatus, "price_changed"),
        sql`${inventoryListings.previousPriceCents} IS NOT NULL`,
        sql`${inventoryListings.priceCents} IS NOT NULL`,
        sql`${inventoryListings.priceCents} < ${inventoryListings.previousPriceCents}`,
      ),
    ),
  ];
  if (sourceId) conditions.push(eq(inventoryListings.sourceId, sourceId));
  const devSeedExclude = devSeedListingExcludeCondition();
  if (devSeedExclude) conditions.push(devSeedExclude);

  return db
    .select()
    .from(inventoryListings)
    .where(and(...conditions))
    .orderBy(desc(inventoryListings.syncedAt));
}
