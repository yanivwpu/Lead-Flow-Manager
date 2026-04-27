/**
 * Stripe Checkout redirects must always land on the app origin, not marketing.
 * If any whachatcrm host is detected (apex/www/app), force https://app.whachatcrm.com.
 */
const WHACHAT_APP_ORIGIN = "https://app.whachatcrm.com";

export function resolveStripeCheckoutRedirectOrigin(resolvedBaseUrl: string): string {
  const raw = resolvedBaseUrl.trim().replace(/\/+$/, "");
  if (!raw) return resolvedBaseUrl;

  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase();
    if (host === "whachatcrm.com" || host === "www.whachatcrm.com" || host === "app.whachatcrm.com") {
      return WHACHAT_APP_ORIGIN;
    }
    return url.origin;
  } catch {
    return raw;
  }
}
