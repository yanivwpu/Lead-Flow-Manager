import { and, eq, sql } from "drizzle-orm";
import { users, integrations, catalogSources } from "@shared/schema";
import { normalizeShopifyShopDomain } from "@shared/shopifyBilling";
import { isShopifyContactInstallationActive } from "@shared/shopifyContactPrivacy";
import type { CatalogDb } from "../commerceStore";
export async function resolveCatalogInstallation(
  database: CatalogDb,
  userId: string,
  expectedShop?: string,
) {
  const [user] = await database
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const shop = normalizeShopifyShopDomain(user?.shopifyShop);
  if (
    !user ||
    !shop ||
    !user.shopifyAccessToken ||
    !isShopifyContactInstallationActive(user) ||
    (expectedShop && shop !== expectedShop)
  )
    return null;
  const [integration] = await database
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.userId, userId),
        eq(integrations.type, "shopify"),
        eq(integrations.isActive, true),
      ),
    )
    .limit(1);
  const configured =
    (integration?.config as any)?.shopUrl ?? (integration?.config as any)?.shop;
  if (
    !integration ||
    (configured && normalizeShopifyShopDomain(configured) !== shop)
  )
    return null;
  return {
    userId,
    shop,
    integrationId: integration.id,
    token: user.shopifyAccessToken,
  };
}
export async function ensureCatalogSource(database: CatalogDb, userId: string) {
  const install = await resolveCatalogInstallation(database, userId);
  if (!install) return null;
  const [source] = await database
    .insert(catalogSources)
    .values({
      userId,
      shop: install.shop,
      integrationId: install.integrationId,
      provider: "shopify",
    })
    .onConflictDoUpdate({
      target: [
        catalogSources.userId,
        catalogSources.provider,
        catalogSources.shop,
      ],
      set: {
        integrationId: install.integrationId,
        status: sql`CASE WHEN ${catalogSources.status}='disconnected' THEN 'permission_required' ELSE ${catalogSources.status} END`,
      },
    })
    .returning();
  return source;
}
/** Reuses Shopify's shop advisory-lock fence; called inside an existing transaction. */
export async function assertCatalogInstallation(
  tx: CatalogDb,
  install: NonNullable<Awaited<ReturnType<typeof resolveCatalogInstallation>>>,
) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${install.shop},0))`,
  );
  const current = await resolveCatalogInstallation(
    tx,
    install.userId,
    install.shop,
  );
  if (
    !current ||
    current.integrationId !== install.integrationId ||
    current.token !== install.token
  )
    throw new Error("installation_changed");
}
