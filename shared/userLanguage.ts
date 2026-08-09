/**
 * Authenticated user language preference — shared validation helpers.
 * Public marketing URL locales remain separate (see localeRoutes / marketingLocaleRouting).
 */

export const SUPPORTED_USER_LANGUAGES = ["en", "es", "he"] as const;
export type UserLanguage = (typeof SUPPORTED_USER_LANGUAGES)[number];

export function isSupportedUserLanguage(value: unknown): value is UserLanguage {
  return value === "en" || value === "es" || value === "he";
}

/** Normalize DB / request / browser values to en|es|he, or null if invalid. */
export function normalizeUserLanguage(value: unknown): UserLanguage | null {
  if (typeof value !== "string") return null;
  const base = value.trim().toLowerCase().split("-")[0];
  if (isSupportedUserLanguage(base)) return base;
  return null;
}
