/**
 * Phase 1 public marketing localization coverage.
 * Run: npx tsx tests/phase1-marketing-i18n.test.ts
 */
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ALL_PRODUCT_PAGES } from "../shared/productPages";
import { ALL_SOLUTION_PAGES } from "../shared/solutionPages";
import {
  getLocalizedProductPage,
  getLocalizedSolutionPage,
  getLocalizedMarketingNav,
  getMarketingChrome,
} from "../shared/localizeMarketingContent";
import { PRODUCT_PAGE_LOCALES } from "../shared/productPageLocales";
import { SOLUTION_PAGE_LOCALES } from "../shared/solutionPageLocales";
import { PAGE_META, generateMarketingPageSsrHtml } from "../server/seo";

const BRAND_ALLOWLIST = [
  "WhachatCRM",
  "Prospect AI",
  "AI Brain",
  "AI Copilot",
  "Realtor Growth Engine",
  "Growth Engines",
  "Unified Inbox",
  "Chatbot Builder",
  "WhatsApp",
  "Instagram",
  "Facebook",
  "Gmail",
  "Stripe",
  "Calendly",
  "Shopify",
  "GoHighLevel",
  "Meta",
  "MLS",
  "SMS",
  "Telegram",
  "CRM",
  "API",
];

const FORBIDDEN = ["Cerebro IA", "מוח AI", "Motor de Crecimiento Inmobiliario"];

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "href" || k === "path" || k.endsWith("Key") || k === "themeId") continue;
      collectStrings(v, out);
    }
  }
  return out;
}

function assertNoForbidden(label: string, strings: string[]) {
  for (const s of strings) {
    for (const bad of FORBIDDEN) {
      assert.ok(!s.includes(bad), `${label} contains forbidden "${bad}": ${s.slice(0, 80)}`);
    }
  }
}

function assertNotIdenticalToEnglish(label: string, localized: string, english: string) {
  if (!english.trim() || english.length < 12) return;
  if (BRAND_ALLOWLIST.some((b) => english === b || localized === b)) return;
  if (/^https?:\/\//.test(english) || english.startsWith("/")) return;
  assert.notEqual(
    localized.trim(),
    english.trim(),
    `${label} still English: ${english.slice(0, 60)}`,
  );
}

for (const locale of ["es", "he"] as const) {
  for (const product of ALL_PRODUCT_PAGES) {
    assert.ok(PRODUCT_PAGE_LOCALES[locale][product.path], `${locale} overlay ${product.path}`);
    const localized = getLocalizedProductPage(product, locale);
    assert.equal(localized.path, product.path);
    assert.equal(localized.themeId, product.themeId);
    const strings = collectStrings(localized);
    assertNoForbidden(`${locale} ${product.path}`, strings);
    assert.notEqual(localized.h1, product.h1, `${locale} ${product.path} h1 translated`);
    assert.notEqual(localized.heroIntro, product.heroIntro, `${locale} ${product.path} intro`);
  }

  for (const solution of ALL_SOLUTION_PAGES) {
    assert.ok(SOLUTION_PAGE_LOCALES[locale][solution.path], `${locale} overlay ${solution.path}`);
    const localized = getLocalizedSolutionPage(solution, locale);
    assert.equal(localized.path, solution.path);
    assert.notEqual(localized.h1, solution.h1, `${locale} ${solution.path} h1`);
    assertNoForbidden(`${locale} ${solution.path}`, collectStrings(localized));
  }

  const nav = getLocalizedMarketingNav(locale);
  assert.equal(nav.length, 3);
  assert.notEqual(nav[0].label, "Product");
  assert.notEqual(nav[1].label, "Solutions");
  assert.notEqual(nav[2].label, "Resources");
  for (const d of nav) {
    for (const g of d.groups) {
      for (const item of g.items) {
        assert.ok(item.href.startsWith("/"), `nav href ${item.href}`);
        assertNoForbidden(`nav ${locale}`, [item.description, g.title, d.label]);
      }
    }
  }

  const chrome = getMarketingChrome(locale);
  assert.notEqual(chrome.startFreeTrial, "Start Free Trial");
  assert.notEqual(chrome.bookDemo, "Book a Demo");
}

// English SSR bodies + metadata unchanged for product routes
for (const product of ALL_PRODUCT_PAGES) {
  const meta = PAGE_META[product.path];
  assert.ok(meta);
  assert.equal(meta.title, product.title);
  assert.equal(meta.description, product.metaDescription);
  assert.equal(meta.canonical, `https://www.whachatcrm.com${product.path}`);
  const html = generateMarketingPageSsrHtml(product.path);
  assert.ok(html);
  assert.match(html!, new RegExp(`<h1>${product.h1.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</h1>`));
}

// Pre-React language boot prefers whachatcrm_language
const indexHtml = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../client/index.html"),
  "utf8",
);
assert.match(indexHtml, /whachatcrm_language/);
assert.match(indexHtml, /i18nextLng/);
assert.ok(
  indexHtml.indexOf("whachatcrm_language") < indexHtml.indexOf("i18nextLng"),
  "whachatcrm_language must be read before i18nextLng fallback",
);

// Sitemap unchanged (English paths only — no /es/ or /he/)
const sitemap = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../client/public/sitemap.xml"),
  "utf8",
);
assert.doesNotMatch(sitemap, /\/es\//);
assert.doesNotMatch(sitemap, /\/he\//);
assert.doesNotMatch(sitemap, /hreflang/);

console.log(
  `PASS phase1-marketing-i18n.test.ts (${ALL_PRODUCT_PAGES.length} products, ${ALL_SOLUTION_PAGES.length} solutions × es/he)`,
);
