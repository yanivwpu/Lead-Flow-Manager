/**
 * Production-shaped page-rule fixtures for tests only.
 * Do not merge these into NEUTRAL_WIDGET_SETTINGS or any tenant default.
 */

import type { WidgetPageRuleMatchType } from "./webchatPageRuleMatch";

export const PRICING_PAGE_RULE_FIXTURE = {
  urlContains: "/pricing",
  matchType: "pathname" as WidgetPageRuleMatchType,
  greeting:
    "Comparing plans? I can help you choose between Free and Pro, estimate savings from your current platform, or book a demo.",
  prefilledMessage: "",
  suggestedQuestions: ["Compare Free & Pro", "Calculate my savings", "Book a demo"],
  localized: {
    en: {
      greeting:
        "Comparing plans? I can help you choose between Free and Pro, estimate savings from your current platform, or book a demo.",
      suggestedQuestions: ["Compare Free & Pro", "Calculate my savings", "Book a demo"],
    },
    es: {
      greeting:
        "¿Comparando planes? Puedo ayudarte a elegir entre Free y Pro, estimar el ahorro frente a tu plataforma actual o reservar una demo.",
      suggestedQuestions: ["Comparar Free y Pro", "Calcular mi ahorro", "Reservar una demo"],
    },
    he: {
      greeting:
        "משווים תוכניות? אפשר לעזור לבחור בין Free ל-Pro, להעריך חיסכון מול הפלטפורמה הנוכחית או לקבוע הדגמה.",
      suggestedQuestions: ["השוואת Free ו-Pro", "חישוב החיסכון שלי", "קביעת הדגמה"],
    },
  },
} as const;

export const PRICING_PAGE_RULE_ACTION = {
  compare: 0,
  savings: 1,
  bookDemo: 2,
} as const;
