import { normalizeShopifyShopDomain } from "./shopifyBilling";

/** Shopify App Pricing (Managed Pricing) — merchants choose plans in Shopify Admin. */
export const SHOPIFY_MANAGED_PRICING_CODE = "SHOPIFY_MANAGED_PRICING";

export const DEFAULT_SHOPIFY_APP_HANDLE = "whachatcrm";

export const SHOPIFY_MANAGED_PRICING_INSTRUCTIONS =
  "Plan selection is managed by Shopify. Open WhachatCRM in Shopify Admin → Billing / App subscription to choose a plan.";

export function shopifyStoreHandleFromDomain(shop: string | null | undefined): string | null {
  const normalized = normalizeShopifyShopDomain(shop);
  if (!normalized) return null;
  return normalized.replace(/\.myshopify\.com$/i, "");
}

/**
 * Shopify-hosted plan selection page (App Pricing / Managed Pricing).
 * @see https://shopify.dev/docs/apps/launch/billing/shopify-app-pricing#plan-selection-page
 */
export function buildShopifyManagedPricingUrl(
  shop: string,
  appHandle: string = DEFAULT_SHOPIFY_APP_HANDLE,
): string | null {
  const storeHandle = shopifyStoreHandleFromDomain(shop);
  const handle = appHandle.trim().toLowerCase();
  if (!storeHandle || !handle) return null;
  return `https://admin.shopify.com/store/${encodeURIComponent(storeHandle)}/charges/${encodeURIComponent(handle)}/pricing_plans`;
}
