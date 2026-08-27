/** Shared Shopify shop domain validation (client + server). */
export const SHOPIFY_SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

/**
 * Canonical Shopify shop hostname: lowercase `{slug}.myshopify.com`.
 * Strips protocol, credentials, path, query, hash, and port. Rejects custom domains.
 */
export function normalizeShopifyShopDomain(shop: string | null | undefined): string | null {
  if (!shop || typeof shop !== "string") return null;
  let s = shop.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, "");
  const at = s.lastIndexOf("@");
  if (at >= 0) s = s.slice(at + 1);
  s = s.split("/")[0]?.split("?")[0]?.split("#")[0] ?? "";
  s = s.replace(/:\d+$/, "");
  if (s.startsWith("www.")) s = s.slice(4);
  if (!s || !SHOPIFY_SHOP_DOMAIN_RE.test(s)) return null;
  return s;
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

/** Reverse of shopifySyntheticMerchantEmail — used only for ledger backfill of redacted shops. */
export function shopDomainFromShopifySyntheticEmail(email: string | null | undefined): string | null {
  if (!isShopifySyntheticMerchantEmail(email)) return null;
  const local = String(email).trim().toLowerCase().split("@")[0] ?? "";
  if (!local) return null;
  return normalizeShopifyShopDomain(`${local}.myshopify.com`);
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
