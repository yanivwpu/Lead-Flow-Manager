/**
 * Server-owned first-turn replies for trusted page-rule actions.
 * Localized by display locale. Never uses action labels as visitor names.
 */

import { isTrustedCalendlySchedulingUrl } from "./verifiedBookingUrl";
import { normalizeWidgetStaticLocale } from "./webchatWidgetLocale";

const BOOK_DEMO_INVITE = {
  en: "Happy to book a live demo.",
  es: "Con gusto agendamos una demo.",
  he: "נשמח לקבוע הדגמה.",
} as const;

const FIND_SOLUTION_QUESTION = {
  en: "What type of business do you run, and what's the main problem you want to solve first?",
  es: "¿Qué tipo de negocio tienes y cuál es el principal problema que quieres resolver primero?",
  he: "איזה סוג עסק יש לכם, ומה הבעיה העיקרית שחשוב לפתור קודם?",
} as const;

export function trustedPageRuleBookDemoReply(
  locale: string | null | undefined,
  verifiedUrl: string,
): string | null {
  if (!isTrustedCalendlySchedulingUrl(verifiedUrl)) return null;
  const lang = normalizeWidgetStaticLocale(locale);
  return `${BOOK_DEMO_INVITE[lang]}\n${verifiedUrl}`;
}

export function trustedPageRuleFindSolutionReply(locale: string | null | undefined): string {
  return FIND_SOLUTION_QUESTION[normalizeWidgetStaticLocale(locale)];
}
