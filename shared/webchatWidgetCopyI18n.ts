/**
 * Optional tenant-authored widget copy variants (en / es / he).
 * Fallback: locale-specific value → default custom value → built-in localized default.
 * Never machine-translates or overwrites existing custom English.
 */

import { sanitizePlainWidgetText, widgetTextContainsUnsafeMarkup } from "./webchatWidgetBranding";
import {
  isDefaultEnglishChromeText,
  normalizeWidgetStaticLocale,
  widgetChromeCopyForLocale,
  type WidgetStaticLocale,
} from "./webchatWidgetLocale";

export const WIDGET_COPY_I18N_LOCALES = ["en", "es", "he"] as const;
export type WidgetCopyI18nLocale = (typeof WIDGET_COPY_I18N_LOCALES)[number];

export type WidgetCopyI18nFields = {
  brandName?: string;
  panelHeading?: string;
  panelSubtitle?: string;
  launcherLabel?: string;
  teaserGreeting?: string;
  welcomeMessage?: string;
  inputPlaceholder?: string;
  offlineMessage?: string;
  ctaLabel?: string;
};

export type WidgetCopyI18nMap = Partial<Record<WidgetCopyI18nLocale, WidgetCopyI18nFields>>;

const LIMITS: Record<keyof WidgetCopyI18nFields, number> = {
  brandName: 80,
  panelHeading: 80,
  panelSubtitle: 80,
  launcherLabel: 40,
  teaserGreeting: 200,
  welcomeMessage: 500,
  inputPlaceholder: 80,
  offlineMessage: 200,
  ctaLabel: 80,
};

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function cleanField(raw: unknown, max: number): string {
  return sanitizePlainWidgetText(raw, max);
}

export function sanitizeWidgetCopyI18nFields(raw: unknown): WidgetCopyI18nFields {
  const o = asRecord(raw);
  const out: WidgetCopyI18nFields = {};
  (Object.keys(LIMITS) as Array<keyof WidgetCopyI18nFields>).forEach((key) => {
    const value = cleanField(o[key], LIMITS[key]);
    if (value) out[key] = value;
  });
  return out;
}

export function sanitizeWidgetCopyI18nMap(raw: unknown): WidgetCopyI18nMap {
  const o = asRecord(raw);
  const out: WidgetCopyI18nMap = {};
  for (const loc of WIDGET_COPY_I18N_LOCALES) {
    if (!o[loc]) continue;
    const fields = sanitizeWidgetCopyI18nFields(o[loc]);
    if (Object.keys(fields).length) out[loc] = fields;
  }
  return out;
}

export function widgetCopyI18nHasUnsafeMarkup(raw: unknown): boolean {
  const o = asRecord(raw);
  for (const loc of WIDGET_COPY_I18N_LOCALES) {
    const fields = asRecord(o[loc]);
    for (const key of Object.keys(LIMITS) as Array<keyof WidgetCopyI18nFields>) {
      if (widgetTextContainsUnsafeMarkup(fields[key])) return true;
    }
  }
  return false;
}

/**
 * Locale variant → default custom → built-in localized default.
 * Name-like fields never fall through to a translated built-in phrase.
 */
export function resolveTenantWidgetCopy(input: {
  locale: string | null | undefined;
  variant?: string | null;
  customDefault?: string | null;
  builtin?: string | null;
  nameLike?: boolean;
}): string {
  const variant = sanitizePlainWidgetText(input.variant, 500);
  if (variant) return variant;
  const custom = String(input.customDefault || "").trim();
  if (input.nameLike) return custom;
  if (custom && !isDefaultEnglishChromeText(custom)) return custom;
  const builtin = String(input.builtin || "").trim();
  if (builtin) return builtin;
  return custom;
}

export function applyTenantWidgetCopyI18n<T extends {
  welcomeMessage?: string;
  chatGreeting?: string;
  launcherLabel?: string;
  panelSubtitle?: string;
  teaserGreeting?: string;
  panelHeading?: string;
  brandName?: string;
  displayName?: string;
  ctaLabel?: string;
}>(
  presentation: T,
  locale: WidgetStaticLocale | string,
  localized: unknown,
  extras?: { inputPlaceholder?: string | null; offlineMessage?: string | null },
): T & { inputPlaceholder: string; offlineMessage: string } {
  const loc = normalizeWidgetStaticLocale(locale);
  const chrome = widgetChromeCopyForLocale(loc);
  const map = sanitizeWidgetCopyI18nMap(localized);
  const variant = map[loc] || {};

  const welcomeMessage = resolveTenantWidgetCopy({
    locale: loc,
    variant: variant.welcomeMessage,
    customDefault: presentation.welcomeMessage,
    builtin: chrome.welcomeMessage,
  });
  const teaserGreeting = resolveTenantWidgetCopy({
    locale: loc,
    variant: variant.teaserGreeting,
    customDefault: presentation.teaserGreeting,
    builtin: chrome.teaserGreeting,
  });
  const chatGreeting = resolveTenantWidgetCopy({
    locale: loc,
    variant: variant.welcomeMessage,
    customDefault: presentation.chatGreeting,
    builtin: chrome.welcomeMessage,
  });
  const brandName = resolveTenantWidgetCopy({
    locale: loc,
    variant: variant.brandName,
    customDefault: presentation.brandName,
    builtin: "",
    nameLike: true,
  });
  const panelHeading = resolveTenantWidgetCopy({
    locale: loc,
    variant: variant.panelHeading || variant.brandName,
    customDefault: presentation.panelHeading,
    builtin: "",
    nameLike: true,
  });
  const displayName = resolveTenantWidgetCopy({
    locale: loc,
    variant: variant.brandName,
    customDefault: presentation.displayName,
    builtin: "",
    nameLike: true,
  });

  return {
    ...presentation,
    welcomeMessage,
    chatGreeting,
    teaserGreeting,
    launcherLabel: resolveTenantWidgetCopy({
      locale: loc,
      variant: variant.launcherLabel,
      customDefault: presentation.launcherLabel,
      builtin: chrome.launcherLabel,
    }),
    panelSubtitle: resolveTenantWidgetCopy({
      locale: loc,
      variant: variant.panelSubtitle,
      customDefault: presentation.panelSubtitle,
      builtin: chrome.panelSubtitle,
    }),
    panelHeading: panelHeading || presentation.panelHeading,
    brandName: brandName || presentation.brandName,
    displayName: displayName || presentation.displayName,
    ctaLabel: resolveTenantWidgetCopy({
      locale: loc,
      variant: variant.ctaLabel,
      customDefault: presentation.ctaLabel,
      builtin: "",
      nameLike: true,
    }),
    inputPlaceholder: resolveTenantWidgetCopy({
      locale: loc,
      variant: variant.inputPlaceholder,
      customDefault: extras?.inputPlaceholder,
      builtin: chrome.inputPlaceholder,
    }),
    offlineMessage: resolveTenantWidgetCopy({
      locale: loc,
      variant: variant.offlineMessage,
      customDefault: extras?.offlineMessage,
      builtin: chrome.chatUnavailable,
    }),
  };
}

export function resolveLocalizedPageRuleGreeting(input: {
  locale: string | null | undefined;
  greeting?: string | null;
  localized?: unknown;
  fallback?: string | null;
}): string {
  const loc = normalizeWidgetStaticLocale(input.locale);
  const map = asRecord(input.localized);
  const variant = sanitizePlainWidgetText(asRecord(map[loc]).greeting, 500);
  return resolveTenantWidgetCopy({
    locale: loc,
    variant,
    customDefault: input.greeting,
    builtin: input.fallback || "",
  });
}

export function firstUnsafeLocalizedWidgetCopyField(raw: unknown): string | null {
  if (widgetCopyI18nHasUnsafeMarkup(raw)) return "localized";
  return null;
}
