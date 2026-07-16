/**
 * Classify public HTTP paths for SPA shell vs hard 404.
 * Used by production static catch-all (and mirrored in Vite catch-all for local parity).
 */

/** Prefixes that must keep SPA 200 (client router / product surfaces). */
export const SPA_FALLBACK_PREFIXES = [
  "/app",
  "/api",
  "/webhooks",
  "/shopify",
  "/widget-frame",
  "/chat",
  "/share",
  "/agents",
  "/uploads",
  "/attached_assets",
  "/.well-known",
  "/assets",
] as const;

/** Exact client routes that are not marketing PAGE_META entries but still valid SPA pages. */
export const SPA_FALLBACK_EXACT = new Set([
  "/auth",
  "/reset-password",
  "/sales-admin",
  "/sales-portal",
  "/partner-portal",
  "/demo-scan",
  "/post-checkout",
  "/widget.js",
]);

export function normalizeRequestPath(rawPath: string): string {
  const pathOnly = (rawPath || "/").split("?")[0].split("#")[0] || "/";
  let decoded = pathOnly;
  try {
    decoded = decodeURIComponent(pathOnly);
  } catch {
    // Malformed percent-encoding → treat as opaque path (still unknown → 404).
    decoded = pathOnly;
  }
  // Strip trailing slash except root
  if (decoded.length > 1 && decoded.endsWith("/")) {
    decoded = decoded.slice(0, -1);
  }
  if (!decoded.startsWith("/")) {
    decoded = `/${decoded}`;
  }
  return decoded || "/";
}

/** Paths that should never be indexed and are invalid marketing URLs. */
export function isInvalidPublicPath(pathname: string): boolean {
  const p = normalizeRequestPath(pathname);
  if (p.includes("\uFFFD")) return true;
  // Control characters / null bytes
  if (/[\u0000-\u001F\u007F]/.test(p)) return true;
  return false;
}

/**
 * True → serve SPA shell with HTTP 200 (or noindex shell for portals).
 * False → unknown marketing URL → HTTP 404 + noindex SPA/custom 404 UI.
 */
export function shouldServeSpaFallback(
  pathname: string,
  marketingRoutes: readonly string[],
): boolean {
  if (isInvalidPublicPath(pathname)) return false;

  const p = normalizeRequestPath(pathname);
  if (p === "/") return true;

  for (const prefix of SPA_FALLBACK_PREFIXES) {
    if (p === prefix || p.startsWith(`${prefix}/`)) return true;
  }

  if (SPA_FALLBACK_EXACT.has(p)) return true;

  if (marketingRoutes.includes(p)) return true;

  // Blog SSR handlers usually catch these first; keep as SPA if they reach catch-all.
  if (p === "/blog" || p.startsWith("/blog/")) return true;

  return false;
}
