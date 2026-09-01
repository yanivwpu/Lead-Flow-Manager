import { getCheckoutReturnPaths } from "@/lib/checkoutReturnPaths";
import { openShopifyManagedPricing } from "@/lib/shopifyCheckout";
import type { InAppUpgradeCtaKind } from "@shared/pricingProCta";

export type InAppProUpgradeResult = "started_trial" | "checkout" | "shopify" | "auth";

/**
 * Execute the in-app Pro upgrade for the resolved CTA kind.
 * Eligible → POST /api/subscription/start-trial. Expired/used → paid Stripe Checkout.
 * Never infers eligibility here; the caller must pass resolveInAppUpgradeCta().
 */
export async function performInAppProUpgrade(
  kind: InAppUpgradeCtaKind,
  opts?: { shopHint?: string | null; returnPath?: string },
): Promise<InAppProUpgradeResult> {
  if (kind === "shopify_choose") {
    const opened = await openShopifyManagedPricing(opts?.shopHint);
    if (!opened) {
      const err = new Error("shopify_unopened") as Error & { code?: string };
      err.code = "shopify_unopened";
      throw err;
    }
    return "shopify";
  }

  if (kind === "start_trial") {
    const res = await fetch("/api/subscription/start-trial", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    if (res.status === 401) {
      window.location.href = `/auth?redirect=${encodeURIComponent(
        `${window.location.pathname}${window.location.search}`,
      )}`;
      return "auth";
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Failed to start trial");
    }
    return "started_trial";
  }

  const paths = getCheckoutReturnPaths();
  const res = await fetch("/api/subscription/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      planId: "pro",
      billingInterval: "monthly",
      ...paths,
      ...(opts?.returnPath
        ? { redirectTo: opts.returnPath, cancelTo: opts.returnPath }
        : {}),
    }),
  });
  if (res.status === 401) {
    window.location.href = `/auth?redirect=${encodeURIComponent(
      `${window.location.pathname}${window.location.search}`,
    )}`;
    return "auth";
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Failed to start checkout");
  }
  if (data.url) {
    window.location.href = data.url;
  }
  return "checkout";
}
