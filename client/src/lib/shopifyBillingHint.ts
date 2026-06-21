import { useMemo } from "react";
import { useLocation } from "wouter";
import { normalizeShopifyShopDomain } from "@shared/shopifyBilling";
import type { BillingSubscriptionFlags } from "@/lib/shopifyBillingContext";
import { readHideGrowthEngineForShopify } from "@/lib/shopifyMerchantExperience";

/** Persist Shopify shop domain from URL for SPA navigations (matches Settings localStorage key). */
export function getShopifyShopHint(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("shop");
    const normalized = fromUrl ? normalizeShopifyShopDomain(fromUrl) : null;
    if (normalized) {
      localStorage.setItem("shopify_shop", normalized);
      return normalized;
    }
  } catch {
    /* ignore */
  }
  try {
    const stored = localStorage.getItem("shopify_shop");
    const normalized = stored ? normalizeShopifyShopDomain(stored) : null;
    if (normalized) return normalized;
  } catch {
    /* ignore */
  }
  return undefined;
}

/** Resolve shop at click/checkout time (URL → localStorage → explicit hint). */
export function resolveShopifyShopForCheckout(explicitHint?: string | null): string | undefined {
  const fromExplicit = explicitHint ? normalizeShopifyShopDomain(explicitHint) : null;
  if (fromExplicit) {
    try {
      localStorage.setItem("shopify_shop", fromExplicit);
    } catch {
      /* ignore */
    }
    return fromExplicit;
  }
  return getShopifyShopHint();
}

/** Subscription fetch URL — pass `shop` so /api/subscription marks Shopify billing for reviewers using ?shop=. */
export function getSubscriptionApiUrl(): string {
  const hint = getShopifyShopHint();
  return hint ? `/api/subscription?shop=${encodeURIComponent(hint)}` : "/api/subscription";
}

/**
 * Re-reads on every route/search change (wouter `loc` omits query string).
 */
export function useShopifyShopHint(): string | undefined {
  const [loc] = useLocation();
  const search = typeof window !== "undefined" ? window.location.search : "";
  return useMemo(() => getShopifyShopHint(), [loc, search]);
}

/**
 * RGE one-time purchase billing payload. Shopify-installed accounts are blocked from RGE checkout.
 */
export function getRgePurchaseBillingPayload(
  subscription?: BillingSubscriptionFlags | null,
): {
  billingChannel: "stripe" | "blocked";
  shop?: string;
} {
  if (readHideGrowthEngineForShopify(subscription)) {
    return { billingChannel: "blocked" };
  }
  return { billingChannel: "stripe" };
}
