/**
 * Admin + audit aggregates for MLS listing compliance.
 */
import { sql, and, eq } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { aiBusinessKnowledge, inventoryListings } from "@shared/schema";
import { isProductionDevSeedGuardEnabled } from "@shared/inventory/inventoryDevSeedGuard";
import {
  publicListingMissingAttributionSql,
  publicListingMlsGateSql,
} from "@shared/inventory/publicListingMlsGateSql";

function devSeedListingExcludeCondition() {
  if (!isProductionDevSeedGuardEnabled()) return null;
  return sql`${inventoryListings.providerListingId} not like 'dev-seed-%'`;
}

export type InventoryComplianceDiagnostics = {
  totalListings: number;
  matchableListings: number;
  complianceEligible: number;
  publishedListings: number;
  publishedWithWorkspaceEnabled: number;
  missingAttribution: number;
  missingDisplayPermissions: number;
  withComplianceSnapshot: number;
  workspacesWithPublishEnabled: number;
};

function baseListingConditions() {
  const conditions = [];
  const devSeedExclude = devSeedListingExcludeCondition();
  if (devSeedExclude) conditions.push(devSeedExclude);
  return conditions;
}

/** SQL approximation — refined counts use same rules as hasPublicInternetDisplayPermission. */
export async function getInventoryComplianceDiagnostics(): Promise<InventoryComplianceDiagnostics> {
  const base = baseListingConditions();
  const whereAll = base.length > 0 ? and(...base) : undefined;

  const [counts] = await db
    .select({
      totalListings: sql<number>`count(*)::int`,
      matchableListings: sql<number>`count(*) filter (where ${inventoryListings.status} in ('active', 'coming_soon'))::int`,
      publishedListings: sql<number>`count(*) filter (where ${inventoryListings.publishPublicly})::int`,
      withComplianceSnapshot: sql<number>`count(*) filter (where ${inventoryListings.listingCompliance}->>'extractedAt' is not null)::int`,
      missingAttribution: sql<number>`count(*) filter (where ${publicListingMissingAttributionSql()})::int`,
      missingDisplayPermissions: sql<number>`count(*) filter (where
        (${inventoryListings.listingCompliance}->>'mlgCanView')::text = 'false'
        or (${inventoryListings.listingCompliance}->>'internetEntireListingDisplay')::text = 'false'
        or (${inventoryListings.listingCompliance}->>'internetDisplay')::text = 'false'
        or (
          coalesce(${inventoryListings.listingCompliance}->>'internetEntireListingDisplay', '') = ''
          and coalesce(${inventoryListings.listingCompliance}->>'internetDisplay', '') = ''
          and not (
            (${inventoryListings.listingCompliance}->>'provider') = 'mls_grid'
            and (${inventoryListings.listingCompliance}->>'mlgCanView')::text = 'true'
          )
        )
      )::int`,
      complianceEligible: sql<number>`count(*) filter (where ${publicListingMlsGateSql()})::int`,
    })
    .from(inventoryListings)
    .where(whereAll);

  const [workspaceRow] = await db
    .select({
      workspacesWithPublishEnabled: sql<number>`count(*)::int`,
    })
    .from(aiBusinessKnowledge)
    .where(eq(aiBusinessKnowledge.publishListingsPublicly, true));

  const [publishedLive] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(inventoryListings)
    .innerJoin(aiBusinessKnowledge, eq(inventoryListings.userId, aiBusinessKnowledge.userId))
    .where(
      and(
        eq(inventoryListings.publishPublicly, true),
        eq(aiBusinessKnowledge.publishListingsPublicly, true),
        publicListingMlsGateSql(),
        ...(base.length > 0 ? base : []),
      ),
    );

  return {
    totalListings: counts?.totalListings ?? 0,
    matchableListings: counts?.matchableListings ?? 0,
    complianceEligible: counts?.complianceEligible ?? 0,
    publishedListings: counts?.publishedListings ?? 0,
    publishedWithWorkspaceEnabled: publishedLive?.count ?? 0,
    missingAttribution: counts?.missingAttribution ?? 0,
    missingDisplayPermissions: counts?.missingDisplayPermissions ?? 0,
    withComplianceSnapshot: counts?.withComplianceSnapshot ?? 0,
    workspacesWithPublishEnabled: workspaceRow?.workspacesWithPublishEnabled ?? 0,
  };
}

export async function listAllConnectedInventorySourceIds(): Promise<
  { id: string; userId: string; provider: string }[]
> {
  const { inventorySources } = await import("@shared/schema");
  const rows = await db
    .select({
      id: inventorySources.id,
      userId: inventorySources.userId,
      provider: inventorySources.provider,
    })
    .from(inventorySources)
    .where(eq(inventorySources.connectionStatus, "connected"));
  return rows;
}
