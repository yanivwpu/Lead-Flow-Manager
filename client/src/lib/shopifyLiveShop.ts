import { normalizeShopifyShopDomain } from "@shared/shopifyBilling";

type BillingSubscriptionFlags = {
  isShopify?: boolean;
  upgradeProvider?: "shopify" | "stripe";
};

/** Live `?shop=` only — does not read or write leftover localStorage. */
export function getLiveShopifyShopFromSearch(
  search = typeof window !== "undefined" ? window.location.search : "",
): string | undefined {
  try {
    const fromUrl = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("shop");
    const normalized = fromUrl ? normalizeShopifyShopDomain(fromUrl) : null;
    return normalized ?? undefined;
  } catch {
    return undefined;
  }
}

/** Subscription fetch for Pricing Stripe vs Shopify routing — leftover localStorage must not force Shopify. */
export function getPricingSubscriptionApiUrl(
  search = typeof window !== "undefined" ? window.location.search : "",
): string {
  const live = getLiveShopifyShopFromSearch(search);
  return live ? `/api/subscription?shop=${encodeURIComponent(live)}` : "/api/subscription";
}

/**
 * Block Stripe plan checkout only for real Shopify billing or a live `?shop=` param.
 * Leftover localStorage `shopify_shop` must not skip web Stripe resume.
 */
export function isShopifyPlanCheckoutBlocked(
  subscription: BillingSubscriptionFlags | null | undefined,
  search?: string,
): boolean {
  if (subscription?.upgradeProvider === "shopify") return true;
  if (subscription?.isShopify) return true;
  return !!getLiveShopifyShopFromSearch(search);
}
