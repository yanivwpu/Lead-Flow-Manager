/**
 * Authenticated language preference restoration + persistence.
 * Public Phase 2 URL locales remain authoritative on scoped marketing routes.
 */

import { createLanguageSaveQueue } from "./languageSaveQueue";
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
let selectionPending = false;
let loginSelection: UserLanguage | null = null;
const LOGIN_LANGUAGE_KEY = "whachatcrm_login_language";

type LoginLanguage = { accountId: string; language: UserLanguage; pending: boolean };

function readLoginLanguage(): LoginLanguage | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(LOGIN_LANGUAGE_KEY) || "null");
    const language = normalizeUserLanguage(value?.language);
    return language && typeof value.accountId === "string"
      ? { accountId: value.accountId, language, pending: value.pending === true }
      : null;
  } catch {
    return null;
  }
}

function writeLoginLanguage(value: LoginLanguage) {
  try { sessionStorage.setItem(LOGIN_LANGUAGE_KEY, JSON.stringify(value)); } catch { /* optional browser storage */ }
}

/** Seed direction on the immediate reload. Account hydration validates ownership before rendering. */
export function getLoginTransitionLanguage(): UserLanguage | null {
  return readLoginLanguage()?.language ?? null;
}

export function clearLoginLanguage() {
  try { sessionStorage.removeItem(LOGIN_LANGUAGE_KEY); } catch { /* optional browser storage */ }
}

/** Bind a signed-out choice only after the server confirms which account signed in. */
export function bindLoginLanguage(accountId: string, saved: unknown) {
  clearLoginLanguage();
  if (!loginSelection) return;
  writeLoginLanguage({ accountId, language: loginSelection, pending: loginSelection !== normalizeUserLanguage(saved) });
}

export function restoreLoginLanguage(accountId: string) {
  const selection = readLoginLanguage();
  if (selection?.accountId === accountId) explicitSessionLanguage = selection.language;
  else clearLoginLanguage();
}

export async function saveLoginLanguage(accountId: string): Promise<boolean> {
  const selection = readLoginLanguage();
  if (selection?.accountId !== accountId || !selection.pending) return true;
  writeLoginLanguage({ ...selection, pending: false });
  return (await persistAuthenticatedLanguage(selection.language, accountId)).ok;
}
const languageSaveQueue = createLanguageSaveQueue(async (language, expectedAccountId) => {
  try {
    const response = await fetch("/api/user/language", {
      method: "PATCH",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ language, expectedAccountId }),
    });
    if (response.ok) return true;
    console.error("Failed to save language preference:", response.status);
  } catch (error) {
    console.error("Failed to save language preference:", error);
  }
  return false;
});

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

export function noteExplicitLanguageSelection(loginLanguage?: UserLanguage): number {
  if (loginLanguage) loginSelection = loginLanguage;
  selectionPending = true;
  return ++explicitGeneration;
}

export function isCurrentLanguageSelection(generation: number): boolean {
  return generation === explicitGeneration;
}

export function finishExplicitLanguageSelection(
  generation: number,
  lang: UserLanguage,
  applied: boolean,
  source: "login" | "browser" | "account" = "browser",
  accountId?: string,
): boolean {
  if (!isCurrentLanguageSelection(generation)) return false;
  selectionPending = false;
  if (!applied && source === "login") loginSelection = null;
  if (applied) {
    explicitSessionLanguage = lang;
    if (source === "login") loginSelection = lang;
    if (source === "browser") markTrustedLanguageSource(lang);
    if (source === "account" && accountId) writeLoginLanguage({ accountId, language: lang, pending: false });
  }
  return true;
}

export function clearExplicitLanguageSelection(): void {
  explicitSessionLanguage = null;
  loginSelection = null;
  selectionPending = false;
  explicitGeneration++;
  languageSaveQueue.reset();
}

export function getExplicitSessionLanguage(): UserLanguage | null {
  return explicitSessionLanguage;
}

export { isPublicLocaleAuthoritativePath };

/**
 * Apply saved DB language after auth is known.
 * Skips public marketing URL routes and never overwrites a newer explicit selection.
 */
export async function applyDatabaseLanguagePreference(
  rawLanguage: unknown,
  isCurrentSession: () => boolean = () => true,
): Promise<void> {
  if (typeof window === "undefined" || selectionPending) return;
  if (isPublicLocaleAuthoritativePath(window.location.pathname || "/")) return;

  const generationAtStart = explicitGeneration;
  const pathname = window.location.pathname;
  const canApply = () => isCurrentSession() && generationAtStart === explicitGeneration && window.location.pathname === pathname;

  if (explicitSessionLanguage) {
    if (getCurrentLanguage() !== explicitSessionLanguage) {
      await changeLanguage(explicitSessionLanguage, canApply);
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
  if (fromDb) languageSaveQueue.confirm(fromDb);

  if (getCurrentLanguage() !== locale) await changeLanguage(locale, canApply);
}

/** UI selection is applied before queued account persistence. */
export async function persistAuthenticatedLanguage(
  lang: UserLanguage,
  accountId?: string,
): Promise<{ ok: boolean }> {
  if (!accountId) return { ok: true };
  return { ok: await languageSaveQueue.enqueue(lang, accountId) };
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
  clearExplicitLanguageSelection();
}
