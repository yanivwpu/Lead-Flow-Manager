import {
  getShopifyShopHint,
  resolveShopifyShopForCheckout,
} from "@/lib/shopifyBillingHint";
import {
  buildShopifyManagedPricingUrl,
  DEFAULT_SHOPIFY_APP_HANDLE,
  SHOPIFY_MANAGED_PRICING_CODE,
  SHOPIFY_MANAGED_PRICING_INSTRUCTIONS,
} from "@shared/shopifyManagedPricing";
import { SHOPIFY_RECONNECT_REQUIRED_MESSAGE } from "@shared/shopifyBilling";

export type ShopifyManagedPricingResponse = {
  planSelectionUrl?: string | null;
  confirmationUrl?: string | null;
  instructions?: string;
  error?: string;
  code?: string;
};

export { SHOPIFY_MANAGED_PRICING_CODE, SHOPIFY_MANAGED_PRICING_INSTRUCTIONS };

export function getClientShopifyAppHandle(): string {
  const raw = import.meta.env.VITE_SHOPIFY_APP_HANDLE;
  if (typeof raw === "string" && raw.trim()) return raw.trim().toLowerCase();
  return DEFAULT_SHOPIFY_APP_HANDLE;
}

export function shopifyManagedPricingInstructions(
  data?: Pick<ShopifyManagedPricingResponse, "instructions" | "error">,
  fallback = SHOPIFY_MANAGED_PRICING_INSTRUCTIONS,
): string {
  if (data?.instructions) return data.instructions;
  if (typeof data?.error === "string" && data.error) return data.error;
  return fallback;
}

export function shopifyBillingErrorMessage(
  data: ShopifyManagedPricingResponse,
  fallback: string,
): string {
  if (data.code === "SHOPIFY_RECONNECT_REQUIRED") {
    return data.error || SHOPIFY_RECONNECT_REQUIRED_MESSAGE;
  }
  if (data.code === SHOPIFY_MANAGED_PRICING_CODE) {
    return shopifyManagedPricingInstructions(data, fallback);
  }
  return data.error || fallback;
}

function navigateToShopifyAdmin(url: string): void {
  try {
    if (window.top && window.top !== window.self) {
      window.top.location.href = url;
      return;
    }
  } catch {
    // cross-origin iframe — fall through
  }
  window.location.href = url;
}

/**
 * Open Shopify App Pricing plan selection (Managed Pricing). Never calls appSubscriptionCreate.
 * @returns true if a redirect was started; false if caller should show instructions (e.g. toast).
 */
export async function openShopifyManagedPricing(
  shopHint?: string | null,
): Promise<boolean> {
  const shop = resolveShopifyShopForCheckout(shopHint);
  const appHandle = getClientShopifyAppHandle();

  if (import.meta.env.DEV) {
    console.log("[ShopifyBilling] openShopifyManagedPricing", {
      shopHint: shopHint ?? null,
      resolvedShop: shop ?? null,
      appHandle,
      locationSearch: typeof window !== "undefined" ? window.location.search : null,
      getShopifyShopHint: getShopifyShopHint() ?? null,
    });
  }

  if (shop) {
    const localUrl = buildShopifyManagedPricingUrl(shop, appHandle);
    if (localUrl) {
      navigateToShopifyAdmin(localUrl);
      return true;
    }
  }

  const query = shop ? `?shop=${encodeURIComponent(shop)}` : "";
  const res = await fetch(`/api/shopify/billing/managed-pricing-url${query}`, {
    method: "GET",
    credentials: "include",
  });

  const data = (await res.json().catch(() => ({}))) as ShopifyManagedPricingResponse;

  if (res.status === 401) {
    const err = new Error("session_expired") as Error & { code?: string };
    throw err;
  }

  if (!res.ok) {
    const detail = shopifyBillingErrorMessage(
      data,
      shopifyManagedPricingInstructions(data),
    );
    const err = new Error(detail) as Error & { code?: string };
    err.code = data.code;
    throw err;
  }

  const url = data.planSelectionUrl || data.confirmationUrl;
  if (url) {
    navigateToShopifyAdmin(url);
    return true;
  }

  return false;
}

/**
 * @deprecated Use openShopifyManagedPricing — Billing API charges are disabled (Managed Pricing).
 */
export async function postShopifyCheckoutWeb(
  _plan: string,
  shopHint?: string | null,
): Promise<ShopifyManagedPricingResponse> {
  const opened = await openShopifyManagedPricing(shopHint);
  if (opened) {
    return { code: SHOPIFY_MANAGED_PRICING_CODE };
  }
  return {
    code: SHOPIFY_MANAGED_PRICING_CODE,
    instructions: SHOPIFY_MANAGED_PRICING_INSTRUCTIONS,
    error: SHOPIFY_MANAGED_PRICING_INSTRUCTIONS,
  };
}
