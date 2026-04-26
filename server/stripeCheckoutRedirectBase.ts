/**
 * Stripe Checkout success/cancel URLs must not use the apex host whachatcrm.com
 * when DNS is only configured for www. Normalize any whachatcrm host to https://www.whachatcrm.com.
 */
const WHACHAT_WWW_ORIGIN = "https://www.whachatcrm.com";

export function resolveStripeCheckoutRedirectOrigin(resolvedBaseUrl: string): string {
  const raw = resolvedBaseUrl.trim().replace(/\/+$/, "");
  if (!raw) return resolvedBaseUrl;

  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase();
    if (host === "whachatcrm.com" || host === "www.whachatcrm.com") {
      return WHACHAT_WWW_ORIGIN;
    }
    return url.origin;
  } catch {
    return raw;
  }
}
