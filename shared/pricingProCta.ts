/**
 * Logged-in Pricing Pro CTA from server trial/billing state.
 * Logged-out visitors see Start Trial; eligibility is re-checked after login.
 */

export type PricingProCtaKind =
  | "current_plan"
  | "keep_pro_after_trial"
  | "start_trial"
  | "upgrade_pro"
  | "shopify_manage"
  | "shopify_choose";

export function resolvePricingProCta(input: {
  loggedIn: boolean;
  isShopify: boolean;
  isPaidPro: boolean;
  isActiveProAiTrial: boolean;
  canStartInternalTrial: boolean;
}): PricingProCtaKind {
  if (input.loggedIn && input.isShopify) {
    if (input.isPaidPro && !input.isActiveProAiTrial) return "shopify_manage";
    if (input.isActiveProAiTrial) return "keep_pro_after_trial";
    return "shopify_choose";
  }
  if (input.loggedIn && input.isPaidPro && !input.isActiveProAiTrial) return "current_plan";
  if (input.loggedIn && input.isActiveProAiTrial) return "keep_pro_after_trial";
  if (!input.loggedIn || input.canStartInternalTrial) return "start_trial";
  return "upgrade_pro";
}

/**
 * Authenticated product upgrade CTA (AI Brain, Settings, upgrade modals, feature gates).
 * Uses the server canStartInternalTrial flag only — never plan name or client dates.
 * Shopify never receives the web internal trial.
 */
export type InAppUpgradeCtaKind = "start_trial" | "upgrade_pro" | "shopify_choose";

export function resolveInAppUpgradeCta(input: {
  canStartInternalTrial: boolean;
  isShopify: boolean;
}): InAppUpgradeCtaKind {
  if (input.isShopify) return "shopify_choose";
  if (input.canStartInternalTrial) return "start_trial";
  return "upgrade_pro";
}
