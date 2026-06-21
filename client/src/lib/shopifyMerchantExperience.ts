import { useMemo } from "react";
import { useLocation } from "wouter";
import {
  mustUseShopifyBilling,
  type BillingSubscriptionFlags,
} from "@/lib/shopifyBillingContext";
import { getShopifyShopHint, useShopifyShopHint } from "@/lib/shopifyBillingHint";
import { useSubscription } from "@/lib/subscription-context";

/** Shopify-installed merchants: hide Growth Engine / RGE from all in-app UI. */
export function hideGrowthEngineForShopify(
  subscription: BillingSubscriptionFlags | null | undefined,
  shopHint?: string | null,
): boolean {
  return mustUseShopifyBilling(subscription, shopHint);
}

export function useHideGrowthEngineForShopify(): boolean {
  const shopHint = useShopifyShopHint();
  const { data: subscription } = useSubscription();
  return useMemo(
    () => hideGrowthEngineForShopify(subscription?.subscription, shopHint),
    [subscription?.subscription, shopHint],
  );
}

export function useHideGrowthEngineForShopifyWithHint(): {
  hideGrowthEngine: boolean;
  shopHint: string | undefined;
} {
  const shopHint = useShopifyShopHint();
  const { data: subscription } = useSubscription();
  const hideGrowthEngine = useMemo(
    () => hideGrowthEngineForShopify(subscription?.subscription, shopHint),
    [subscription?.subscription, shopHint],
  );
  return { hideGrowthEngine, shopHint };
}

/** Stable read outside React (e.g. billing payload helpers). */
export function readHideGrowthEngineForShopify(
  subscription?: BillingSubscriptionFlags | null,
): boolean {
  return hideGrowthEngineForShopify(subscription, getShopifyShopHint());
}

/** Redirect target when a Shopify merchant hits a blocked RGE route. */
export const SHOPIFY_RGE_BLOCK_REDIRECT = "/app/inbox" as const;

export function useShopifyRgeBlockRedirect(): string | null {
  const hide = useHideGrowthEngineForShopify();
  const [location] = useLocation();
  return useMemo(() => {
    if (!hide) return null;
    if (!location.includes("realtor-growth-engine") && !location.includes("growth-engines")) {
      return null;
    }
    return SHOPIFY_RGE_BLOCK_REDIRECT;
  }, [hide, location]);
}
