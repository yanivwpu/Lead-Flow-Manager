import { getShopifyShopHint } from "@/lib/shopifyBillingHint";
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
 * Session-auth Shopify billing — passes shop from URL/localStorage so backend can resolve install token.
 */
export async function postShopifyCheckoutWeb(
  plan: string,
  shopHint?: string | null,
): Promise<ShopifyCheckoutWebResponse> {
  const shop = shopHint ?? getShopifyShopHint();
  const res = await fetch("/api/shopify/billing/checkout-web", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      plan,
      ...(shop ? { shop } : {}),
    }),
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
