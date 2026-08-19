import type { SubscriptionPlan, User } from "./schema";

export type TrialStatus = "none" | "active" | "expired";

/** True when the user has an active paid subscription (Stripe or Shopify) that defines billing plan. */
export function hasActivePaidPlan(
  user: Pick<
    User,
    | "planOverrideEnabled"
    | "planOverride"
    | "billingPlan"
    | "subscriptionStatus"
    | "shopifyShop"
    | "shopifySubscriptionStatus"
  >,
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
): boolean {
  if (hasActivePaidPlan(user, now)) return false;
  if (!user.trialEndsAt || new Date(user.trialEndsAt) <= now) return false;
  if (user.trialStatus === "expired") return false;
  const plan = user.trialPlan || "pro_ai";
  return plan === "pro_ai";
}

/**
 * Effective subscription tier for limits/features.
 * Order: admin override → paid billing → Pro + AI trial → free.
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
): SubscriptionPlan {
  const overrideEnabled = !!user.planOverrideEnabled;
  const overridePlan = (user.planOverride || "free") as SubscriptionPlan;
  if (overrideEnabled) return overridePlan;

  if (hasActivePaidPlan(user, now)) {
    return (user.billingPlan || "free") as SubscriptionPlan;
  }

  if (isProAiTrialActive(user, now)) {
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
