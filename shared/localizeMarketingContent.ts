/**
 * Locale merge helpers for public marketing pages and chrome.
 * English base content stays authoritative; es/he overlays supply visible copy.
 */

import { mergeMarketingContent, normalizeMarketingLocale, type MarketingLocale } from "./marketingLocale";
import { PRODUCT_PAGE_LOCALES } from "./productPageLocales";
import type { ProductPageContent } from "./productPages";
import { SOLUTION_PAGE_LOCALES } from "./solutionPageLocales";
import type { SolutionPageContent } from "./solutionPages";

export { getMarketingChrome, PLATFORM_STORY_STEP_TEXT, BRAIN_CONSUMER_TEXT } from "./marketingChrome";
export { getLocalizedMarketingNav } from "./marketingNavLocales";
export {
  getLocalizedProspectAiContent,
  type LocalizedProspectAiLandingBundle,
  type ProspectAiLandingSeoOverlay,
} from "./prospectAiLandingLocales";
export {
  getLocalizedRgeLanding,
  type LocalizedRgeLandingBundle,
  type RgeLandingSeoOverlay,
  type RgeLandingUiOverlay,
} from "./realtorGrowthEngineLandingLocales";
export { normalizeMarketingLocale };
export type { MarketingLocale } from "./marketingLocale";

export function getLocalizedProductPage(
  page: ProductPageContent,
  locale: MarketingLocale,
): ProductPageContent {
  if (locale === "en") return page;
  const overlay = PRODUCT_PAGE_LOCALES[locale][page.path];
  if (!overlay) {
    throw new Error(`Missing ${locale} product page locale for ${page.path}`);
  }
  return mergeMarketingContent(page, overlay);
}

export function getLocalizedSolutionPage(
  page: SolutionPageContent,
  locale: MarketingLocale,
): SolutionPageContent {
  if (locale === "en") return page;
  const overlay = SOLUTION_PAGE_LOCALES[locale][page.path];
  if (!overlay) {
    throw new Error(`Missing ${locale} solution page locale for ${page.path}`);
  }
  return mergeMarketingContent(page, overlay);
}
