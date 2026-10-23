import { and, eq, sql } from 'drizzle-orm';
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
  const matches=await db.select({
    id: integrations.id,
    config: integrations.config,
  }).from(integrations).where(and(eq(integrations.userId,userId),
    eq(integrations.type,'shopify'),eq(integrations.isActive,true))).limit(2);
  if(matches.length!==1) return null;
  const [integration]=matches;
  const configured=(integration.config as any)?.shopUrl ?? (integration.config as any)?.shop;
  if(configured && normalizeShopifyShopDomain(configured)!==shop) return null;
  return {userId,shop,integrationId:integration.id,token:user.shopifyAccessToken!};
}

/** Discover identity only, then reuse the restricted credential resolver. Never choose the first owner. */
export async function resolveReadOnlyCheckoutOwner(db: CatalogDb) {
  const shop='whachatcrm.myshopify.com';
  const owners=await db.select({id:users.id}).from(users)
    .where(sql`lower(btrim(${users.shopifyShop})) = ${shop}`).limit(2);
  if(owners.length!==1) throw Error('installation_owner_not_unique');
  const install=await resolveReadOnlyCheckoutInstallation(db,owners[0].id,shop);
  if(!install || typeof install.token!=='string' || !install.token.trim() || install.token!==install.token.trim())
    throw Error('installation_unavailable');
  return install;
}

