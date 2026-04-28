/**
 * Sanitize client-supplied redirect paths for Stripe cancel/success URLs (open redirects).
 */
export function sanitizeStripeReturnPath(input: unknown, fallback = "/app/inbox"): string {
  if (typeof input !== "string") return fallback;
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return fallback;
  if (trimmed.startsWith("//") || trimmed.includes("://")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return fallback;
  try {
    const resolved = new URL(trimmed, "https://placeholder.local");
    return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    return fallback;
  }
}

/** Stripe success_url → interstitial then client redirect */
export function buildPostCheckoutSuccessUrl(resolvedOrigin: string, returnPath: string): string {
  const base = resolvedOrigin.replace(/\/+$/, "");
  const path = sanitizeStripeReturnPath(returnPath);
  return `${base}/post-checkout?redirectTo=${encodeURIComponent(path)}`;
}

/** Stripe cancel_url → return user to the page they left */
export function buildStripeCancelUrl(resolvedOrigin: string, returnPath: string): string {
  const base = resolvedOrigin.replace(/\/+$/, "");
  const path = sanitizeStripeReturnPath(returnPath);
  return `${base}${path}`;
}
