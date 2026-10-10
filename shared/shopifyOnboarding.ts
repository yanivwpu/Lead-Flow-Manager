import { isProAiTrialActive, shopifyMerchantHasUsableAppAccess, type ShopifyLaunchBillingUser } from "./shopifyLaunchRouting";

export type ShopifyOnboardingState = "trial_active" | "app_ready" | "plan_required" |
  "recovery_required" | "support_required" | "reconnect_required";
export type ShopifyOnboardingSnapshot = {
  state: ShopifyOnboardingState;
  trialEndsAt?: string;
};

/** Presentation only: never grants access or changes trial eligibility. */
export function resolveShopifyOnboardingState(
  user: ShopifyLaunchBillingUser | null | undefined,
  options: { ledgerReady: boolean; ledgerStatus: string | null; userEligible: boolean },
): ShopifyOnboardingSnapshot {
  if (!user?.shopifyShop || !user.shopifyAccessToken ||
      ["uninstalled", "cancelled", "canceled"].includes((user.shopifySubscriptionStatus || "").toLowerCase())) {
    return { state: "reconnect_required" };
  }
  if (isProAiTrialActive(user)) {
    return { state: "trial_active", trialEndsAt: new Date(user.trialEndsAt!).toISOString() };
  }
  if (shopifyMerchantHasUsableAppAccess(user)) return { state: "app_ready" };
  if (!options.ledgerReady) return { state: "recovery_required" };
  if (options.ledgerStatus?.startsWith("blocked_")) return { state: "support_required" };
  if (options.ledgerStatus || !options.userEligible) return { state: "plan_required" };
  return { state: "recovery_required" };
}

export function shopifyInstallDestination(
  state: ShopifyOnboardingState,
  firstTokenInstall: boolean,
): string {
  if (state === "trial_active") return firstTokenInstall ? "/shopify/start" : "/app/inbox";
  if (state === "app_ready") return "/app/inbox";
  if (state === "plan_required") return "/pricing";
  return "/shopify/start";
}

export const SHOPIFY_BROWSER_ACTIVATION_EVENTS = [
  "first_app_page_reached", "first_successful_render", "first_channel_setup",
] as const;
export type ShopifyBrowserActivationEvent = typeof SHOPIFY_BROWSER_ACTIVATION_EVENTS[number];
export const SHOPIFY_ACTIVATION_PAGES = ["start", "inbox", "integrations", "other"] as const;

/** No arbitrary URL, domain, email, message, user id, or error text accepted. */
export function parseShopifyActivationEvent(body: unknown): {
  event: ShopifyBrowserActivationEvent; page: typeof SHOPIFY_ACTIVATION_PAGES[number];
} | null {
  if (!body || typeof body !== "object") return null;
  const data = body as Record<string, unknown>;
  if (!SHOPIFY_BROWSER_ACTIVATION_EVENTS.includes(data.event as ShopifyBrowserActivationEvent) ||
      !SHOPIFY_ACTIVATION_PAGES.includes(data.page as typeof SHOPIFY_ACTIVATION_PAGES[number])) return null;
  return { event: data.event as ShopifyBrowserActivationEvent,
    page: data.page as typeof SHOPIFY_ACTIVATION_PAGES[number] };
}

export function isEarlyShopifyUninstall(installedAt: Date | string | null | undefined, now = new Date()): boolean {
  if (!installedAt) return false;
  const elapsed = now.getTime() - new Date(installedAt).getTime();
  return Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= 10 * 60 * 1000;
}

/** Voluntary pricing must not masquerade as a fresh OAuth installation. */
export function shopifyVoluntaryPricingPath(shop?: string | null): string {
  const params = new URLSearchParams({ shopify_pricing: "1" });
  if (shop) params.set("shop", shop);
  return "/pricing?" + params.toString();
}
