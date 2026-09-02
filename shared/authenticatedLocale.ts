/**
 * Authenticated app locale precedence. Untrusted detector/localStorage values
 * must not override a missing DB preference.
 */

import { normalizeUserLanguage, type UserLanguage } from "./userLanguage";

export const LANGUAGE_CACHE_KEY = "whachatcrm_language";
export const LANGUAGE_SOURCE_KEY = "whachatcrm_language_source";
export const TRUSTED_LANGUAGE_SOURCE = "user";

export type AuthenticatedLocaleInputs = {
  explicitSessionLanguage: UserLanguage | null;
  userLanguage: unknown;
  cachedLanguage: unknown;
  languageSource: unknown;
  /** Ignored for authenticated resolution when the DB preference is missing. */
  i18nLanguage?: unknown;
};

export function isTrustedExplicitLanguageSource(source: unknown): boolean {
  return source === TRUSTED_LANGUAGE_SOURCE;
}

export function resolveAuthenticatedAppLocaleFromState(
  input: AuthenticatedLocaleInputs,
): UserLanguage {
  if (input.explicitSessionLanguage) return input.explicitSessionLanguage;
  const fromDb = normalizeUserLanguage(input.userLanguage);
  if (fromDb) return fromDb;
  if (isTrustedExplicitLanguageSource(input.languageSource)) {
    const trustedCache = normalizeUserLanguage(input.cachedLanguage);
    if (trustedCache) return trustedCache;
  }
  return "en";
}

export function shouldOverwriteUntrustedLanguageCache(input: AuthenticatedLocaleInputs): boolean {
  if (input.explicitSessionLanguage) return false;
  if (normalizeUserLanguage(input.userLanguage)) return false;
  if (isTrustedExplicitLanguageSource(input.languageSource)) return false;
  return normalizeUserLanguage(input.cachedLanguage) !== "en";
}

export function overwriteUntrustedLanguageCache(storage: {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}): void {
  storage.setItem(LANGUAGE_CACHE_KEY, "en");
  if (!isTrustedExplicitLanguageSource(storage.getItem(LANGUAGE_SOURCE_KEY))) {
    storage.removeItem(LANGUAGE_SOURCE_KEY);
  }
}
