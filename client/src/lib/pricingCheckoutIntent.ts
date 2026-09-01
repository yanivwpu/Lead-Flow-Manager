/**
 * Preserve Starter/Pro + monthly/yearly checkout intent across /auth?redirect=.
 * Server still maps plan/interval to Stripe Price IDs — never accept Price IDs from the URL.
 *
 * URL is the source of truth. sessionStorage is a same-origin backup if the query is dropped.
 */

export const PRICING_CHECKOUT_INTENT_STORAGE_KEY = "whachatcrm_pricing_checkout_intent";
export const PRICING_CHECKOUT_RESUME_STARTED_KEY = "whachatcrm_pricing_checkout_resume_started";
const INTENT_TTL_MS = 30 * 60 * 1000;

export type IntentStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

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

export function parseAuthRedirectDestination(authHref: string): string | null {
  const qIdx = authHref.indexOf("?");
  if (qIdx < 0) return null;
  return new URLSearchParams(authHref.slice(qIdx + 1)).get("redirect");
}

function defaultIntentStore(): IntentStore | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

export function persistPricingCheckoutIntent(
  intent: PricingCheckoutIntent,
  store: IntentStore | null = defaultIntentStore(),
): void {
  if (!store) return;
  try {
    store.setItem(
      PRICING_CHECKOUT_INTENT_STORAGE_KEY,
      JSON.stringify({ ...intent, savedAt: Date.now() }),
    );
  } catch {
    /* private mode / quota */
  }
}

export function readPersistedPricingCheckoutIntent(
  store: IntentStore | null = defaultIntentStore(),
  now = Date.now(),
): PricingCheckoutIntent | null {
  if (!store) return null;
  try {
    const raw = store.getItem(PRICING_CHECKOUT_INTENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      plan?: unknown;
      billingInterval?: unknown;
      savedAt?: unknown;
    };
    const plan = parsePricingCheckoutPlan(parsed.plan);
    const billingInterval = parsePricingBillingInterval(parsed.billingInterval);
    const savedAt = typeof parsed.savedAt === "number" ? parsed.savedAt : 0;
    if (!plan || !billingInterval) {
      store.removeItem(PRICING_CHECKOUT_INTENT_STORAGE_KEY);
      return null;
    }
    if (!savedAt || now - savedAt > INTENT_TTL_MS) {
      store.removeItem(PRICING_CHECKOUT_INTENT_STORAGE_KEY);
      return null;
    }
    return { plan, billingInterval };
  } catch {
    return null;
  }
}

export function clearPersistedPricingCheckoutIntent(
  store: IntentStore | null = defaultIntentStore(),
): void {
  if (!store) return;
  try {
    store.removeItem(PRICING_CHECKOUT_INTENT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function markPricingCheckoutResumeStarted(
  store: IntentStore | null = defaultIntentStore(),
): void {
  if (!store) return;
  try {
    store.setItem(PRICING_CHECKOUT_RESUME_STARTED_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function hasPricingCheckoutResumeStarted(
  store: IntentStore | null = defaultIntentStore(),
): boolean {
  if (!store) return false;
  try {
    return !!store.getItem(PRICING_CHECKOUT_RESUME_STARTED_KEY);
  } catch {
    return false;
  }
}

export function clearPricingCheckoutResumeStarted(
  store: IntentStore | null = defaultIntentStore(),
): void {
  if (!store) return;
  try {
    store.removeItem(PRICING_CHECKOUT_RESUME_STARTED_KEY);
  } catch {
    /* ignore */
  }
}

/** Prefer live URL params; fall back to same-origin sessionStorage. */
export function resolvePricingCheckoutIntent(
  search: string,
  store: IntentStore | null = defaultIntentStore(),
): PricingCheckoutIntent | null {
  return parsePricingCheckoutIntent(search) ?? readPersistedPricingCheckoutIntent(store);
}

export function consumePricingCheckoutIntentFromLocation(
  pathWithSearch: string,
  store: IntentStore | null = defaultIntentStore(),
): string {
  clearPersistedPricingCheckoutIntent(store);
  clearPricingCheckoutResumeStarted(store);
  return stripPricingCheckoutParam(pathWithSearch);
}

export function shouldResumePricingCheckout(opts: {
  hasUser: boolean;
  authLoading: boolean;
  subscriptionResolved: boolean;
  isShopify: boolean;
  billingPlan: "free" | "starter" | "pro";
  isActiveProAiTrial: boolean;
  intent: PricingCheckoutIntent | null;
  canStartInternalTrial?: boolean;
}): boolean {
  if (opts.authLoading || !opts.hasUser || !opts.subscriptionResolved) return false;
  if (opts.isShopify) return false;
  if (opts.canStartInternalTrial) return false;
  if (!opts.intent) return false;
  if (opts.intent.plan === "starter") return false;
  if (opts.billingPlan === opts.intent.plan && !opts.isActiveProAiTrial) return false;
  return true;
}

/** After login, eligible Free users activate the internal trial instead of Stripe. */
export function shouldStartInternalTrialAfterLogin(opts: {
  hasUser: boolean;
  authLoading: boolean;
  subscriptionResolved: boolean;
  isShopify: boolean;
  canStartInternalTrial: boolean;
  intent: PricingCheckoutIntent | null;
}): boolean {
  if (opts.authLoading || !opts.hasUser || !opts.subscriptionResolved) return false;
  if (opts.isShopify) return false;
  if (!opts.canStartInternalTrial) return false;
  if (!opts.intent || opts.intent.plan !== "pro") return false;
  return true;
}
