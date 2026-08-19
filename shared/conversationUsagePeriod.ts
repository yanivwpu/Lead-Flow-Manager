import {
  resolveUsagePeriodFromDates,
  type ResolvedUsagePeriod,
} from "./usagePeriod";

export {
  resolveUsagePeriodFromDates,
  startOfNextUtcMonth,
  startOfUtcMonth,
} from "./usagePeriod";
export type { ResolvedUsagePeriod, UsagePeriodSource } from "./usagePeriod";

/**
 * Decide whether the monthly conversation *counter* should reset.
 * Does not delete conversation or message rows — only the usage allowance.
 *
 * Rules:
 * - New UTC month / new billing period → reset to 0.
 * - First stamp of a period (stored start missing): keep the counter unless
 *   the user is already over the *current* effective limit. That unblocks
 *   trial-only Free accounts that used ≥50 during trial and had no Stripe
 *   currentPeriodEnd (previously stuck forever).
 */
export function nextConversationUsageAfterPeriodCheck(input: {
  storedPeriodStart: Date | null | undefined;
  canonicalPeriodStart: Date;
  conversationsUsed: number;
  conversationsLimit: number;
}): {
  conversationsUsed: number;
  persistPeriodStart: boolean;
  resetCounter: boolean;
} {
  const used = Math.max(0, input.conversationsUsed || 0);
  const stored =
    input.storedPeriodStart instanceof Date && !Number.isNaN(input.storedPeriodStart.getTime())
      ? input.storedPeriodStart
      : null;

  if (!stored) {
    const overLimit = used >= input.conversationsLimit;
    return {
      conversationsUsed: overLimit ? 0 : used,
      persistPeriodStart: true,
      resetCounter: overLimit,
    };
  }

  if (stored.getTime() < input.canonicalPeriodStart.getTime()) {
    return { conversationsUsed: 0, persistPeriodStart: true, resetCounter: true };
  }

  return { conversationsUsed: used, persistPeriodStart: false, resetCounter: false };
}

/** Fresh Free monthly period after Pro+AI trial expiry (same UTC month is OK). */
export function trialExpiryConversationUsageReset(now = new Date()): {
  monthlyConversations: number;
  conversationUsagePeriodStart: Date;
} {
  const period = resolveUsagePeriodFromDates(null, null, now);
  return {
    monthlyConversations: 0,
    conversationUsagePeriodStart: period.periodStart,
  };
}
