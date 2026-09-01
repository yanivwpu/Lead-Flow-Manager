import type { SubscriptionPlan, User } from "./schema";

export type TrialStatus = "none" | "active" | "expired";

/** Extra independently-active paid sources that are not stored on users.billingPlan. */
export type PaidSourceOptions = {
  ghlMarketplaceProActive?: boolean;
};

type PaidPlanUser = Pick<
  User,
  | "planOverrideEnabled"
  | "planOverride"
  | "billingPlan"
  | "subscriptionStatus"
  | "shopifyShop"
  | "shopifySubscriptionStatus"
>;

function stripeOrShopifyPaidPlan(user: PaidPlanUser): SubscriptionPlan | null {
  const bp = (user.billingPlan || "free") as SubscriptionPlan;
  const st = (user.subscriptionStatus || "").toLowerCase();
  if (bp !== "free" && (st === "active" || st === "trialing")) {
    return bp;
  }
  if (
    user.shopifyShop &&
    (user.shopifySubscriptionStatus || "").toLowerCase() === "active" &&
    bp !== "free"
  ) {
    return bp;
  }
  return null;
}

/** True when the user has an independently active paid source (admin override, Stripe, Shopify, or GHL Pro). */
export function hasActivePaidPlan(
  user: PaidPlanUser,
  now: Date = new Date(),
  opts?: PaidSourceOptions,
): boolean {
  void now;
  if (user.planOverrideEnabled && user.planOverride && user.planOverride !== "free") {
    return true;
  }
  if (opts?.ghlMarketplaceProActive) return true;
  return stripeOrShopifyPaidPlan(user) !== null;
}

export function computeTrialStatus(
  user: Pick<User, "trialEndsAt" | "trialStatus">,
  now: Date,
): TrialStatus {
  if (user.trialEndsAt && new Date(user.trialEndsAt) > now) return "active";
  if (user.trialEndsAt && new Date(user.trialEndsAt) <= now) return "expired";
  const persisted = user.trialStatus as TrialStatus | null | undefined;
  if (persisted === "expired") return "expired";
  return "none";
}

/** Pro + AI Brain bundle trial (trial_plan pro_ai), only while unpaid. */
export function isProAiTrialActive(
  user: Pick<
    User,
    | "trialEndsAt"
    | "trialStatus"
    | "trialPlan"
    | "planOverrideEnabled"
    | "planOverride"
    | "billingPlan"
    | "subscriptionStatus"
    | "shopifyShop"
    | "shopifySubscriptionStatus"
  >,
  now: Date = new Date(),
  opts?: PaidSourceOptions,
): boolean {
  if (hasActivePaidPlan(user, now, opts)) return false;
  if (!user.trialEndsAt || new Date(user.trialEndsAt) <= now) return false;
  if (user.trialStatus === "expired") return false;
  const plan = user.trialPlan || "pro_ai";
  return plan === "pro_ai";
}

/**
 * Effective subscription tier for limits/features.
 * Order: admin override → any independently active paid source (Stripe / Shopify / GHL Pro)
 * → Pro + AI trial → free.
 * GHL Pro never writes users.billingPlan; pass ghlMarketplaceProActive instead.
 */
export function getEffectivePlanForUser(
  user: Pick<
    User,
    | "trialEndsAt"
    | "trialStatus"
    | "trialPlan"
    | "planOverrideEnabled"
    | "planOverride"
    | "billingPlan"
    | "subscriptionStatus"
    | "shopifyShop"
    | "shopifySubscriptionStatus"
  >,
  now: Date = new Date(),
  opts?: PaidSourceOptions,
): SubscriptionPlan {
  const overrideEnabled = !!user.planOverrideEnabled;
  const overridePlan = (user.planOverride || "free") as SubscriptionPlan;
  if (overrideEnabled) return overridePlan;

  const cardPlan = stripeOrShopifyPaidPlan(user);
  if (opts?.ghlMarketplaceProActive) return "pro";
  if (cardPlan === "pro") return "pro";
  if (cardPlan && cardPlan !== "free") return cardPlan;

  if (isProAiTrialActive(user, now, opts)) {
    return "pro";
  }

  // Legacy rows: trial_ends_at in future but trial_plan unset (pre–pro_ai migration)
  if (user.trialEndsAt && new Date(user.trialEndsAt) > now && user.trialStatus !== "expired") {
    return "pro";
  }

  return "free";
}

/** True when this account was granted the Pro + AI Brain trial bundle. */
export function hadProAiBrainTrial(user: Pick<User, "trialEndsAt" | "trialPlan">): boolean {
  if (!user.trialEndsAt) return false;
  const plan = user.trialPlan || "pro_ai";
  return plan === "pro_ai";
}

/**
 * Whether the account may still receive the one-time WhachatCRM 14-day Pro trial.
 * Fail closed after any prior trial window (including expired trialEndsAt ≈ 2026-05-31).
 */
export function canStartInternalProAiTrial(
  user: Pick<
    User,
    | "trialEndsAt"
    | "trialStartedAt"
    | "trialStatus"
    | "trialPlan"
    | "planOverrideEnabled"
    | "planOverride"
    | "billingPlan"
    | "subscriptionStatus"
    | "shopifyShop"
    | "shopifySubscriptionStatus"
  >,
  now: Date = new Date(),
  opts?: PaidSourceOptions,
): boolean {
  if (hasActivePaidPlan(user, now, opts)) return false;
  if (user.shopifyShop) return false;
  if (isProAiTrialActive(user, now, opts)) return false;
  if (user.trialEndsAt) return false;
  if (user.trialStartedAt) return false;
  if (user.trialStatus === "expired" || user.trialStatus === "active") return false;
  return true;
}
