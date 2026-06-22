import { getShopifyShopHint } from "@/lib/shopifyBillingHint";

/** Subscription payload shape from GET /api/subscription (subset). */
export type ProAiTrialSubscriptionSnapshot = {
  limits?: {
    isInTrial?: boolean;
    trialDaysRemaining?: number;
    plan?: string;
    planName?: string;
    effectiveHasAIBrain?: boolean;
  } | null;
  subscription?: {
    trialIncludesAIBrain?: boolean;
    isPaidSubscriber?: boolean;
    trialPlan?: string | null;
    trialEndsAt?: string | Date | null;
    trialDaysRemaining?: number;
    isShopify?: boolean;
  } | null;
};

/** Active wall-clock Pro + AI Brain trial (unpaid). */
export function isActiveProAiTrial(
  data: ProAiTrialSubscriptionSnapshot | null | undefined,
): boolean {
  if (!data?.limits?.isInTrial) return false;
  if (data.subscription?.isPaidSubscriber) return false;
  if (!data.subscription?.trialIncludesAIBrain) return false;
  return (data.subscription?.trialPlan ?? "pro_ai") === "pro_ai";
}

export function proAiTrialDaysRemaining(
  data: ProAiTrialSubscriptionSnapshot | null | undefined,
): number {
  return (
    data?.limits?.trialDaysRemaining ??
    data?.subscription?.trialDaysRemaining ??
    0
  );
}

/** Upgrade destination — never use legacy /app/settings/billing (no route). */
export function getUpgradeNavigationPath(options?: {
  shopHint?: string | null;
  isShopify?: boolean;
}): string {
  const isShopify = options?.isShopify ?? false;
  if (!isShopify) return "/pricing";

  const shop = options?.shopHint ?? getShopifyShopHint();
  const params = new URLSearchParams();
  params.set("shopify_installed", "1");
  if (shop) params.set("shop", shop);
  return `/pricing?${params.toString()}`;
}
