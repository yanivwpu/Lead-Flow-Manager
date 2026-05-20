import {
  getShopifyShopHint,
  resolveShopifyShopForCheckout,
} from "@/lib/shopifyBillingHint";
import { SHOPIFY_RECONNECT_REQUIRED_MESSAGE } from "@shared/shopifyBilling";

export type ShopifyCheckoutWebResponse = {
  confirmationUrl?: string;
  error?: string;
  code?: string;
};

/** Parse backend billing errors for Pricing / modals (never generic-only when code is present). */
export function shopifyBillingErrorMessage(data: ShopifyCheckoutWebResponse, fallback: string): string {
  if (data.code === "SHOPIFY_RECONNECT_REQUIRED") {
    return data.error || SHOPIFY_RECONNECT_REQUIRED_MESSAGE;
  }
  return data.error || fallback;
}

/**
 * Session-auth Shopify billing — passes shop in JSON body and query string when resolved.
 */
export async function postShopifyCheckoutWeb(
  plan: string,
  shopHint?: string | null,
): Promise<ShopifyCheckoutWebResponse> {
  const shop = resolveShopifyShopForCheckout(shopHint);

  if (import.meta.env.DEV) {
    console.log("[ShopifyBilling] postShopifyCheckoutWeb", {
      plan,
      shopHint: shopHint ?? null,
      resolvedShop: shop ?? null,
      locationSearch: typeof window !== "undefined" ? window.location.search : null,
      getShopifyShopHint: getShopifyShopHint() ?? null,
    });
  }

  const payload: { plan: string; shop?: string } = { plan };
  if (shop) payload.shop = shop;
  const query = shop ? `?shop=${encodeURIComponent(shop)}` : "";
  const res = await fetch(`/api/shopify/billing/checkout-web${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  const data = (await res.json().catch(() => ({}))) as ShopifyCheckoutWebResponse;

  if (res.status === 401) {
    const err = new Error("session_expired") as Error & { code?: string };
    throw err;
  }

  if (!res.ok) {
    const err = new Error(shopifyBillingErrorMessage(data, "Failed to start billing")) as Error & {
      code?: string;
    };
    err.code = data.code;
    throw err;
  }

  return data;
}
