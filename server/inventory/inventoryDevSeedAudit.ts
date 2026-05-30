import { sql, inArray } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { inventoryListings, inventorySources, users } from "@shared/schema";
import {
  isDevSeedOriginatingSystem,
  isProductionDevSeedGuardEnabled,
} from "@shared/inventory/inventoryDevSeedGuard";

export type InventoryDevSeedAuditReport = {
  devSeedSourceCount: number;
  devSeedListingCount: number;
  sources: Array<{
    sourceId: string;
    userId: string;
    email: string | null;
    provider: string;
    displayName: string;
    listingCount: number;
  }>;
};

export async function auditInventoryDevSeedInDatabase(): Promise<InventoryDevSeedAuditReport> {
  const sources = await db.select().from(inventorySources);

  const listingCounts = await db
    .select({
      sourceId: inventoryListings.sourceId,
      total: sql<number>`count(*)::int`,
      devSeed: sql<number>`count(*) filter (where ${inventoryListings.providerListingId} like 'dev-seed-%')::int`,
    })
    .from(inventoryListings)
    .groupBy(inventoryListings.sourceId);

  const [globalDevSeedListings] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryListings)
    .where(sql`${inventoryListings.providerListingId} like 'dev-seed-%'`);

  const userIds = [...new Set(sources.map((s) => s.userId))];
  const userRows =
    userIds.length > 0
      ? await db
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(inArray(users.id, userIds))
      : [];
  const emailByUser = Object.fromEntries(userRows.map((u) => [u.id, u.email]));

  const devSeedSources = sources.filter((s) => {
    const cfg = (s.config || {}) as Record<string, unknown>;
    const orig = typeof cfg.originatingSystemName === "string" ? cfg.originatingSystemName : "";
    const counts = listingCounts.find((c) => c.sourceId === s.id);
    return isDevSeedOriginatingSystem(orig) || (counts?.devSeed ?? 0) > 0;
  });

  return {
    devSeedSourceCount: devSeedSources.length,
    devSeedListingCount: globalDevSeedListings?.count ?? 0,
    sources: devSeedSources.map((s) => {
      const counts = listingCounts.find((c) => c.sourceId === s.id);
      return {
        sourceId: s.id,
        userId: s.userId,
        email: emailByUser[s.userId] ?? null,
        provider: s.provider,
        displayName: s.displayName,
        listingCount: counts?.total ?? 0,
      };
    }),
  };
}

/** Log-only startup audit — never deletes dev-seed data. */
export async function runInventoryDevSeedProductionAudit(): Promise<InventoryDevSeedAuditReport | null> {
  if (!isProductionDevSeedGuardEnabled()) {
    return null;
  }

  const report = await auditInventoryDevSeedInDatabase();

  if (report.devSeedSourceCount === 0 && report.devSeedListingCount === 0) {
    console.log("[inventory-dev-seed] Production audit: no dev-seed inventory found.");
    return report;
  }

  console.warn(
    `[inventory-dev-seed] Production audit: found ${report.devSeedSourceCount} dev-seed source(s) and ${report.devSeedListingCount} dev-seed listing row(s). Dev-seed sync/matching is blocked; data was NOT auto-deleted.`,
  );

  for (const source of report.sources) {
    console.warn(
      "[inventory-dev-seed]",
      JSON.stringify({
        sourceId: source.sourceId,
        email: source.email,
        provider: source.provider,
        displayName: source.displayName,
        listingCount: source.listingCount,
      }),
    );
  }

  return report;
}
