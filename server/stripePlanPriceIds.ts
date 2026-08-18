/**
 * Stripe Price ID env mapping for Starter/Pro.
 * Yearly and monthly prices resolve to the same entitlement plan.
 * AI Brain is monthly-only — there is no yearly env key.
 */

export type StripePaidPlan = "starter" | "pro";
export type StripeBillingInterval = "monthly" | "yearly";

export const STRIPE_PLAN_PRICE_ENV = {
  starter: {
    monthly: "STRIPE_STARTER_MONTHLY_PRICE_ID",
    yearly: "STRIPE_STARTER_YEARLY_PRICE_ID",
  },
  pro: {
    monthly: "STRIPE_PRO_MONTHLY_PRICE_ID",
    yearly: "STRIPE_PRO_YEARLY_PRICE_ID",
  },
} as const;

export const STRIPE_AI_BRAIN_MONTHLY_PRICE_ENV = "STRIPE_AI_BRAIN_MONTHLY_PRICE_ID";

export function stripePriceEnvForPlan(
  plan: StripePaidPlan,
  interval: StripeBillingInterval,
): string {
  return STRIPE_PLAN_PRICE_ENV[plan][interval];
}

export function resolveStripePlanPriceId(
  plan: StripePaidPlan,
  interval: StripeBillingInterval,
  env: NodeJS.Dict<string | undefined> = process.env,
): string | undefined {
  const raw = env[stripePriceEnvForPlan(plan, interval)];
  const id = typeof raw === "string" ? raw.trim() : "";
  return id || undefined;
}

/** Prefer Pro if a subscription somehow includes both plan prices. */
export function entitlementPlanFromStripePriceIds(
  priceIds: string[],
  env: NodeJS.Dict<string | undefined> = process.env,
): "starter" | "pro" | undefined {
  const proMonthly = env.STRIPE_PRO_MONTHLY_PRICE_ID;
  const proYearly = env.STRIPE_PRO_YEARLY_PRICE_ID;
  const starterMonthly = env.STRIPE_STARTER_MONTHLY_PRICE_ID;
  const starterYearly = env.STRIPE_STARTER_YEARLY_PRICE_ID;

  if ((proMonthly && priceIds.includes(proMonthly)) || (proYearly && priceIds.includes(proYearly))) {
    return "pro";
  }
  if (
    (starterMonthly && priceIds.includes(starterMonthly)) ||
    (starterYearly && priceIds.includes(starterYearly))
  ) {
    return "starter";
  }
  return undefined;
}
