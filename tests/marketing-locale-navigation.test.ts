/**
 * Public marketing locale navigation + URL precedence regressions.
 * Run: npx tsx --test tests/marketing-locale-navigation.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  hasLocalizedVersion,
  isPublicLocaleAuthoritativePath,
  localizePath,
  localizedInternalHref,
  parseLocalizedPath,
  getCanonicalUrl,
  getHreflangLinks,
} from "../shared/localeRoutes";
import { marketingLanguageTargetPath } from "../client/src/lib/marketingLocaleRouting";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

test("logo/home destinations follow current URL locale", () => {
  assert.equal(localizePath("/", parseLocalizedPath("/es/pricing").locale), "/es/");
  assert.equal(localizePath("/", parseLocalizedPath("/he/ai-brain").locale), "/he/");
  assert.equal(localizePath("/", parseLocalizedPath("/pricing").locale) || "/", "/");
  assert.equal(localizedInternalHref("/", "es"), "/es/");
  assert.equal(localizedInternalHref("/", "he"), "/he/");
  assert.equal(localizedInternalHref("/", "en"), "/");
});

test("Product/Solution/Pricing internal links retain locale prefixes", () => {
  for (const locale of ["es", "he"] as const) {
    assert.equal(localizedInternalHref("/pricing", locale), `/${locale}/pricing`);
    assert.equal(localizedInternalHref("/ai-brain", locale), `/${locale}/ai-brain`);
    assert.equal(localizedInternalHref("/solutions/ecommerce", locale), `/${locale}/solutions/ecommerce`);
    assert.equal(localizedInternalHref("/prospect-ai", locale), `/${locale}/prospect-ai`);
  }
  assert.equal(localizedInternalHref("/pricing", "en"), "/pricing");
  assert.equal(localizedInternalHref("/ai-brain", "en"), "/ai-brain");
});

test("language selector navigates to equivalent localized routes", () => {
  assert.equal(marketingLanguageTargetPath("/pricing", "es"), "/es/pricing");
  assert.equal(marketingLanguageTargetPath("/es/pricing", "he"), "/he/pricing");
  assert.equal(marketingLanguageTargetPath("/he/ai-brain", "en"), "/ai-brain");
  assert.equal(marketingLanguageTargetPath("/es/", "en"), "/");
  assert.equal(marketingLanguageTargetPath("/", "he"), "/he/");
  // E: English → Spanish → Hebrew → English on same product page
  let p = "/ai-brain";
  p = marketingLanguageTargetPath(p, "es");
  assert.equal(p, "/es/ai-brain");
  p = marketingLanguageTargetPath(p, "he");
  assert.equal(p, "/he/ai-brain");
  p = marketingLanguageTargetPath(p, "en");
  assert.equal(p, "/ai-brain");
});

test("URL is authoritative: storage cannot redefine Phase 2 locale helpers", () => {
  // Pure helpers ignore localStorage — URL parse alone decides.
  assert.equal(parseLocalizedPath("/pricing").locale, "en");
  assert.equal(parseLocalizedPath("/").locale, "en");
  assert.equal(parseLocalizedPath("/es/pricing").locale, "es");
  assert.equal(parseLocalizedPath("/he/ai-brain").locale, "he");
  assert.equal(isPublicLocaleAuthoritativePath("/pricing"), true);
  assert.equal(isPublicLocaleAuthoritativePath("/es/pricing"), true);
  assert.equal(hasLocalizedVersion("/pricing"), true);
});

test("MarketingHeader derives links from URL locale, not i18n.language", () => {
  const header = read("client/src/components/marketing/MarketingHeader.tsx");
  assert.match(header, /useMarketingUrlLocale/);
  assert.match(header, /homeHref/);
  assert.match(header, /data-testid="marketing-logo-home"/);
  assert.doesNotMatch(header, /normalizeMarketingLocale\(i18n\.language/);
  assert.doesNotMatch(header, /getCurrentLanguage\(\)/);
});

test("ProductPage and SolutionPage use URL locale for chrome links", () => {
  const product = read("client/src/components/marketing/ProductPage.tsx");
  const solution = read("client/src/components/marketing/SolutionPage.tsx");
  assert.match(product, /useMarketingUrlLocale/);
  assert.match(solution, /useMarketingUrlLocale/);
  assert.doesNotMatch(product, /normalizeMarketingLocale\(i18n\.language/);
  assert.doesNotMatch(solution, /normalizeMarketingLocale\(i18n\.language/);
});

test("Pricing back-home and Prospect AI logo preserve URL locale", () => {
  const pricing = read("client/src/pages/Pricing.tsx");
  assert.match(pricing, /useLocalizedHref\("\/"\)|useLocalizedHref\('\/'\)/);
  assert.match(pricing, /homeHref/);
  assert.match(pricing, /data-testid="pricing-back-home"/);
  assert.doesNotMatch(pricing, /href=\{user \? "\/app\/settings" : "\/"\}/);

  const prospect = read("client/src/pages/ProspectAiLanding.tsx");
  assert.match(prospect, /useLocalizedHref\("\/"\)/);
  assert.match(prospect, /useLocalizedHref\("\/pricing"\)/);
  assert.match(prospect, /data-testid="prospect-ai-logo-home"/);
});

test("bootstrap forces i18n English on unprefixed Phase 2 (no stale es/he first paint)", () => {
  const boot = read("client/src/bootstrap.tsx");
  assert.match(boot, /hasLocalizedVersion/);
  assert.match(boot, /changeLanguage\("en"\)|changeLanguage\('en'\)/);
  assert.match(boot, /i18n\.language !== "en"/);
});

test("sync effect forces URL→i18n and never rewrites URL from storage", () => {
  const routing = read("client/src/lib/marketingLocaleRouting.ts");
  assert.match(routing, /useSyncLanguageFromMarketingUrl/);
  assert.match(routing, /changeLanguage\("en"\)/);
  assert.doesNotMatch(routing, /setLocation|navigate\(/);
  // Language selector still navigates only on explicit user change
  const sel = read("client/src/components/LanguageSelector.tsx");
  assert.match(sel, /marketingLanguageTargetPath/);
  assert.match(sel, /navigateOnChange/);
  assert.match(sel, /isPublicLocaleAuthoritativePath/);
});

test("auth DB language restore skips public marketing URLs", () => {
  const pref = read("client/src/lib/userLanguagePreference.ts");
  assert.match(pref, /isPublicLocaleAuthoritativePath/);
  assert.match(pref, /return;/);
  assert.equal(isPublicLocaleAuthoritativePath("/es/pricing"), true);
  assert.equal(isPublicLocaleAuthoritativePath("/app/inbox"), false);
});

test("canonicals and hreflang remain self-referencing per locale", () => {
  const host = "https://www.whachatcrm.com";
  assert.equal(getCanonicalUrl("/pricing", "en", host), `${host}/pricing`);
  assert.equal(getCanonicalUrl("/pricing", "es", host), `${host}/es/pricing`);
  assert.equal(getCanonicalUrl("/ai-brain", "he", host), `${host}/he/ai-brain`);
  const alts = getHreflangLinks("/pricing", host);
  assert.ok(alts.some((a) => a.hreflang === "en" && a.href.endsWith("/pricing")));
  assert.ok(alts.some((a) => a.hreflang === "es" && a.href.includes("/es/pricing")));
  assert.ok(alts.some((a) => a.hreflang === "he" && a.href.includes("/he/pricing")));
  assert.ok(alts.some((a) => a.hreflang === "x-default"));
});

test("no localStorage-based redirect helpers on public marketing routes", () => {
  const routing = read("client/src/lib/marketingLocaleRouting.ts");
  const boot = read("client/src/bootstrap.tsx");
  // May write localStorage to mirror URL, but must not redirect based on storage alone.
  assert.doesNotMatch(routing, /window\.location\.(href|replace|assign)/);
  assert.doesNotMatch(boot, /window\.location\.(href|replace|assign)/);
});
