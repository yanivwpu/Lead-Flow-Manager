import type { SubscriptionPlan } from "./schema";

/** Fields used for Shopify Admin launch → pricing vs workspace (aligned with /api/subscription). */
export type ShopifyLaunchBillingUser = {
  shopifyShop?: string | null;
  shopifySubscriptionStatus?: string | null;
  shopifyAccessToken?: string | null;
  shopifyInstalledAt?: Date | string | null;
  trialEndsAt?: Date | string | null;
  trialStatus?: string | null;
  trialPlan?: string | null;
  billingPlan?: string | null;
  subscriptionStatus?: string | null;
  subscriptionPlan?: string | null;
  planOverrideEnabled?: boolean | null;
  planOverride?: string | null;
};

export type ShopifyLaunchRoutingOptions = {
  /** OAuth callback just sent merchant to pricing (?shopify_installed=1). */
  isFreshInstallRedirect?: boolean;
};

function hasActivePaidPlan(
  user: ShopifyLaunchBillingUser,
  now: Date = new Date(),
): boolean {
  if (user.planOverrideEnabled && user.planOverride && user.planOverride !== "free") {
    return true;
  }
  const bp = (user.billingPlan || "free") as SubscriptionPlan;
  const st = (user.subscriptionStatus || "").toLowerCase();
  if (bp !== "free" && (st === "active" || st === "trialing")) {
    return true;
  }
  if (
    user.shopifyShop &&
    (user.shopifySubscriptionStatus || "").toLowerCase() === "active" &&
    bp !== "free"
  ) {
    return true;
  }
  return false;
}

function isProAiTrialActive(
  user: ShopifyLaunchBillingUser,
  now: Date = new Date(),
): boolean {
  if (hasActivePaidPlan(user, now)) return false;
  if (!user.trialEndsAt || new Date(user.trialEndsAt) <= now) return false;
  if (user.trialStatus === "expired") return false;
  return (user.trialPlan || "pro_ai") === "pro_ai";
}

function hasLegacyTrialWindow(user: ShopifyLaunchBillingUser, now: Date = new Date()): boolean {
  if (!user.trialEndsAt || new Date(user.trialEndsAt) <= now) return false;
  if (user.trialStatus === "expired") return false;
  return true;
}

/**
 * Merchant can use the app workspace (matches effective trial/paid access from /api/subscription).
 * Does not require shopifySubscriptionStatus === 'active'.
 */
export function shopifyMerchantHasUsableAppAccess(
  user: ShopifyLaunchBillingUser | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!user?.shopifyShop) return false;

  const shopifyStatus = (user.shopifySubscriptionStatus || "").toLowerCase();
  if (shopifyStatus === "active") return true;

  if (hasActivePaidPlan(user, now)) return true;
  if (isProAiTrialActive(user, now)) return true;
  if (hasLegacyTrialWindow(user, now)) return true;

  const st = (user.subscriptionStatus || "").toLowerCase();
  if (st === "active" || st === "trialing") {
    const bp = (user.billingPlan || "free") as SubscriptionPlan;
    if (bp !== "free") return true;
  }

  return false;
}

/**
 * True when merchant must land on /pricing for Shopify Managed Pricing selection.
 */
export function shopifyMerchantNeedsPlanSelection(
  user: ShopifyLaunchBillingUser | null | undefined,
  options: ShopifyLaunchRoutingOptions = {},
): boolean {
  if (!user?.shopifyShop) return false;

  if (options.isFreshInstallRedirect) return true;

  const shopifyStatus = (user.shopifySubscriptionStatus || "").toLowerCase();
  if (shopifyStatus === "active") return false;

  if (shopifyMerchantHasUsableAppAccess(user)) return false;

  return shopifyStatus === "pending" || shopifyStatus === "";
}

/** First OAuth token exchange for this shop user (not a returning reconnect). */
export function shopifyMerchantIsFirstTokenInstall(
  user: ShopifyLaunchBillingUser | null | undefined,
): boolean {
  return !user?.shopifyAccessToken;
}
