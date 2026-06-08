/** Shown in Sales Portal / Sales Admin earnings copy. */
export const SALES_PAYOUT_REVIEW_NOTE =
  "Payouts are tracked automatically and reviewed before payment.";

export type ConversionPayoutRow = {
  salespersonId?: string;
  amount: string;
  paid?: boolean;
  payoutEligible?: boolean;
};

export function sumEligibleConversionAmount(conversions: ConversionPayoutRow[]): number {
  return conversions
    .filter((c) => c.payoutEligible !== false)
    .reduce((sum, c) => sum + parseFloat(c.amount || "0"), 0);
}

export function sumPaidConversionAmount(conversions: ConversionPayoutRow[]): number {
  return conversions
    .filter((c) => c.paid && c.payoutEligible !== false)
    .reduce((sum, c) => sum + parseFloat(c.amount || "0"), 0);
}

export function sumUnpaidConversionAmount(conversions: ConversionPayoutRow[]): number {
  return sumEligibleConversionAmount(conversions) - sumPaidConversionAmount(conversions);
}

export function filterConversionsForSalesperson(
  conversions: ConversionPayoutRow[],
  salespersonId: string,
): ConversionPayoutRow[] {
  return conversions.filter((c) => c.salespersonId === salespersonId);
}

/** Demo conversions + GE setup. GE setup has no paid flag — unpaid includes all GE earnings. */
export function computeAggregatePayoutTotals(
  conversions: ConversionPayoutRow[],
  setupEarned: number,
): {
  conversionEarned: number;
  conversionPaid: number;
  conversionUnpaid: number;
  setupEarned: number;
  earned: number;
  paid: number;
  unpaid: number;
} {
  const conversionEarned = sumEligibleConversionAmount(conversions);
  const conversionPaid = sumPaidConversionAmount(conversions);
  const conversionUnpaid = conversionEarned - conversionPaid;
  const earned = conversionEarned + setupEarned;
  const paid = conversionPaid;
  const unpaid = earned - paid;
  return {
    conversionEarned,
    conversionPaid,
    conversionUnpaid,
    setupEarned,
    earned,
    paid,
    unpaid,
  };
}

export function computeSalespersonPayoutTotals(
  conversions: ConversionPayoutRow[],
  salespersonId: string,
  setupEarned: number,
) {
  return computeAggregatePayoutTotals(
    filterConversionsForSalesperson(conversions, salespersonId),
    setupEarned,
  );
}
