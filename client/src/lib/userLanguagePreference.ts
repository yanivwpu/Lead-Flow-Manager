/**
 * Authenticated language preference restoration + persistence.
 * Public Phase 2 URL locales remain authoritative on scoped marketing routes.
 */

import {
  isPublicLocaleAuthoritativePath,
  parseLocalizedPath,
} from "@shared/localeRoutes";
import { isCrmMarketplaceHandoffRedirect } from "@shared/ghlOAuthHandoff";
import {
  LANGUAGE_CACHE_KEY,
  LANGUAGE_SOURCE_KEY,
  TRUSTED_LANGUAGE_SOURCE,
  overwriteUntrustedLanguageCache,
  resolveAuthenticatedAppLocaleFromState,
  shouldOverwriteUntrustedLanguageCache,
} from "@shared/authenticatedLocale";
import {
  normalizeUserLanguage,
  type UserLanguage,
} from "@shared/userLanguage";
import {
  changeLanguage,
  getCurrentLanguage,
  type SupportedLanguage,
} from "@/lib/i18n";

/** Explicit selection in this tab — must not be overwritten by slower /api/auth/me. */
let explicitSessionLanguage: UserLanguage | null = null;
let explicitGeneration = 0;
/** Last value we successfully persisted (or confirmed from DB) — skip redundant PATCH. */
let lastKnownPersistedLanguage: UserLanguage | null = null;
let persistInFlightFor: UserLanguage | null = null;

function readLanguageStorage(): { cachedLanguage: string | null; languageSource: string | null } {
  if (typeof localStorage === "undefined") {
    return { cachedLanguage: null, languageSource: null };
  }
  try {
    return {
      cachedLanguage: localStorage.getItem(LANGUAGE_CACHE_KEY),
      languageSource: localStorage.getItem(LANGUAGE_SOURCE_KEY),
    };
  } catch {
    return { cachedLanguage: null, languageSource: null };
  }
}

function markTrustedLanguageSource(lang: UserLanguage): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LANGUAGE_SOURCE_KEY, TRUSTED_LANGUAGE_SOURCE);
    localStorage.setItem(LANGUAGE_CACHE_KEY, lang);
  } catch {
    /* ignore */
  }
}

export function noteExplicitLanguageSelection(lang: UserLanguage): void {
  explicitSessionLanguage = lang;
  explicitGeneration += 1;
  markTrustedLanguageSource(lang);
}

export function clearExplicitLanguageSelection(): void {
  explicitSessionLanguage = null;
}

export function getExplicitSessionLanguage(): UserLanguage | null {
  return explicitSessionLanguage;
}

export function markLanguagePersisted(lang: UserLanguage): void {
  lastKnownPersistedLanguage = lang;
}

export { isPublicLocaleAuthoritativePath };

/**
 * Apply saved DB language after auth is known.
 * Skips public marketing URL routes and never overwrites a newer explicit selection.
 */
export async function applyDatabaseLanguagePreference(
  rawLanguage: unknown,
): Promise<void> {
  if (typeof window === "undefined") return;
  if (isPublicLocaleAuthoritativePath(window.location.pathname || "/")) return;

  const generationAtStart = explicitGeneration;

  if (explicitSessionLanguage) {
    if (getCurrentLanguage() !== explicitSessionLanguage) {
      await changeLanguage(explicitSessionLanguage as SupportedLanguage);
    }
    return;
  }

  const stored = readLanguageStorage();
  const locale = resolveAuthenticatedAppLocaleFromState({
    explicitSessionLanguage: null,
    userLanguage: rawLanguage,
    cachedLanguage: stored.cachedLanguage,
    languageSource: stored.languageSource,
  });

  if (
    shouldOverwriteUntrustedLanguageCache({
      explicitSessionLanguage: null,
      userLanguage: rawLanguage,
      cachedLanguage: stored.cachedLanguage,
      languageSource: stored.languageSource,
    })
  ) {
    try {
      overwriteUntrustedLanguageCache(localStorage);
    } catch {
      /* ignore */
    }
  }

  const fromDb = normalizeUserLanguage(rawLanguage);
  if (fromDb) {
    markLanguagePersisted(fromDb);
  }

  if (getCurrentLanguage() === locale) {
    try {
      localStorage.setItem(LANGUAGE_CACHE_KEY, locale);
    } catch {
      /* ignore */
    }
    return;
  }

  await changeLanguage(locale as SupportedLanguage);

  if (generationAtStart !== explicitGeneration && explicitSessionLanguage) {
    await changeLanguage(explicitSessionLanguage as SupportedLanguage);
  }
}

/**
 * Persist language for the logged-in account. No-op when logged out or value unchanged.
 * UI must already be updated via changeLanguage + noteExplicitLanguageSelection.
 */
export async function persistAuthenticatedLanguage(
  lang: UserLanguage,
  isLoggedIn: boolean,
): Promise<{ ok: boolean }> {
  if (!isLoggedIn) return { ok: true };
  if (lastKnownPersistedLanguage === lang) return { ok: true };
  if (persistInFlightFor === lang) return { ok: true };

  persistInFlightFor = lang;
  const generationAtStart = explicitGeneration;

  try {
    const response = await fetch("/api/user/language", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ language: lang }),
    });
    if (!response.ok) {
      console.error("Failed to save language preference:", response.status);
      return { ok: false };
    }
    if (generationAtStart === explicitGeneration) {
      markLanguagePersisted(lang);
    }
    return { ok: true };
  } catch (error) {
    console.error("Failed to save language preference:", error);
    return { ok: false };
  } finally {
    if (persistInFlightFor === lang) persistInFlightFor = null;
  }
}

/** Resolve language to store on signup from current UI / URL context. */
export function resolveSignupLanguagePreference(): UserLanguage {
  if (typeof window !== "undefined") {
    const parsed = parseLocalizedPath(window.location.pathname || "/");
    if (parsed.isLocalePrefixed && parsed.isSupported) {
      return parsed.locale as UserLanguage;
    }
    // Signup usually lands on /auth after /es/... or /he/... — honor redirect locale.
    try {
      const redirect = new URLSearchParams(window.location.search || "").get("redirect") || "";
      const redirectPath = redirect.split("?")[0] || "";
      const redirectParsed = parseLocalizedPath(redirectPath || "/");
      if (redirectParsed.isLocalePrefixed && redirectParsed.isSupported) {
        return redirectParsed.locale as UserLanguage;
      }
      // Marketplace handoff must not persist browser/detector language.
      if (isCrmMarketplaceHandoffRedirect(redirect)) {
        const stored = readLanguageStorage();
        return resolveAuthenticatedAppLocaleFromState({
          explicitSessionLanguage: getExplicitSessionLanguage(),
          userLanguage: null,
          cachedLanguage: stored.cachedLanguage,
          languageSource: stored.languageSource,
        });
      }
    } catch {
      /* ignore */
    }
  }
  return normalizeUserLanguage(getCurrentLanguage()) || "en";
}

/** Authenticated in-app locale: DB preference, else trusted explicit choice, else English. */
export function resolveAuthenticatedAppLocale(userLanguage: unknown): UserLanguage {
  const stored = readLanguageStorage();
  return resolveAuthenticatedAppLocaleFromState({
    explicitSessionLanguage: getExplicitSessionLanguage(),
    userLanguage,
    cachedLanguage: stored.cachedLanguage,
    languageSource: stored.languageSource,
  });
}

/** Test-only reset of module session state. */
export function __resetUserLanguagePreferenceStateForTests(): void {
  explicitSessionLanguage = null;
  explicitGeneration = 0;
  lastKnownPersistedLanguage = null;
  persistInFlightFor = null;
}
