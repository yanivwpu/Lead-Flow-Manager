import { formatDistanceToNow } from "date-fns";
import { enUS, es, he } from "date-fns/locale";
import { normalizeUserLanguage } from "@shared/userLanguage";

const regions = { en: "en-US", he: "he-IL", es: "es-419" } as const;
const dateLocales = { en: enUS, he, es } as const;

export function formattingLocale(language: string) {
  return regions[normalizeUserLanguage(language) ?? "en"];
}

export function datePickerLocale(language: string) {
  return dateLocales[normalizeUserLanguage(language) ?? "en"];
}

export function formatRegionalDate(
  value: Date | number,
  language: string,
  options: Intl.DateTimeFormatOptions,
) {
  if (!Number.isFinite(Number(value))) return "—";
  return new Intl.DateTimeFormat(formattingLocale(language), options).format(value);
}

export function formatRegionalNumber(
  value: number,
  language: string,
  options?: Intl.NumberFormatOptions,
) {
  return new Intl.NumberFormat(formattingLocale(language), options).format(value);
}

export function formatRegionalRelativeTime(value: Date, language: string) {
  if (!Number.isFinite(value.getTime())) return "—";
  return formatDistanceToNow(value, { addSuffix: true, locale: datePickerLocale(language) });
}
