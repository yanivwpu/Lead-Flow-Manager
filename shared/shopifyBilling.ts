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

export const SHOPIFY_RECONNECT_REQUIRED_CODE = "SHOPIFY_RECONNECT_REQUIRED";

export const SHOPIFY_RECONNECT_REQUIRED_MESSAGE =
  "Open WhachatCRM from Shopify admin to reconnect billing.";

/** Synthetic login email for Shopify-only merchant accounts (one per shop slug). */
export const SHOPIFY_MERCHANT_EMAIL_DOMAIN = "shopify.whachatcrm.com";

export function shopifySyntheticMerchantEmail(shop: string | null | undefined): string | null {
  const normalized = normalizeShopifyShopDomain(shop);
  if (!normalized) return null;
  const suffix = ".myshopify.com";
  if (!normalized.endsWith(suffix)) return null;
  const slug = normalized.slice(0, -suffix.length);
  if (!slug) return null;
  return `${slug}@${SHOPIFY_MERCHANT_EMAIL_DOMAIN}`.toLowerCase();
}

export function isShopifySyntheticMerchantEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase().endsWith(`@${SHOPIFY_MERCHANT_EMAIL_DOMAIN}`);
}

/**
 * Normalize Shopify Admin `shop.email` for onboarding.
 * Rejects missing, malformed, and synthetic identity addresses.
 * Does not accept customer emails or contactEmail — callers must pass shop.email only.
 */
export function sanitizeShopifyOwnerEmail(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (!email || !email.includes("@")) return null;
  if (isShopifySyntheticMerchantEmail(email)) return null;
  if (/\s/.test(email)) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}
