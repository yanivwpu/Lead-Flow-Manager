import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import {
  inventoryListings,
  inventorySources,
  type InventoryListing,
  type InventorySource,
} from "@shared/schema";
import type { NormalizedInventoryListing } from "@shared/inventory/inventoryListingSchema";
import { db } from "../../drizzle/db";
import { decryptIntegrationConfig, encryptIntegrationConfig } from "../integrationConfigCrypto";

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

export async function upsertInventoryListing(
  userId: string,
  sourceId: string,
  normalized: NormalizedInventoryListing,
): Promise<void> {
  const row = listingRowFromNormalized(userId, sourceId, normalized);
  await db
    .insert(inventoryListings)
    .values(row)
    .onConflictDoUpdate({
      target: [inventoryListings.sourceId, inventoryListings.providerListingId],
      set: {
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
        syncedAt: new Date(),
        updatedAt: new Date(),
      },
    });
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
  return db
    .select()
    .from(inventoryListings)
    .where(and(eq(inventoryListings.userId, userId), eq(inventoryListings.status, "active")))
    .orderBy(desc(inventoryListings.syncedAt))
    .limit(limit);
}

export async function countActiveListingsForUser(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryListings)
    .where(and(eq(inventoryListings.userId, userId), eq(inventoryListings.status, "active")));
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
  return row;
}
