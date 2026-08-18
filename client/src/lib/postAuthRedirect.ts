/**
 * Same-origin post-login navigation. Wouter `setLocation` is pathname-based and can
 * drop `?checkout=` / `?billing=` in production-style auth returns.
 */

export function sanitizeClientRedirectPath(
  raw: string | null | undefined,
  fallback = "/app/inbox",
): string {
  if (!raw || typeof raw !== "string") return fallback;
  let candidate = raw.trim();
  if (!candidate) return fallback;
  if (candidate.startsWith("%2F") || candidate.startsWith("%2f")) {
    try {
      candidate = decodeURIComponent(candidate);
    } catch {
      return fallback;
    }
  }
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("://")) {
    return fallback;
  }
  if (/[\u0000-\u001f\u007f]/.test(candidate)) return fallback;
  try {
    const resolved = new URL(candidate, "https://placeholder.local");
    return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    return fallback;
  }
}

/** Full navigation so query strings survive the real login → Pricing hop. */
export function navigateAfterAuth(to: string, fallback = "/app/inbox"): void {
  const safe = sanitizeClientRedirectPath(to, fallback);
  window.location.assign(safe);
}
