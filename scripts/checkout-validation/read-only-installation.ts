import { and, eq } from 'drizzle-orm';
import { users, integrations } from '../../shared/schema';
import { normalizeShopifyShopDomain } from '../../shared/shopifyBilling';
import { isShopifyContactInstallationActive } from '../../shared/shopifyContactPrivacy';
import type { CatalogDb } from '../../server/salesCatalog/commerceStore';

/** Narrow-column, SELECT-only installation resolver for isolated checkout preflight. */
export async function resolveReadOnlyCheckoutInstallation(db: CatalogDb, userId: string, expectedShop: string) {
  const [user] = await db.select({
    id: users.id,
    shopifyShop: users.shopifyShop,
    shopifyAccessToken: users.shopifyAccessToken,
    shopifySubscriptionStatus: users.shopifySubscriptionStatus,
    deletionRequestedAt: users.deletionRequestedAt,
  }).from(users).where(eq(users.id,userId)).limit(1);
  if(!user || !isShopifyContactInstallationActive(user)) return null;
  const shop=normalizeShopifyShopDomain(user.shopifyShop);
  if(shop!==expectedShop) return null;
  const [integration]=await db.select({
    id: integrations.id,
    config: integrations.config,
  }).from(integrations).where(and(eq(integrations.userId,userId),
    eq(integrations.type,'shopify'),eq(integrations.isActive,true))).limit(1);
  if(!integration) return null;
  const configured=(integration.config as any)?.shopUrl ?? (integration.config as any)?.shop;
  if(configured && normalizeShopifyShopDomain(configured)!==shop) return null;
  return {userId,shop,integrationId:integration.id,token:user.shopifyAccessToken!};
}
