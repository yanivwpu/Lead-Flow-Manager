import {
  SALES_CONVERSION_ATTRIBUTION_DAYS,
  SALES_CONVERSION_PAYOUT_DOLLARS,
} from "./salesCompensation";

/** One-line payout summary for emails and notifications. */
export const SALESPERSON_PAYOUT_POLICY_SHORT = `$${SALES_CONVERSION_PAYOUT_DOLLARS} one-time payout when your demo lead becomes a paying Starter or Pro subscriber (free plans do not qualify).`;

/** Fuller payout description for welcome email and help text. */
export const SALESPERSON_PAYOUT_POLICY_DESCRIPTION = `$${SALES_CONVERSION_PAYOUT_DOLLARS} one-time payout when a demo lead you conducted becomes a paying Starter or Pro subscriber within ${SALES_CONVERSION_ATTRIBUTION_DAYS} days of the demo date. Free plan signups do not qualify. Demo completion alone does not create a payout. There are no recurring subscription commissions for internal salespeople.`;

export const SALESPERSON_GE_SETUP_PAYOUT_NOTE =
  "Growth Engine setup/onboarding sessions pay a fixed amount per completed session (default $50, or a custom task rate if configured).";

export function buildSalesPortalPayoutPolicyText(setupPayoutDollars = 50): string {
  return `WhachatCRM Sales Portal payout policy

Demo conversion payouts:
- $${SALES_CONVERSION_PAYOUT_DOLLARS} when your demo lead becomes a paying Starter or Pro subscriber.
- Free plan signups do not qualify.
- Demo completion alone does not create a payout.
- No recurring subscription commissions.

Growth Engine setup payouts:
- $${setupPayoutDollars} per completed setup/onboarding session.

Payouts are tracked automatically and reviewed before payment.`;
}
