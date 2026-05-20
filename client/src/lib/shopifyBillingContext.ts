import { getShopifyShopHint } from "@/lib/shopifyBillingHint";

export type BillingSubscriptionFlags = {
  isShopify?: boolean;
  upgradeProvider?: "shopify" | "stripe";
};

/**
 * When true, all paid plan / add-on / upgrade actions must use Shopify App Pricing — never Stripe.
 * Includes API flags and persisted ?shop= hint (Shopify App Store / embedded review).
 */
export function mustUseShopifyBilling(
  subscription: BillingSubscriptionFlags | null | undefined,
  shopHint?: string | null,
): boolean {
  if (subscription?.upgradeProvider === "shopify") return true;
  if (subscription?.isShopify) return true;
  return !!shopHint;
}

export function useMustUseShopifyBilling(
  subscription: BillingSubscriptionFlags | null | undefined,
): boolean {
  return mustUseShopifyBilling(subscription, getShopifyShopHint());
}

export function isShopifyBillingRequiredError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  if (code === "SHOPIFY_BILLING_REQUIRED") return true;
  const message = (error as { message?: string }).message;
  return typeof message === "string" && message.toLowerCase().includes("billed through shopify");
}
