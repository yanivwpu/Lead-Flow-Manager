/**
 * AI Brain access: included with effective Pro (paid or 14-day trial).
 * Free after trial never receives Brain from a stale Shopify/Stripe add-on flag.
 * Grandfathered Starter may still have a live Stripe/Shopify add-on.
 */

import type { SubscriptionPlan, User } from "./schema";
import { getEffectivePlanForUser, isProAiTrialActive } from "./trialEntitlements";

export type AIBrainSource = "none" | "pro" | "trial" | "stripe" | "shopify" | "manual" | "admin";

export type AIBrainEntitlementInput = Pick<
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
  | "shopifyAIBrainEnabled"
  | "aiBrainEntitlementOverrideEnabled"
  | "aiBrainEntitlementOverrideGrant"
  | "email"
>;

export function planIncludesAIBrain(effectivePlan: SubscriptionPlan): boolean {
  return effectivePlan === "pro";
}

export function growthEngineEligibleForPlan(effectivePlan: SubscriptionPlan): boolean {
  return effectivePlan === "pro";
}

/**
 * Pure entitlement (no Stripe I/O).
 * `liveStripeAddon` is only consulted for grandfathered Starter accounts.
 */
export function resolveAIBrainAccess(
  user: AIBrainEntitlementInput,
  opts?: {
    now?: Date;
    liveStripeAddon?: boolean;
    manualEmailGrant?: boolean;
    ghlMarketplaceProActive?: boolean;
  },
): { hasAIBrain: boolean; source: AIBrainSource } {
  const now = opts?.now ?? new Date();
  const paidOpts = { ghlMarketplaceProActive: opts?.ghlMarketplaceProActive };

  if (user.aiBrainEntitlementOverrideEnabled) {
    return {
      hasAIBrain: !!user.aiBrainEntitlementOverrideGrant,
      source: user.aiBrainEntitlementOverrideGrant ? "admin" : "none",
    };
  }

  if (opts?.manualEmailGrant) {
    return { hasAIBrain: true, source: "manual" };
  }

  const effectivePlan = getEffectivePlanForUser(user, now, paidOpts);

  if (effectivePlan === "pro") {
    if (isProAiTrialActive(user, now, paidOpts)) {
      return { hasAIBrain: true, source: "trial" };
    }
    return { hasAIBrain: true, source: "pro" };
  }

  if (effectivePlan === "free") {
    return { hasAIBrain: false, source: "none" };
  }

  // Grandfathered Starter: live add-on only — never a sticky flag on Free.
  if (effectivePlan === "starter") {
    if (opts?.liveStripeAddon) {
      return { hasAIBrain: true, source: "stripe" };
    }
    if (!!user.shopifyShop && !!user.shopifyAIBrainEnabled) {
      return { hasAIBrain: true, source: "shopify" };
    }
  }

  return { hasAIBrain: false, source: "none" };
}
