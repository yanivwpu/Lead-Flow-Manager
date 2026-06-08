/** @deprecated Legacy window for pre-2026 recurring subscription commission rows; new salespeople earn one-time demo conversion payouts only. */
export const SALESPERSON_SUBSCRIPTION_COMMISSION_MONTHS = 12;

export function salespersonSubscriptionCommissionEndsAt(conversionCreatedAt: Date): Date {
  const end = new Date(conversionCreatedAt);
  end.setMonth(end.getMonth() + SALESPERSON_SUBSCRIPTION_COMMISSION_MONTHS);
  return end;
}

export function isSalespersonSubscriptionCommissionActiveAt(
  conversionCreatedAt: Date,
  at: Date = new Date(),
): boolean {
  return at <= salespersonSubscriptionCommissionEndsAt(conversionCreatedAt);
}
