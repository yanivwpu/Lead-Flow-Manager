/**
 * Client helpers: URL locale is source of truth for Phase 2 marketing pages.
 */

import { useEffect } from "react";
import { useLocation } from "wouter";
import {
  hasLocalizedVersion,
  localizePath,
  localizedInternalHref,
  parseLocalizedPath,
  type ParsedLocalizedPath,
} from "@shared/localeRoutes";
import type { MarketingLocale } from "@shared/marketingLocale";
import { changeLanguage, getCurrentLanguage, type SupportedLanguage } from "@/lib/i18n";

export function useParsedMarketingPath(): ParsedLocalizedPath {
  const [location] = useLocation();
  return parseLocalizedPath(location);
}

export function useMarketingUrlLocale(): MarketingLocale {
  return useParsedMarketingPath().locale;
}

/** Keep i18n + localStorage aligned with explicit URL locale on scoped pages. */
export function useSyncLanguageFromMarketingUrl() {
  const [location] = useLocation();

  useEffect(() => {
    const parsed = parseLocalizedPath(location);
    if (parsed.isLocalePrefixed && parsed.isSupported) {
      if (getCurrentLanguage() !== parsed.locale) {
        void changeLanguage(parsed.locale as SupportedLanguage);
      }
      return;
    }
    // Unprefixed Phase 2 marketing URL → English is authoritative (ignore stale localStorage).
    if (!parsed.isLocalePrefixed && hasLocalizedVersion(parsed.englishPath)) {
      if (getCurrentLanguage() !== "en") {
        void changeLanguage("en");
      }
    }
  }, [location]);
}

export function useLocalizedHref(href: string): string {
  const locale = useMarketingUrlLocale();
  return localizedInternalHref(href, locale);
}

export function marketingLanguageTargetPath(
  currentPathname: string,
  nextLocale: MarketingLocale,
): string {
  const parsed = parseLocalizedPath(currentPathname);
  if (hasLocalizedVersion(parsed.englishPath)) {
    return localizePath(parsed.englishPath, nextLocale) || "/";
  }
  // Deferred English-only page: prefer localized homepage rather than fake /es/... shell.
  if (nextLocale === "en") return parsed.englishPath;
  return localizePath("/", nextLocale) || `/${nextLocale}/`;
}
