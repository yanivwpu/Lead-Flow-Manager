import { createHash } from "node:crypto";
import { normalizeShopifyShopDomain } from "@shared/shopifyBilling";
import { SHOPIFY_CATALOG_SCOPES } from "@shared/commerceCatalog";
/** Official optional-scope flow. Does not exchange tokens, provision billing or send mail. */
export function catalogAuthorizationUrl(
  rawShop: string,
  clientId: string,
): string | null {
  const shop = normalizeShopifyShopDomain(rawShop);
  if (!shop || !clientId) return null;
  const target = new URL(
    `https://admin.shopify.com/store/${shop.slice(0, -".myshopify.com".length)}/oauth/install`,
  );
  target.searchParams.set("client_id", clientId);
  target.searchParams.set("optional_scopes", SHOPIFY_CATALOG_SCOPES.join(","));
  return target.href;
}

export const CATALOG_RETURN_PATH = "/api/shopify/catalog/return";
export const CATALOG_PAGE_PATH = "/app/sales-catalog?source=shopify";
const INTENT_LIFETIME_MS = 15 * 60_000;
export type CatalogAuthorizationIntent = {
  actorUserId: string;
  workspaceUserId: string;
  shop: string;
  integrationId: string;
  tokenHash: string;
  expiresAt: number;
};
export type CatalogAuthorizationSession = {
  catalogAuthorization?: CatalogAuthorizationIntent;
};
export function createCatalogAuthorizationIntent(
  install: {
    userId: string;
    shop: string;
    integrationId: string;
    token: string;
  },
  actorUserId: string,
): CatalogAuthorizationIntent {
  return {
    actorUserId,
    workspaceUserId: install.userId,
    shop: install.shop,
    integrationId: install.integrationId,
    tokenHash: tokenHash(install.token),
    expiresAt: Date.now() + INTENT_LIFETIME_MS,
  };
}
export function catalogAuthorizationIntentMatches(
  intent: CatalogAuthorizationIntent | undefined,
  actorUserId: string | undefined,
  shop: string,
): intent is CatalogAuthorizationIntent {
  return (
    !!intent &&
    !!actorUserId &&
    intent.actorUserId === actorUserId &&
    intent.shop === normalizeShopifyShopDomain(shop) &&
    intent.expiresAt > Date.now() &&
    intent.expiresAt <= Date.now() + INTENT_LIFETIME_MS
  );
}
/** Session intent selects a fixed destination only; it never authenticates a user or grants scopes/access. */
export function catalogAuthorizationReturnPath(
  req: { user?: { id: string }; session?: object },
  shop: string,
): string | null {
  const session = req.session as CatalogAuthorizationSession | undefined;
  const intent = session?.catalogAuthorization;
  if (
    !intent ||
    !req.user?.id ||
    intent.actorUserId !== req.user.id ||
    intent.shop !== normalizeShopifyShopDomain(shop)
  )
    return null;
  if (catalogAuthorizationIntentMatches(intent, req.user.id, shop))
    return CATALOG_RETURN_PATH;
  // Expired intents cannot verify access, but also must not restart onboarding.
  delete session!.catalogAuthorization;
  return CATALOG_PAGE_PATH;
}
export function catalogAuthorizationInstallationMatches(
  intent: CatalogAuthorizationIntent,
  install: {
    userId: string;
    shop: string;
    integrationId: string;
    token: string;
  },
): boolean {
  return (
    intent.workspaceUserId === install.userId &&
    intent.shop === install.shop &&
    intent.integrationId === install.integrationId &&
    intent.tokenHash === tokenHash(install.token)
  );
}
function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
