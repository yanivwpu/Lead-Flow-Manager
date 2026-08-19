/**
 * Day 14 Pro + AI Brain trial-expiration email.
 * Independent of Day 5/10 channel-activation flags.
 *
 * Source of truth matches product entitlements:
 * trialEndsAt wall-clock + isProAiTrialActive / getEffectivePlanForUser / hasActivePaidPlan.
 */
import type { User } from "./schema";
import { isExcludedFromActivationEmails } from "./activationEmailEligibility";
import {
  getEffectivePlanForUser,
  hadProAiBrainTrial,
  hasActivePaidPlan,
  isProAiTrialActive,
} from "./trialEntitlements";

export type TrialExpirationEmailDecision =
  | { send: true }
  | { send: false; reason: TrialExpirationEmailSkipReason };

export type TrialExpirationEmailSkipReason =
  | "already_sent"
  | "trial_still_active"
  | "never_had_pro_ai_trial"
  | "paid_or_override"
  | "not_on_free"
  | "ai_brain_override_grant"
  | "shopify_managed"
  | "excluded_email"
  | "deletion_requested";

export type TrialExpirationEmailUser = Pick<
  User,
  | "email"
  | "deletionRequestedAt"
  | "shopifyShop"
  | "trialEndsAt"
  | "trialStatus"
  | "trialPlan"
  | "trialExpirationEmailSentAt"
  | "planOverrideEnabled"
  | "planOverride"
  | "billingPlan"
  | "subscriptionStatus"
  | "shopifySubscriptionStatus"
  | "aiBrainEntitlementOverrideEnabled"
  | "aiBrainEntitlementOverrideGrant"
>;

/**
 * Send only after the Pro + AI Brain trial has actually expired and the
 * account falls back to Free without retaining paid Pro/AI Brain service.
 *
 * Shopify-managed accounts are excluded in this pass (separate billing lifecycle).
 */
export function shouldSendTrialExpirationEmail(
  user: TrialExpirationEmailUser,
  now: Date = new Date(),
): TrialExpirationEmailDecision {
  if (user.trialExpirationEmailSentAt) {
    return { send: false, reason: "already_sent" };
  }
  if (user.deletionRequestedAt) {
    return { send: false, reason: "deletion_requested" };
  }
  if (!user.email || isExcludedFromActivationEmails(user.email)) {
    return { send: false, reason: "excluded_email" };
  }
  if (user.shopifyShop) {
    return { send: false, reason: "shopify_managed" };
  }
  if (!hadProAiBrainTrial(user)) {
    return { send: false, reason: "never_had_pro_ai_trial" };
  }
  if (hasActivePaidPlan(user, now)) {
    return { send: false, reason: "paid_or_override" };
  }
  if (user.aiBrainEntitlementOverrideEnabled && user.aiBrainEntitlementOverrideGrant) {
    return { send: false, reason: "ai_brain_override_grant" };
  }
  // Never send before the (possibly extended) trialEndsAt wall-clock.
  if (!user.trialEndsAt || new Date(user.trialEndsAt) > now || isProAiTrialActive(user, now)) {
    return { send: false, reason: "trial_still_active" };
  }
  if (getEffectivePlanForUser(user, now) !== "free") {
    return { send: false, reason: "not_on_free" };
  }
  return { send: true };
}
