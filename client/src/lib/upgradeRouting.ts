import { getCheckoutReturnPaths } from "@/lib/checkoutReturnPaths";
import { getShopifyShopHint, getSubscriptionApiUrl } from "@/lib/shopifyBillingHint";
import { mustUseShopifyBilling } from "@/lib/shopifyBillingContext";

export type UpgradeProvider = "shopify" | "stripe";

export function getUpgradeProvider(sub: {
  isShopify?: boolean;
  upgradeProvider?: UpgradeProvider;
} | null): UpgradeProvider {
  if (sub?.upgradeProvider) return sub.upgradeProvider;
  return sub?.isShopify ? "shopify" : "stripe";
}

/** Subscribe to Pro + AI Brain (Stripe bundle or Shopify Pricing). */
export async function upgradeToProAI(returnPath = "/app/inbox"): Promise<void> {
  const subRes = await fetch(getSubscriptionApiUrl(), { credentials: "include" });
  if (!subRes.ok) throw new Error("Could not load subscription");
  const data = await subRes.json();
  const shopHint = getShopifyShopHint();
  if (mustUseShopifyBilling(data.subscription, shopHint)) {
    const qs = shopHint ? `?shop=${encodeURIComponent(shopHint)}` : "";
    window.location.href = `/pricing${qs}`;
    return;
  }

  const paths = getCheckoutReturnPaths();
  const body = {
    ...paths,
    redirectTo: returnPath,
    cancelTo: returnPath,
  };

  const res = await fetch("/api/subscription/checkout/pro-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Checkout failed");
  }
  const json = await res.json();
  if (json.url) window.location.href = json.url;
}
