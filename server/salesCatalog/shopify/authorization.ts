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
