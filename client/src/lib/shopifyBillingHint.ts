import { useMemo } from "react";
import { useLocation } from "wouter";

const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

/** Persist Shopify shop domain from URL for SPA navigations (matches Settings localStorage key). */
export function getShopifyShopHint(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("shop");
    if (fromUrl && SHOP_RE.test(fromUrl)) {
      localStorage.setItem("shopify_shop", fromUrl);
      return fromUrl;
    }
  } catch {
    /* ignore */
  }
  try {
    const stored = localStorage.getItem("shopify_shop");
    if (stored && SHOP_RE.test(stored)) return stored;
  } catch {
    /* ignore */
  }
  return undefined;
}

/** Subscription fetch URL — pass `shop` so /api/subscription marks Shopify billing for reviewers using ?shop=. */
export function getSubscriptionApiUrl(): string {
  const hint = getShopifyShopHint();
  return hint ? `/api/subscription?shop=${encodeURIComponent(hint)}` : "/api/subscription";
}

/**
 * Recomputes when the route changes; reads latest `window.location.search` so query params are picked up.
 */
export function useShopifyShopHint(): string | undefined {
  const [loc] = useLocation();
  return useMemo(() => getShopifyShopHint(), [loc]);
}
