/** Fields used to decide Shopify Admin launch → pricing vs app workspace (shared client/server). */
export type ShopifyLaunchBillingUser = {
  shopifyShop?: string | null;
  shopifySubscriptionStatus?: string | null;
};

/**
 * True when the merchant must land on /pricing to complete Shopify Managed Pricing selection.
 * Active (or any non-pending) Shopify subscription state → workspace.
 */
export function shopifyMerchantNeedsPlanSelection(
  user: ShopifyLaunchBillingUser | null | undefined,
): boolean {
  if (!user?.shopifyShop) return false;
  const status = (user.shopifySubscriptionStatus || "").toLowerCase();
  return status === "pending";
}
