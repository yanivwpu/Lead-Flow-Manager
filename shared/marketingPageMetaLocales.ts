/**
 * Spanish / Hebrew metadata overlays for Phase 2 scoped marketing routes.
 * English titles/descriptions remain in server/seo.ts PAGE_META (and homepage helpers).
 */

import type { MarketingLocale } from "./marketingLocale";
import { PHASE2_LOCALIZED_PATHS } from "./localeRoutes";
import { getLocalizedPricingPage } from "./localizeMarketingContent";
import { getLocalizedProductPage } from "./localizeMarketingContent";
import { getLocalizedSolutionPage } from "./localizeMarketingContent";
import { PROSPECT_AI_LANDING_LOCALES } from "./prospectAiLandingLocales";
import { RGE_LANDING_LOCALES } from "./realtorGrowthEngineLandingLocales";
import { getProductByPath } from "./productPages";
import { getSolutionByPath } from "./solutionPages";

export type LocalizedPageMeta = {
  title: string;
  description: string;
};

const HOME_META: Record<"es" | "he", LocalizedPageMeta> = {
  es: {
    title: "WhachatCRM | Equipo de ventas con IA y mensajería multicanal",
    description:
      "WhachatCRM ayuda a encontrar y calificar prospectos, gestionar conversaciones en WhatsApp y otros canales, personalizar el siguiente paso con IA y convertir más chats en ingresos.",
  },
  he: {
    title: "WhachatCRM | צוות מכירות AI ומסרים רב-ערוציים",
    description:
      "WhachatCRM עוזר למצוא ולסנן לידים, לנהל שיחות ב-WhatsApp ובערוצים נוספים, להתאים אישית את הצעד הבא עם AI ולהמיר יותר שיחות להכנסות.",
  },
};

function clipDescription(text: string, max = 158): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const sliced = clean.slice(0, max);
  const lastSpace = sliced.lastIndexOf(" ");
  return `${(lastSpace > 80 ? sliced.slice(0, lastSpace) : sliced).trim()}…`;
}

export function getLocalizedPageMeta(
  englishPath: string,
  locale: MarketingLocale,
): LocalizedPageMeta | null {
  if (locale === "en") return null;
  if (englishPath === "/") return HOME_META[locale];
  if (englishPath === "/pricing") {
    const p = getLocalizedPricingPage(locale).seo;
    return { title: p.title, description: p.description };
  }
  if (englishPath === "/prospect-ai") {
    const seo = PROSPECT_AI_LANDING_LOCALES[locale].seo;
    return { title: seo.title, description: seo.description };
  }
  if (englishPath === "/realtor-growth-engine") {
    const seo = RGE_LANDING_LOCALES[locale].seo;
    return { title: seo.title, description: seo.description };
  }
  const product = getProductByPath(englishPath);
  if (product) {
    const localized = getLocalizedProductPage(product, locale);
    return {
      title: `${localized.h1} | WhachatCRM`,
      description: clipDescription(localized.heroIntro),
    };
  }
  const solution = getSolutionByPath(englishPath);
  if (solution) {
    const localized = getLocalizedSolutionPage(solution, locale);
    return {
      title: `${localized.h1} | WhachatCRM`,
      description: clipDescription(localized.heroIntro),
    };
  }
  return null;
}

/** Ensure every Phase 2 path has es/he meta resolvable. */
export function assertPhase2MetaCoverage(): string[] {
  const missing: string[] = [];
  for (const path of PHASE2_LOCALIZED_PATHS) {
    for (const locale of ["es", "he"] as const) {
      if (!getLocalizedPageMeta(path, locale)) {
        missing.push(`${locale}:${path}`);
      }
    }
  }
  return missing;
}
