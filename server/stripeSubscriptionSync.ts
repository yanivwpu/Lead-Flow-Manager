/**
 * Map Stripe subscription payloads to local user billing fields.
 * Does not grant AI Brain (Pro includes Brain). Does not write shopifyAIBrainEnabled.
 */

import { entitlementPlanFromStripePriceIds } from "./stripePlanPriceIds";

const TERMINAL_STRIPE_STATUSES = new Set([
  "canceled",
  "unpaid",
  "incomplete_expired",
]);

export type StripeSubscriptionSyncInput = {
  status?: string | null;
  cancelAtPeriodEnd?: boolean;
  priceIds: string[];
  currentPeriodStartSec?: number;
  currentPeriodEndSec?: number;
  subscriptionId?: string | null;
  env?: NodeJS.Dict<string | undefined>;
};

export type StripeSubscriptionUserUpdates = {
  stripeSubscriptionId?: string;
  subscriptionStatus: string;
  billingPlan?: "free" | "starter" | "pro";
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
};

export function isTerminalStripeSubscriptionStatus(status: string | null | undefined): boolean {
  return TERMINAL_STRIPE_STATUSES.has((status || "").toLowerCase());
}

/**
 * Local plan follows Stripe confirmation only.
 * cancel_at_period_end with status still active keeps the paid plan until Stripe
 * reports a terminal status (typically customer.subscription.deleted / canceled).
 */
export function buildUserUpdatesFromStripeSubscription(
  input: StripeSubscriptionSyncInput,
): StripeSubscriptionUserUpdates {
  const status = (input.status || "active").toLowerCase();
  const terminal = isTerminalStripeSubscriptionStatus(status);

  const updates: StripeSubscriptionUserUpdates = {
    subscriptionStatus: terminal ? "canceled" : status,
  };

  if (input.subscriptionId) {
    updates.stripeSubscriptionId = input.subscriptionId;
  }
  if (input.currentPeriodStartSec) {
    updates.currentPeriodStart = new Date(input.currentPeriodStartSec * 1000);
  }
  if (input.currentPeriodEndSec) {
    updates.currentPeriodEnd = new Date(input.currentPeriodEndSec * 1000);
  }

  if (terminal) {
    updates.billingPlan = "free";
    return updates;
  }

  const billingPlan = entitlementPlanFromStripePriceIds(input.priceIds, input.env);
  if (billingPlan) {
    updates.billingPlan = billingPlan;
  }

  return updates;
}
