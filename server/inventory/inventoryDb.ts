import { and, desc, eq, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import {
  inventoryListings,
  inventorySources,
  users,
  type InventoryListing,
  type InventorySource,
} from "@shared/schema";
import type { NormalizedInventoryListing } from "@shared/inventory/inventoryListingSchema";
import { MATCHABLE_INVENTORY_STATUSES, isMatchableInventoryStatus } from "@shared/inventory/inventoryListingSchema";
import type { SyncAlertStatus } from "@shared/inventory/inventoryOpportunityTypes";
import {
  DEFAULT_MAX_LISTINGS,
  normalizedListingInSyncAreaScope,
  readInventorySyncScope,
  type InventorySyncScope,
} from "@shared/inventory/reso/resoSyncScope";
import { providerSupportsListingSync } from "@shared/inventory/inventoryProviderSchema";
import {
  buildListingPublicSlug,
  isListingShareUuid,
} from "@shared/inventory/listingPublicSlug";
import { buildListingCanonicalShareUrl } from "@shared/inventory/listingViewUrl";
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
    propertySubtype: normalized.propertySubtype ?? null,
    squareFeet: normalized.squareFeet ?? null,
    yearBuilt: normalized.yearBuilt ?? null,
    hoaFeeCents: normalized.hoaFeeCents ?? null,
    listingDetails: normalized.listingDetails ?? {},
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

export type ListingUpsertOutcome =
  | { outcome: "inserted"; result: ListingUpsertResult }
  | { outcome: "updated"; result: ListingUpsertResult }
  | { outcome: "skipped_cap" }
  | { outcome: "skipped_out_of_scope" };

export type InventoryListingUpsertPolicy = Pick<InventorySyncScope, "maxListings" | "cities" | "zipCodes">;

export type SourceListingStats = {
  total: number;
  matchable: number;
};

/** In-memory matchable count cache — increment when inserting matchable listings. */
export type MatchableCountCache = { value: number };

export async function countMatchableListingsForSource(sourceId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryListings)
    .where(
      and(
        eq(inventoryListings.sourceId, sourceId),
        inArray(inventoryListings.status, [...MATCHABLE_INVENTORY_STATUSES]),
      ),
    );
  return row?.count ?? 0;
}

export async function countListingStatsBySourceForUser(
  userId: string,
): Promise<Record<string, SourceListingStats>> {
  const rows = await db
    .select({
      sourceId: inventoryListings.sourceId,
      total: sql<number>`count(*)::int`,
      matchable: sql<number>`count(*) filter (where ${inventoryListings.status} in ('active', 'coming_soon'))::int`,
    })
    .from(inventoryListings)
    .where(eq(inventoryListings.userId, userId))
    .groupBy(inventoryListings.sourceId);

  const out: Record<string, SourceListingStats> = {};
  for (const row of rows) {
    out[row.sourceId] = { total: row.total, matchable: row.matchable };
  }
  return out;
}

/** @deprecated Use countListingStatsBySourceForUser — kept for callers expecting total-only map. */
export async function countListingsBySourceForUser(
  userId: string,
): Promise<Record<string, number>> {
  const stats = await countListingStatsBySourceForUser(userId);
  const out: Record<string, number> = {};
  for (const [sourceId, s] of Object.entries(stats)) {
    out[sourceId] = s.total;
  }
  return out;
}

/** Max listings to score for buyer matching — highest cap among user's listing-sync sources. */
export async function resolveMatchingListingLimitForUser(userId: string): Promise<number> {
  const sources = await listInventorySources(userId);
  let limit = DEFAULT_MAX_LISTINGS;
  for (const source of sources) {
    if (!providerSupportsListingSync(source.provider)) continue;
    const scope = readInventorySyncScope((source.config || {}) as Record<string, unknown>);
    limit = Math.max(limit, scope.maxListings);
  }
  return limit;
}

async function updateExistingInventoryListing(
  existing: typeof inventoryListings.$inferSelect,
  row: ReturnType<typeof listingRowFromNormalized>,
  now: Date,
): Promise<ListingUpsertResult> {
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
      propertySubtype: row.propertySubtype,
      squareFeet: row.squareFeet,
      yearBuilt: row.yearBuilt,
      hoaFeeCents: row.hoaFeeCents,
      listingDetails: row.listingDetails,
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

export async function upsertInventoryListingWithPolicy(
  userId: string,
  sourceId: string,
  normalized: NormalizedInventoryListing,
  policy: InventoryListingUpsertPolicy,
  matchableCountCache: MatchableCountCache,
): Promise<ListingUpsertOutcome> {
  const listingGuard = assertProductionDevSeedListingAllowed(normalized.providerListingId);
  if (!listingGuard.ok) {
    throw new Error(listingGuard.message);
  }

  const row = listingRowFromNormalized(userId, sourceId, normalized);
  const now = new Date();

  const [existing] = await db
    .select({ id: inventoryListings.id, status: inventoryListings.status, priceCents: inventoryListings.priceCents, previousPriceCents: inventoryListings.previousPriceCents, lastPriceChangeAt: inventoryListings.lastPriceChangeAt })
    .from(inventoryListings)
    .where(
      and(
        eq(inventoryListings.sourceId, sourceId),
        eq(inventoryListings.providerListingId, normalized.providerListingId),
      ),
    )
    .limit(1);

  if (!existing) {
    if (!normalizedListingInSyncAreaScope(normalized, policy)) {
      return { outcome: "skipped_out_of_scope" };
    }
    if (matchableCountCache.value >= policy.maxListings) {
      return { outcome: "skipped_cap" };
    }

    const [inserted] = await db
      .insert(inventoryListings)
      .values({
        ...row,
        syncAlertStatus: "new",
        firstSeenAt: now,
      })
      .returning({ id: inventoryListings.id });

    if (isMatchableInventoryStatus(normalized.status)) {
      matchableCountCache.value += 1;
    }

    await ensurePublicSlugForListing(inserted.id);

    return {
      outcome: "inserted",
      result: {
        listingId: inserted.id,
        syncAlertStatus: "new",
        previousPriceCents: null,
        currentPriceCents: row.priceCents ?? null,
        priceReduced: false,
      },
    };
  }

  const wasMatchable = isMatchableInventoryStatus(existing.status as NormalizedInventoryListing["status"]);
  const updateResult = await updateExistingInventoryListing(existing as typeof inventoryListings.$inferSelect, row, now);
  await ensurePublicSlugForListing(updateResult.listingId);
  const nowMatchable = isMatchableInventoryStatus(normalized.status);
  if (!wasMatchable && nowMatchable) {
    matchableCountCache.value += 1;
  } else if (wasMatchable && !nowMatchable) {
    matchableCountCache.value = Math.max(0, matchableCountCache.value - 1);
  }

  return { outcome: "updated", result: updateResult };
}

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
    await ensurePublicSlugForListing(inserted.id);
    return {
      listingId: inserted.id,
      syncAlertStatus: "new",
      previousPriceCents: null,
      currentPriceCents: row.priceCents ?? null,
      priceReduced: false,
    };
  }

  const updateResult = await updateExistingInventoryListing(existing, row, now);
  await ensurePublicSlugForListing(updateResult.listingId);
  return updateResult;
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

/** Columns required for buyer matching (excludes flyer-only fields from migration 0038). */
const MATCHING_LISTING_SELECT = {
  id: inventoryListings.id,
  userId: inventoryListings.userId,
  sourceId: inventoryListings.sourceId,
  provider: inventoryListings.provider,
  providerListingId: inventoryListings.providerListingId,
  status: inventoryListings.status,
  priceCents: inventoryListings.priceCents,
  currency: inventoryListings.currency,
  addressLine1: inventoryListings.addressLine1,
  addressLine2: inventoryListings.addressLine2,
  city: inventoryListings.city,
  state: inventoryListings.state,
  zip: inventoryListings.zip,
  country: inventoryListings.country,
  latitude: inventoryListings.latitude,
  longitude: inventoryListings.longitude,
  beds: inventoryListings.beds,
  baths: inventoryListings.baths,
  propertyType: inventoryListings.propertyType,
  description: inventoryListings.description,
  features: inventoryListings.features,
  photos: inventoryListings.photos,
  listingUrl: inventoryListings.listingUrl,
  sourceUpdatedAt: inventoryListings.sourceUpdatedAt,
  syncedAt: inventoryListings.syncedAt,
  firstSeenAt: inventoryListings.firstSeenAt,
  syncAlertStatus: inventoryListings.syncAlertStatus,
  previousPriceCents: inventoryListings.previousPriceCents,
  lastPriceChangeAt: inventoryListings.lastPriceChangeAt,
  publicSlug: inventoryListings.publicSlug,
  createdAt: inventoryListings.createdAt,
  updatedAt: inventoryListings.updatedAt,
} as const;

type CoreInventoryListingRow = Omit<
  InventoryListing,
  "propertySubtype" | "squareFeet" | "yearBuilt" | "hoaFeeCents" | "listingDetails"
>;

/** Map core DB row to InventoryListing (flyer-only columns null until migration 0038). */
function inventoryListingFromCoreRow(row: CoreInventoryListingRow): InventoryListing {
  return {
    ...row,
    propertySubtype: null,
    squareFeet: null,
    yearBuilt: null,
    hoaFeeCents: null,
    listingDetails: {},
  };
}

/** Flyer-only columns from migration 0038 — loaded separately so share page works without migration. */
const FLYER_EXTRA_LISTING_SELECT = {
  propertySubtype: inventoryListings.propertySubtype,
  squareFeet: inventoryListings.squareFeet,
  yearBuilt: inventoryListings.yearBuilt,
  hoaFeeCents: inventoryListings.hoaFeeCents,
  listingDetails: inventoryListings.listingDetails,
} as const;

type FlyerExtraListingFields = Pick<
  InventoryListing,
  "propertySubtype" | "squareFeet" | "yearBuilt" | "hoaFeeCents" | "listingDetails"
>;

const EMPTY_FLYER_EXTRA_FIELDS: FlyerExtraListingFields = {
  propertySubtype: null,
  squareFeet: null,
  yearBuilt: null,
  hoaFeeCents: null,
  listingDetails: {},
};

async function tryLoadFlyerExtraFields(listingId: string): Promise<FlyerExtraListingFields> {
  try {
    const [row] = await db
      .select(FLYER_EXTRA_LISTING_SELECT)
      .from(inventoryListings)
      .where(eq(inventoryListings.id, listingId))
      .limit(1);
    if (!row) return EMPTY_FLYER_EXTRA_FIELDS;
    return {
      propertySubtype: row.propertySubtype ?? null,
      squareFeet: row.squareFeet ?? null,
      yearBuilt: row.yearBuilt ?? null,
      hoaFeeCents: row.hoaFeeCents ?? null,
      listingDetails: row.listingDetails ?? {},
    };
  } catch (error) {
    console.warn("[public-listing] flyer columns unavailable (apply migration 0038 for extended details)", {
      listingId,
      error: error instanceof Error ? error.message : String(error),
    });
    return EMPTY_FLYER_EXTRA_FIELDS;
  }
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

  const rows = await db
    .select(MATCHING_LISTING_SELECT)
    .from(inventoryListings)
    .where(and(...conditions))
    .orderBy(desc(inventoryListings.syncedAt))
    .limit(limit);

  return rows.map(inventoryListingFromCoreRow);
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
    .select(MATCHING_LISTING_SELECT)
    .from(inventoryListings)
    .where(and(eq(inventoryListings.id, listingId), eq(inventoryListings.userId, userId)))
    .limit(1);
  if (!row || isBlockedDevSeedListingRow(row)) return undefined;
  return inventoryListingFromCoreRow(row);
}

/** Public share page listing select — includes flyer columns in one query when available. */
const PUBLIC_SHARE_LISTING_SELECT = {
  ...MATCHING_LISTING_SELECT,
  propertySubtype: inventoryListings.propertySubtype,
  squareFeet: inventoryListings.squareFeet,
  yearBuilt: inventoryListings.yearBuilt,
  hoaFeeCents: inventoryListings.hoaFeeCents,
  listingDetails: inventoryListings.listingDetails,
} as const;

function mapPublicShareListingRow(
  row: CoreInventoryListingRow & Partial<FlyerExtraListingFields>,
): InventoryListing {
  const core = inventoryListingFromCoreRow(row);
  return {
    ...core,
    propertySubtype: row.propertySubtype ?? null,
    squareFeet: row.squareFeet != null ? Number(row.squareFeet) : null,
    yearBuilt: row.yearBuilt != null ? Number(row.yearBuilt) : null,
    hoaFeeCents: row.hoaFeeCents != null ? Number(row.hoaFeeCents) : null,
    listingDetails: row.listingDetails ?? {},
  };
}

/** Assign public_slug once when address fields allow; never overwrite existing slug. */
export async function ensurePublicSlugForListing(listingId: string): Promise<string | null> {
  const [row] = await db
    .select({
      id: inventoryListings.id,
      publicSlug: inventoryListings.publicSlug,
      addressLine1: inventoryListings.addressLine1,
      addressLine2: inventoryListings.addressLine2,
      city: inventoryListings.city,
      state: inventoryListings.state,
      zip: inventoryListings.zip,
    })
    .from(inventoryListings)
    .where(eq(inventoryListings.id, listingId))
    .limit(1);

  if (!row?.id || row.publicSlug) return row?.publicSlug ?? null;

  const slug = buildListingPublicSlug({
    id: row.id,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    state: row.state,
    zip: row.zip,
  });
  if (!slug) return null;

  const [updated] = await db
    .update(inventoryListings)
    .set({ publicSlug: slug, updatedAt: new Date() })
    .where(and(eq(inventoryListings.id, listingId), isNull(inventoryListings.publicSlug)))
    .returning({ publicSlug: inventoryListings.publicSlug });

  return updated?.publicSlug ?? slug;
}

function isShareablePublicListingRow(row: { status: string; providerListingId: string }): boolean {
  if (row.status !== "active" && row.status !== "coming_soon") return false;
  if (isBlockedDevSeedListingRow(row as InventoryListing)) return false;
  return true;
}

/** Public share page — active/coming_soon listings only. */
export async function getPublicShareListing(listingId: string): Promise<InventoryListing | undefined> {
  try {
    const [row] = await db
      .select(PUBLIC_SHARE_LISTING_SELECT)
      .from(inventoryListings)
      .where(eq(inventoryListings.id, listingId))
      .limit(1);
    if (!row || isBlockedDevSeedListingRow(row)) return undefined;
    if (!isShareablePublicListingRow(row)) return undefined;
    return mapPublicShareListingRow(row);
  } catch (error) {
    console.warn("[public-listing] combined share listing select failed; retrying without flyer columns", {
      listingId,
      error: error instanceof Error ? error.message : String(error),
    });
    try {
      const [row] = await db
        .select(MATCHING_LISTING_SELECT)
        .from(inventoryListings)
        .where(eq(inventoryListings.id, listingId))
        .limit(1);
      if (!row || isBlockedDevSeedListingRow(row)) return undefined;
      if (!isShareablePublicListingRow(row)) return undefined;

      const extras = await tryLoadFlyerExtraFields(listingId);
      return { ...inventoryListingFromCoreRow(row), ...extras };
    } catch (fallbackError) {
      console.error("[public-listing] failed to load listing row", {
        listingId,
        error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      });
      throw fallbackError;
    }
  }
}

/** Resolve public listing by UUID (first) or public_slug (second). */
export async function resolvePublicShareListing(
  identifier: string,
): Promise<InventoryListing | undefined> {
  const trimmed = identifier.trim();
  if (!trimmed) return undefined;
  if (isListingShareUuid(trimmed)) {
    return getPublicShareListing(trimmed);
  }
  return getPublicShareListingBySlug(trimmed);
}

async function getPublicShareListingBySlug(slug: string): Promise<InventoryListing | undefined> {
  const normalizedSlug = slug.trim().toLowerCase();
  if (!normalizedSlug) return undefined;

  try {
    const [row] = await db
      .select(PUBLIC_SHARE_LISTING_SELECT)
      .from(inventoryListings)
      .where(sql`lower(${inventoryListings.publicSlug}) = ${normalizedSlug}`)
      .limit(1);
    if (!row || isBlockedDevSeedListingRow(row)) return undefined;
    if (!isShareablePublicListingRow(row)) return undefined;
    return mapPublicShareListingRow(row);
  } catch (error) {
    console.warn("[public-listing] slug lookup failed", {
      slug,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

export type PublicListingSitemapEntry = {
  id: string;
  publicSlug: string | null;
  lastmod: Date;
};

function publicShareableListingConditions() {
  const conditions = [
    inArray(inventoryListings.status, [...MATCHABLE_INVENTORY_STATUSES]),
  ];
  const devSeedExclude = devSeedListingExcludeCondition();
  if (devSeedExclude) conditions.push(devSeedExclude);
  return conditions;
}

export async function countPublicShareableListings(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryListings)
    .where(and(...publicShareableListingConditions()));
  return row?.count ?? 0;
}

export async function fetchPublicListingSitemapEntries(
  offset: number,
  limit: number,
): Promise<PublicListingSitemapEntry[]> {
  const rows = await db
    .select({
      id: inventoryListings.id,
      publicSlug: inventoryListings.publicSlug,
      lastmod: sql<Date>`GREATEST(
        ${inventoryListings.updatedAt},
        ${inventoryListings.syncedAt},
        COALESCE(${inventoryListings.sourceUpdatedAt}, ${inventoryListings.syncedAt})
      )`,
    })
    .from(inventoryListings)
    .where(and(...publicShareableListingConditions()))
    .orderBy(desc(inventoryListings.updatedAt))
    .limit(limit)
    .offset(offset);

  return rows.map((row) => ({
    id: row.id,
    publicSlug: row.publicSlug ?? null,
    lastmod: row.lastmod instanceof Date ? row.lastmod : new Date(row.lastmod),
  }));
}

export type PublicListingAgentProfile = {
  name: string | null;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  brokerageName: string | null;
  bookingLink: string | null;
};

export type PublicListingFlyerData = {
  listing: InventoryListing;
  agent: PublicListingAgentProfile;
  companyLogoUrl: string | null;
  shareUrl: string;
};

/** Listing + sanitized agent branding for public flyer (no CRM contact data). */
export async function getPublicListingFlyerData(
  identifier: string,
  appOrigin: string,
): Promise<PublicListingFlyerData | undefined> {
  let listing: InventoryListing | undefined;
  try {
    listing = await resolvePublicShareListing(identifier);
  } catch (error) {
    console.error("[public-listing] resolvePublicShareListing failed", {
      identifier,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
  if (!listing) {
    console.info("[public-listing] listing not found or not shareable", { identifier });
    return undefined;
  }

  if (!listing.publicSlug) {
    const slug = await ensurePublicSlugForListing(listing.id);
    if (slug) listing = { ...listing, publicSlug: slug };
  }

  const shareUrl = buildListingCanonicalShareUrl(
    { listingId: listing.id, publicSlug: listing.publicSlug },
    appOrigin,
  );

  try {
    const { resolvePublicListingAgent } = await import("../businessProfileService");
    const resolved = await resolvePublicListingAgent(listing.userId);
    const { companyLogoUrl, ...agent } = resolved;

    return { listing, agent, companyLogoUrl, shareUrl };
  } catch (error) {
    console.error("[public-listing] failed to load agent profile for flyer", {
      listingId: listing.id,
      identifier,
      userId: listing.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
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
