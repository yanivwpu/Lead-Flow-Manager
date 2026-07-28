/**
 * Classify prospect URLs as official business websites vs social/profile pages.
 * Social URLs are preserved as profiles — never treated as crawl targets for contact email.
 */

const SOCIAL_HOST_SUFFIXES = [
  "facebook.com",
  "fb.com",
  "instagram.com",
  "linkedin.com",
  "x.com",
  "twitter.com",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
] as const;

export type ProspectWebsiteUrlKind = "none" | "invalid" | "social" | "official";

export function normalizeWebsiteCandidate(raw: string | null | undefined): string | null {
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

export function hostnameOfWebsiteUrl(raw: string | null | undefined): string | null {
  const href = normalizeWebsiteCandidate(raw);
  if (!href) return null;
  try {
    return new URL(href).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

export function isSocialProfileHost(hostname: string | null | undefined): boolean {
  const host = String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./i, "");
  if (!host) return false;
  return SOCIAL_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export function isSocialProfileUrl(raw: string | null | undefined): boolean {
  return isSocialProfileHost(hostnameOfWebsiteUrl(raw));
}

export function classifyProspectWebsiteUrl(raw: string | null | undefined): ProspectWebsiteUrlKind {
  const href = normalizeWebsiteCandidate(raw);
  if (!href) return String(raw || "").trim() ? "invalid" : "none";
  return isSocialProfileUrl(href) ? "social" : "official";
}

/** Prefer first official URL; ignore social/invalid. */
export function pickOfficialWebsiteUrl(
  candidates: Array<string | null | undefined>,
): string | null {
  for (const raw of candidates) {
    const href = normalizeWebsiteCandidate(raw);
    if (!href) continue;
    if (classifyProspectWebsiteUrl(href) === "official") return href;
  }
  return null;
}

export function collectSocialProfileUrls(
  candidates: Array<string | null | undefined>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of candidates) {
    const href = normalizeWebsiteCandidate(raw);
    if (!href || classifyProspectWebsiteUrl(href) !== "social") continue;
    const key = href.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(href);
  }
  return out;
}

/**
 * Soft name-token overlap for recovered domain validation.
 * Requires at least one meaningful token (≥3 chars) from the business name in the host or title.
 */
export function websiteMatchesBusinessSignals(params: {
  websiteUrl: string;
  businessName?: string | null;
  pageTitle?: string | null;
  phoneDigits?: string | null;
  pageText?: string | null;
}): { ok: boolean; confidence: "high" | "medium" | "low" | "reject" } {
  const href = normalizeWebsiteCandidate(params.websiteUrl);
  if (!href || classifyProspectWebsiteUrl(href) !== "official") {
    return { ok: false, confidence: "reject" };
  }
  const host = hostnameOfWebsiteUrl(href) || "";
  const name = String(params.businessName || "").toLowerCase();
  const title = String(params.pageTitle || "").toLowerCase();
  const text = String(params.pageText || "").toLowerCase();
  const tokens = name
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !/^(the|and|llc|inc|ltd|co|group|real|estate|miami)$/i.test(t));

  const hostHit = tokens.some((t) => host.includes(t));
  const titleHit = tokens.some((t) => title.includes(t));
  const phone = String(params.phoneDigits || "").replace(/\D/g, "");
  const phoneHit = phone.length >= 7 && (text.includes(phone) || text.includes(phone.slice(-10)));

  if (hostHit && (titleHit || phoneHit)) return { ok: true, confidence: "high" };
  if (hostHit || (titleHit && tokens.length > 0)) return { ok: true, confidence: "medium" };
  if (titleHit || phoneHit) return { ok: true, confidence: "low" };
  // Domain-only recovery without name signals is too weak to auto-apply.
  return { ok: false, confidence: "reject" };
}
