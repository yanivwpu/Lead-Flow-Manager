/** Months from `sales_conversions.created_at` during which Stripe subscription commissions are credited (policy). */
export const SALESPERSON_SUBSCRIPTION_COMMISSION_MONTHS = 12;

export function getSalespersonSubscriptionCommissionEndDate(conversionCreatedAt: Date): Date {
  const end = new Date(conversionCreatedAt.getTime());
  end.setMonth(end.getMonth() + SALESPERSON_SUBSCRIPTION_COMMISSION_MONTHS);
  return end;
}

/** True when `now` is on or before the end of the subscription-commission window (inclusive end instant). */
export function isSalespersonSubscriptionCommissionActiveAt(conversionCreatedAt: Date, now: Date): boolean {
  return now.getTime() <= getSalespersonSubscriptionCommissionEndDate(conversionCreatedAt).getTime();
}
