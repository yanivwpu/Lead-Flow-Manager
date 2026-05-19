/** Shared Shopify shop domain validation (client + server). */
export const SHOPIFY_SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

export function normalizeShopifyShopDomain(shop: string | null | undefined): string | null {
  const s = shop?.trim();
  if (!s || !SHOPIFY_SHOP_DOMAIN_RE.test(s)) return null;
  return s.toLowerCase();
}

export function isShopifyShopDomain(shop: string | null | undefined): boolean {
  return !!normalizeShopifyShopDomain(shop);
}

export const SHOPIFY_BILLING_REQUIRED_CODE = "SHOPIFY_BILLING_REQUIRED";
