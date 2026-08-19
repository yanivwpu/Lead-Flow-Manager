/**
 * Canonical monthly usage period.
 * Prefer an active Stripe/Shopify billing window; otherwise UTC calendar month.
 * Shared by conversation quota and Prospect AI discovery quota.
 */

export type UsagePeriodSource = "billing_period" | "utc_month";

export type ResolvedUsagePeriod = {
  periodStart: Date;
  periodEnd: Date;
  source: UsagePeriodSource;
};

export function startOfUtcMonth(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

export function startOfNextUtcMonth(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

function asValidDate(value: Date | null | undefined): Date | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return value;
}

/**
 * Pure period resolver. When Stripe/Shopify currentPeriodStart+End are both
 * present and `now` is still inside that window, use the billing cycle.
 * Otherwise use the UTC calendar month (no Stripe subscription required).
 */
export function resolveUsagePeriodFromDates(
  currentPeriodStart: Date | null | undefined,
  currentPeriodEnd: Date | null | undefined,
  now = new Date(),
): ResolvedUsagePeriod {
  const start = asValidDate(currentPeriodStart ?? null);
  const end = asValidDate(currentPeriodEnd ?? null);
  if (start && end && now <= end) {
    return { periodStart: start, periodEnd: end, source: "billing_period" };
  }
  const utcStart = startOfUtcMonth(now);
  return {
    periodStart: utcStart,
    periodEnd: startOfNextUtcMonth(now),
    source: "utc_month",
  };
}
