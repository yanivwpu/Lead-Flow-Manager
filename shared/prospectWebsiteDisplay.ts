/**
 * Prospect website display helpers — presentation only.
 * Does not change enrichment / qualification behavior.
 */

export function normalizeProspectWebsiteHref(
  raw: string | null | undefined,
): string | null {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;
  try {
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
      return null;
    }
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProto);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Hostname for tooltips (e.g. example.com). */
export function prospectWebsiteDomain(raw: string | null | undefined): string | null {
  const href = normalizeProspectWebsiteHref(raw);
  if (!href) return null;
  try {
    return new URL(href).hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

/** Prefer live contact website; fall back to URL used during enrichment. */
export function resolveProspectDisplayWebsiteUrl(input: {
  websiteUrl?: string | null;
  websiteUrlUsed?: string | null;
}): string | null {
  return (
    normalizeProspectWebsiteHref(input.websiteUrl) ||
    normalizeProspectWebsiteHref(input.websiteUrlUsed)
  );
}

export type ProspectWebsiteDetailState =
  | "no_website"
  | "not_analyzed"
  | "analyzing"
  | "analyzed"
  | "failed";

export function resolveProspectWebsiteDetailState(input: {
  websiteUrl?: string | null;
  websiteUrlUsed?: string | null;
  enrichmentStatus?: string | null;
}): ProspectWebsiteDetailState {
  const href = resolveProspectDisplayWebsiteUrl(input);
  const status = String(input.enrichmentStatus || "none").toLowerCase();
  if (!href) return "no_website";
  if (status === "completed") return "analyzed";
  if (status === "failed") return "failed";
  if (status === "pending" || status === "enriching") return "analyzing";
  return "not_analyzed";
}
