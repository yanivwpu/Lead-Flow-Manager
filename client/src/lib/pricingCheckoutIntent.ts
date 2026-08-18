/**
 * Preserve Starter/Pro + monthly/yearly checkout intent across /auth?redirect=.
 * Server still maps plan/interval to Stripe Price IDs — never accept Price IDs from the URL.
 */

export type PricingCheckoutPlan = "starter" | "pro";
export type PricingCheckoutInterval = "monthly" | "yearly";

export const PRICING_CHECKOUT_QUERY = "checkout";
export const PRICING_BILLING_QUERY = "billing";

export type PricingCheckoutIntent = {
  plan: PricingCheckoutPlan;
  billingInterval: PricingCheckoutInterval;
};

export function parsePricingCheckoutPlan(raw: unknown): PricingCheckoutPlan | null {
  return raw === "starter" || raw === "pro" ? raw : null;
}

export function parsePricingBillingInterval(raw: unknown): PricingCheckoutInterval | null {
  return raw === "monthly" || raw === "yearly" ? raw : null;
}

function searchParamsFrom(search: string): URLSearchParams {
  const trimmed = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(trimmed);
}

/** Requires both a known plan and a known interval. Malformed or partial query is ignored. */
export function parsePricingCheckoutIntent(search: string): PricingCheckoutIntent | null {
  const params = searchParamsFrom(search);
  const plan = parsePricingCheckoutPlan(params.get(PRICING_CHECKOUT_QUERY));
  const billingInterval = parsePricingBillingInterval(params.get(PRICING_BILLING_QUERY));
  if (!plan || !billingInterval) return null;
  return { plan, billingInterval };
}

export function billingIntervalFromSearch(search: string): PricingCheckoutInterval | null {
  return parsePricingBillingInterval(searchParamsFrom(search).get(PRICING_BILLING_QUERY));
}

export function buildPricingCheckoutIntentSearch(opts: {
  plan: PricingCheckoutPlan;
  billingInterval: PricingCheckoutInterval;
  existingSearch?: string;
}): string {
  const params = searchParamsFrom(opts.existingSearch || "");
  params.set(PRICING_CHECKOUT_QUERY, opts.plan);
  params.set(PRICING_BILLING_QUERY, opts.billingInterval);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Drop `checkout` so cancel/refresh cannot auto-launch Stripe again. Keep `billing` for the toggle. */
export function stripPricingCheckoutParam(pathWithSearch: string): string {
  const hashIdx = pathWithSearch.indexOf("#");
  const hash = hashIdx >= 0 ? pathWithSearch.slice(hashIdx) : "";
  const withoutHash = hashIdx >= 0 ? pathWithSearch.slice(0, hashIdx) : pathWithSearch;
  const qIdx = withoutHash.indexOf("?");
  const pathname = qIdx >= 0 ? withoutHash.slice(0, qIdx) : withoutHash;
  const search = qIdx >= 0 ? withoutHash.slice(qIdx) : "";
  const params = searchParamsFrom(search);
  params.delete(PRICING_CHECKOUT_QUERY);
  const qs = params.toString();
  return `${pathname}${qs ? `?${qs}` : ""}${hash}`;
}

export function buildPricingAuthRedirect(opts: {
  pricingPath: string;
  plan: PricingCheckoutPlan;
  billingInterval: PricingCheckoutInterval;
}): string {
  const [pathPart, existingSearch = ""] = opts.pricingPath.split("?");
  const search = buildPricingCheckoutIntentSearch({
    plan: opts.plan,
    billingInterval: opts.billingInterval,
    existingSearch,
  });
  const dest = `${pathPart || "/pricing"}${search}`;
  return `/auth?redirect=${encodeURIComponent(dest)}`;
}

export function shouldResumePricingCheckout(opts: {
  hasUser: boolean;
  authLoading: boolean;
  subscriptionResolved: boolean;
  isShopify: boolean;
  billingPlan: "free" | "starter" | "pro";
  isActiveProAiTrial: boolean;
  intent: PricingCheckoutIntent | null;
}): boolean {
  if (opts.authLoading || !opts.hasUser || !opts.subscriptionResolved) return false;
  if (opts.isShopify) return false;
  if (!opts.intent) return false;
  if (opts.billingPlan === opts.intent.plan && !opts.isActiveProAiTrial) return false;
  return true;
}
