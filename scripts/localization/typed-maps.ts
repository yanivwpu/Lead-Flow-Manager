import { HOMEPAGE_CONTENT_EN } from "../../shared/homepageContent";
import { HOMEPAGE_LOCALES } from "../../shared/homepageLocales";
import { ALL_PRODUCT_PAGES } from "../../shared/productPages";
import { PRODUCT_PAGE_LOCALES } from "../../shared/productPageLocales";
import { ALL_SOLUTION_PAGES } from "../../shared/solutionPages";
import { SOLUTION_PAGE_LOCALES } from "../../shared/solutionPageLocales";
import { MARKETING_NAV_LOCALES } from "../../shared/marketingNavLocales";
import { MARKETING_NAV_DROPDOWNS } from "../../shared/marketingNav";
import { PRICING_PAGE_CONTENT_EN } from "../../shared/pricingPageContent";
import { PRICING_PAGE_LOCALES } from "../../shared/pricingPageLocales";

export default function checkMaps() {
  const missing: string[] = [];
  function check(english: unknown, local: unknown, field: string) {
    if (typeof english === "string" && (!english || typeof local === "string" && local.trim())) return;
    if (english == null) return;
    if (local == null || typeof english !== typeof local) {
      missing.push(field);
      return;
    }
    // Editorial lists can have a different number/order of items across locales.
    if (Array.isArray(english)) {
      if (!Array.isArray(local) || (english.length && !local.length)) missing.push(field);
      return;
    }
    if (typeof english === "object") {
      for (const [name, value] of Object.entries(english)) {
        if (["id", "path", "href", "primaryCtaHref"].includes(name)) continue;
        check(value, (local as Record<string, unknown>)[name], `${field}.${name}`);
      }
    }
  }
  for (const lang of ["he", "es"] as const) {
    check(HOMEPAGE_CONTENT_EN, HOMEPAGE_LOCALES[lang], `homepage:${lang}`);
    check(MARKETING_NAV_DROPDOWNS, MARKETING_NAV_LOCALES[lang], `navigation:${lang}`);
    check(PRICING_PAGE_CONTENT_EN, PRICING_PAGE_LOCALES[lang], `pricing:${lang}`);
    for (const page of ALL_PRODUCT_PAGES) {
      check(page, (PRODUCT_PAGE_LOCALES[lang] as Record<string, unknown>)[page.path], `product:${lang}:${page.path}`);
    }
    for (const page of ALL_SOLUTION_PAGES) {
      check(page, (SOLUTION_PAGE_LOCALES[lang] as Record<string, unknown>)[page.path], `solution:${lang}:${page.path}`);
    }
  }
  return missing;
}
