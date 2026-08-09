/**
 * Phase 2 localized marketing URL utilities (client + server).
 * English stays unprefixed; only `es` and `he` are valid locale prefixes.
 */

import type { MarketingLocale } from "./marketingLocale";

export const CANONICAL_HOST = "https://www.whachatcrm.com";

/** Locales that appear as a URL prefix (English is unprefixed). */
export const URL_LOCALE_PREFIXES = ["es", "he"] as const;
export type UrlLocalePrefix = (typeof URL_LOCALE_PREFIXES)[number];

export const PHASE2_LOCALIZED_PATHS = [
  "/",
  "/pricing",
  "/prospect-ai",
  "/ai-brain",
  "/ai-copilot",
  "/unified-inbox",
  "/automations",
  "/chatbot-builder",
  "/campaigns",
  "/realtor-growth-engine",
  "/integrations",
  "/shared-team-inbox",
  "/real-estate-crm",
  "/solutions/ecommerce",
  "/solutions/local-service-businesses",
  "/solutions/marketing-agencies",
  "/solutions/med-spas",
] as const;

export type Phase2LocalizedPath = (typeof PHASE2_LOCALIZED_PATHS)[number];

const PHASE2_SET = new Set<string>(PHASE2_LOCALIZED_PATHS);

export type ParsedLocalizedPath = {
  locale: MarketingLocale;
  englishPath: string;
  isLocalePrefixed: boolean;
  /** True when this pathname is a crawlable Phase 2 localized (or English scoped) page. */
  isSupported: boolean;
};

function normalizePathname(raw: string): string {
  const pathOnly = (raw || "/").split("?")[0].split("#")[0] || "/";
  let decoded = pathOnly;
  try {
    decoded = decodeURIComponent(pathOnly);
  } catch {
    decoded = pathOnly;
  }
  if (!decoded.startsWith("/")) decoded = `/${decoded}`;
  // Keep trailing slash only for locale homepage roots handled separately.
  if (decoded.length > 1 && decoded.endsWith("/")) {
    decoded = decoded.slice(0, -1);
  }
  return decoded || "/";
}

/** Only `es` and `he` — never treat arbitrary two-letter segments as locales. */
export function isMarketingLocalePrefix(segment: string | undefined | null): segment is UrlLocalePrefix {
  return segment === "es" || segment === "he";
}

export function hasLocalizedVersion(englishPath: string): boolean {
  const p = normalizePathname(englishPath);
  return PHASE2_SET.has(p);
}

/**
 * `/es` and `/he` (no trailing slash) permanently redirect to `/es/` and `/he/`.
 * Do not treat `/es/` as a redirect source.
 */
export function isLocaleRootRedirect(pathname: string): boolean {
  const raw = (pathname || "/").split("?")[0].split("#")[0] || "/";
  return raw === "/es" || raw === "/he";
}

export function localeRootRedirectTarget(pathname: string): "/es/" | "/he/" | null {
  const raw = (pathname || "/").split("?")[0].split("#")[0] || "/";
  if (raw === "/es") return "/es/";
  if (raw === "/he") return "/he/";
  return null;
}

export function parseLocalizedPath(pathname: string): ParsedLocalizedPath {
  const raw = (pathname || "/").split("?")[0].split("#")[0] || "/";

  // Canonical localized homes keep trailing slash in the public URL.
  if (raw === "/es/" || raw === "/es") {
    return {
      locale: "es",
      englishPath: "/",
      isLocalePrefixed: true,
      isSupported: raw === "/es/" || raw === "/es",
    };
  }
  if (raw === "/he/" || raw === "/he") {
    return {
      locale: "he",
      englishPath: "/",
      isLocalePrefixed: true,
      isSupported: raw === "/he/" || raw === "/he",
    };
  }

  const normalized = normalizePathname(raw);
  const parts = normalized.split("/").filter(Boolean);
  const first = parts[0];

  if (isMarketingLocalePrefix(first)) {
    const rest = parts.slice(1);
    const englishPath = rest.length === 0 ? "/" : `/${rest.join("/")}`;
    return {
      locale: first,
      englishPath,
      isLocalePrefixed: true,
      isSupported: hasLocalizedVersion(englishPath),
    };
  }

  // Unsupported prefix that looks like a locale attempt (e.g. /fr/ai-brain) — not a marketing locale.
  if (first && /^[a-z]{2}$/i.test(first) && first !== "en") {
    const rest = parts.slice(1);
    const englishPath = rest.length === 0 ? "/" : `/${rest.join("/")}`;
    return {
      locale: "en",
      englishPath: normalized,
      isLocalePrefixed: false,
      isSupported: false,
    };
  }

  return {
    locale: "en",
    englishPath: normalized,
    isLocalePrefixed: false,
    isSupported: hasLocalizedVersion(normalized),
  };
}

export function stripLocalePrefix(pathname: string): string {
  return parseLocalizedPath(pathname).englishPath;
}

/**
 * Localized public path for a Phase 2 English path.
 * Returns null when locale !== en and the path has no localized version.
 */
export function localizePath(
  englishPath: string,
  locale: MarketingLocale,
): string | null {
  const path = normalizePathname(englishPath);
  if (locale === "en") {
    return path === "/" ? "/" : path;
  }
  if (!hasLocalizedVersion(path)) return null;
  if (path === "/") return `/${locale}/`;
  return `/${locale}${path}`;
}

export function getCanonicalUrl(
  englishPath: string,
  locale: MarketingLocale,
  baseUrl: string = CANONICAL_HOST,
): string | null {
  const localized = localizePath(englishPath, locale);
  if (!localized) return null;
  const base = baseUrl.replace(/\/$/, "");
  if (localized === "/") return `${base}/`;
  return `${base}${localized}`;
}

export type HreflangLink = {
  hreflang: "en" | "es" | "he" | "x-default";
  href: string;
};

/** Reciprocal en/es/he/x-default cluster for Phase 2 paths; empty when not localized. */
export function getHreflangLinks(
  englishPath: string,
  baseUrl: string = CANONICAL_HOST,
): HreflangLink[] {
  if (!hasLocalizedVersion(englishPath)) return [];
  const en = getCanonicalUrl(englishPath, "en", baseUrl)!;
  const es = getCanonicalUrl(englishPath, "es", baseUrl)!;
  const he = getCanonicalUrl(englishPath, "he", baseUrl)!;
  return [
    { hreflang: "en", href: en },
    { hreflang: "es", href: es },
    { hreflang: "he", href: he },
    { hreflang: "x-default", href: en },
  ];
}

/**
 * Preserve locale on Phase 2 internal links; leave auth/deferred English URLs unchanged.
 * Absolute http(s) URLs and hash-only links are returned as-is.
 */
export function localizedInternalHref(
  href: string,
  locale: MarketingLocale,
): string {
  if (!href || href.startsWith("http://") || href.startsWith("https://") || href.startsWith("#") || href.startsWith("mailto:")) {
    return href;
  }
  const [pathPart, query = ""] = href.split("?");
  const hashIdx = href.indexOf("#");
  const hash = hashIdx >= 0 ? href.slice(hashIdx) : "";
  const pathOnly = (pathPart || "/").split("#")[0] || "/";
  const english = stripLocalePrefix(pathOnly);
  const localized = localizePath(english, locale);
  if (!localized) {
    // Deferred / English-only destination
    const q = query ? `?${query.split("#")[0]}` : "";
    return `${normalizePathname(english)}${q}${hash}`;
  }
  const q = query ? `?${query.split("#")[0]}` : "";
  return `${localized}${q}${hash}`;
}

/** All public pathnames that must return HTTP 200 for Phase 2 (including English). */
export function getAllPhase2PublicPathnames(): string[] {
  const out: string[] = [];
  for (const path of PHASE2_LOCALIZED_PATHS) {
    out.push(path === "/" ? "/" : path);
    out.push(localizePath(path, "es")!);
    out.push(localizePath(path, "he")!);
  }
  return out;
}

export function marketingDirForLocale(locale: MarketingLocale): "ltr" | "rtl" {
  return locale === "he" ? "rtl" : "ltr";
}
