import { and, eq, sql } from "drizzle-orm";
import { catalogSources } from "@shared/schema";
import type { CatalogDb } from "../commerceStore";
import {
  assertCatalogInstallation,
  type resolveCatalogInstallation,
} from "./installation";
import { shopifyCatalogRequest } from "./api";
type Installation = NonNullable<
  Awaited<ReturnType<typeof resolveCatalogInstallation>>
>;
/** Actual grants only. Browser returns and webhook bodies are never authorization evidence. */
export async function verifyCatalogAccess(
  install: Installation,
  requestFor = shopifyCatalogRequest,
): Promise<string[]> {
  const data = await requestFor(
    install.shop,
    install.token,
  )(
    `query CatalogAccess { currentAppInstallation { accessScopes { handle } } shop { myshopifyDomain } }`,
  );
  const handles = data.currentAppInstallation?.accessScopes;
  if (
    data.shop?.myshopifyDomain !== install.shop ||
    !Array.isArray(handles) ||
    !handles.length ||
    handles.some((s: any) => typeof s?.handle !== "string" || !s.handle.trim())
  )
    throw Error("catalog_access_unverified");
  return [...new Set<string>(handles.map((s: any) => s.handle.trim()))];
}
/** Refresh only the owned catalog source; preserve data, checkpoints, leases and quota/error delays. */
export async function refreshCatalogAccess(
  database: CatalogDb,
  install: Installation,
  scopes: string[],
) {
  await database.transaction(async (tx) => {
    await assertCatalogInstallation(tx, install);
    const [source] = await tx
      .select()
      .from(catalogSources)
      .where(
        and(
          eq(catalogSources.userId, install.userId),
          eq(catalogSources.integrationId, install.integrationId),
          eq(catalogSources.shop, install.shop),
          eq(catalogSources.provider, "shopify"),
          sql`${catalogSources.status}<>'disconnected'`,
        ),
      )
      .for("update")
      .limit(1);
    if (!source) throw Error("catalog_source_not_owned");
    const granted = scopes.includes("read_products");
    await tx
      .update(catalogSources)
      .set({
        grantedScopes: scopes,
        status: !granted
          ? source.status === "syncing"
            ? "syncing"
            : "permission_required"
          : source.status === "permission_required"
            ? "syncing"
            : source.status,
        errorCode: !granted
          ? source.errorCode && source.errorCode !== "read_products_required"
            ? source.errorCode
            : "read_products_required"
          : source.errorCode === "read_products_required"
            ? null
            : source.errorCode,
        // A newly granted permission can clear its permission wait, never a rate-limit/API-error wait.
        nextAttemptAt: granted
          ? sql`CASE WHEN (${catalogSources.status}='syncing' OR (${catalogSources.errorCode} IS NOT NULL AND ${catalogSources.errorCode}<>'read_products_required')) AND ${catalogSources.nextAttemptAt}>NOW() THEN ${catalogSources.nextAttemptAt} ELSE NOW() END`
          : source.nextAttemptAt,
      })
      .where(eq(catalogSources.id, source.id));
  });
}
