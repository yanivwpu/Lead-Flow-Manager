import { resolveCatalogInstallation } from "../../salesCatalog/shopify/installation";
import type { CatalogDb } from "../../salesCatalog/commerceStore";
import { catalogSources } from "@shared/schema";
import { and, eq } from "drizzle-orm";
// Deliberately requires a reviewed source change. No environment variable can activate checkout.
export const CHECKOUT_ROLLOUT_APPROVED: boolean = false;
export async function checkoutAuthorization(database: CatalogDb, userId: string, entitled: boolean, approved = CHECKOUT_ROLLOUT_APPROVED) {
  if (!entitled) return { ready: false, status: "pro_required" as const, method: "tokenless" as const };
  const install = await resolveCatalogInstallation(database, userId);
  if (!install) return { ready: false, status: "connect_shopify" as const, method: "tokenless" as const };
  if (approved) {
    const [source]=await database.select().from(catalogSources).where(and(eq(catalogSources.userId,userId),eq(catalogSources.integrationId,install.integrationId),eq(catalogSources.shop,install.shop))).limit(1);
    if(!source || !["read_products","read_inventory"].every(scope=>(source.grantedScopes as string[]).includes(scope)))return {ready:false,status:"catalog_permission_required" as const,method:"tokenless" as const};
    if(!source.initialSyncCompletedAt || !["ready","syncing"].includes(source.status))return {ready:false,status:"catalog_unavailable" as const,method:"tokenless" as const};
  }
  return { ready: approved, status: approved ? "ready" as const : "awaiting_review" as const, method: "tokenless" as const };
}
