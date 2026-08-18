/**
 * Phase 2: locale routes, Pricing content completeness, SEO helpers.
 * Run: npx tsx --test tests/phase2-locale-seo.test.ts tests/pricing-page-i18n.test.ts tests/locale-routes.test.ts
 *
 * Why Phase 1 missed Pricing English leakage:
 * phase1-marketing-i18n.test.ts checked product/solution overlay key coverage and
 * locale JSON presence — not the rendered Pricing content model. Pricing UI still
 * read hardcoded English from Pricing.tsx, PricingMarketingSections.tsx, and
 * pricingEntitlements.ts, so translating orphaned pricingPage.* keys never surfaced.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "fs";
import path from "path";
import {
  getCanonicalUrl,
  getHreflangLinks,
  hasLocalizedVersion,
  isLocaleRootRedirect,
  isMarketingLocalePrefix,
  localizePath,
  localizedInternalHref,
  parseLocalizedPath,
  PHASE2_LOCALIZED_PATHS,
  stripLocalePrefix,
} from "../shared/localeRoutes";
import {
  buildLocalizedPricingCompareRows,
  getLocalizedAiBrainAddonHighlights,
  getLocalizedPlanPricingHighlights,
  getLocalizedPricingPage,
} from "../shared/localizeMarketingContent";
import { assertPhase2MetaCoverage, getLocalizedPageMeta } from "../shared/marketingPageMetaLocales";
import {
  generateMarketingPageSsrHtml,
  injectPageMeta,
  getLocalizedMarketingRoutes,
} from "../server/seo";
import { shouldServeSpaFallback } from "../server/spaRouting";

const NARROW_ALLOWLIST = [
  "WhachatCRM",
  "AI Brain",
  "AI Copilot",
  "Prospect AI",
  "WhatsApp",
  "WhatsApp Business",
  "Instagram",
  "Facebook Messenger",
  "Facebook",
  "Messenger",
  "Gmail",
  "Shopify",
  "Stripe",
  "Free",
  "Starter",
  "Pro",
  "Telegram",
  "TikTok",
  "SMS",
  "Meta",
  "CRM",
  "API",
  "NEW",
  "NUEVO",
  "Unified Inbox",
  "Growth Engines",
  "Growth Engine",
  "Realtor Growth Engine",
  "MLS",
];

const ENGLISH_SENTENCE =
  /\b(the|and|with|your|for|from|that|this|every|when|more|only|into|across|without|before|after)\b(?:\s+\b[a-zA-Z']+\b){3,}/i;

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
    for (const v of Object.values(value as Record<string, unknown>)) collectStrings(v, out);
  }
  return out;
}

function isAllowlisted(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (/^[\d$€£.,/%+\-\s]+$/.test(t)) return true;
  if (NARROW_ALLOWLIST.some((b) => t === b || t.includes(b) && t.replace(new RegExp(b, "g"), "").trim().length < 3)) {
    // pure brand / nearly pure brand
    const stripped = NARROW_ALLOWLIST.reduce((acc, b) => acc.split(b).join(" "), t).replace(/[:\-—,./]/g, " ").trim();
    if (!stripped || /^[\d$€£.,/%+\-\s]+$/.test(stripped)) return true;
  }
  return NARROW_ALLOWLIST.includes(t);
}

test("locale route parsing and generation", () => {
  assert.equal(isMarketingLocalePrefix("es"), true);
  assert.equal(isMarketingLocalePrefix("fr"), false);
  assert.deepEqual(parseLocalizedPath("/es/ai-brain"), {
    locale: "es",
    englishPath: "/ai-brain",
    isLocalePrefixed: true,
    isSupported: true,
  });
  assert.equal(parseLocalizedPath("/he/pricing").isSupported, true);
  assert.equal(parseLocalizedPath("/es/not-a-real-page").isSupported, false);
  assert.equal(parseLocalizedPath("/es/auth").isSupported, false);
  assert.equal(parseLocalizedPath("/fr/ai-brain").isSupported, false);
  assert.equal(localizePath("/ai-brain", "es"), "/es/ai-brain");
  assert.equal(localizePath("/", "he"), "/he/");
  assert.equal(localizePath("/blog", "es"), null);
  assert.equal(hasLocalizedVersion("/pricing"), true);
  assert.equal(hasLocalizedVersion("/wati-alternative"), false);
  assert.equal(stripLocalePrefix("/he/solutions/ecommerce"), "/solutions/ecommerce");
  assert.equal(isLocaleRootRedirect("/es"), true);
  assert.equal(isLocaleRootRedirect("/es/"), false);
  assert.equal(localizedInternalHref("/ai-copilot", "es"), "/es/ai-copilot");
  assert.equal(localizedInternalHref("/auth", "es"), "/auth");
  assert.equal(localizedInternalHref("/help", "he"), "/help");
});

test("canonical and hreflang clusters", () => {
  const cluster = getHreflangLinks("/ai-brain");
  assert.equal(cluster.length, 4);
  assert.equal(cluster.find((c) => c.hreflang === "x-default")?.href, "https://www.whachatcrm.com/ai-brain");
  assert.equal(getCanonicalUrl("/ai-brain", "es"), "https://www.whachatcrm.com/es/ai-brain");
  assert.equal(getCanonicalUrl("/", "he"), "https://www.whachatcrm.com/he/");
  assert.equal(getHreflangLinks("/blog").length, 0);
});

test("spa fallback rejects unsupported localized paths", () => {
  const routes = [...PHASE2_LOCALIZED_PATHS.map(String), ...getLocalizedMarketingRoutes()];
  assert.equal(shouldServeSpaFallback("/es/ai-brain", routes), true);
  assert.equal(shouldServeSpaFallback("/he/pricing", routes), true);
  assert.equal(shouldServeSpaFallback("/es/not-a-real-page", routes), false);
  assert.equal(shouldServeSpaFallback("/fr/ai-brain", routes), false);
  assert.equal(shouldServeSpaFallback("/es/auth", routes), false);
  assert.equal(shouldServeSpaFallback("/he/blog", routes), false);
  assert.equal(shouldServeSpaFallback("/app/inbox", routes), true);
});

test("localized meta coverage for all Phase 2 paths", () => {
  const missing = assertPhase2MetaCoverage();
  assert.deepEqual(missing, []);
  for (const p of PHASE2_LOCALIZED_PATHS) {
    for (const locale of ["es", "he"] as const) {
      const meta = getLocalizedPageMeta(p, locale)!;
      assert.ok(meta.title.length > 10, `${locale} ${p} title`);
      assert.ok(meta.description.length > 40, `${locale} ${p} description`);
    }
  }
});

test("localized SSR bodies are not English fallbacks", () => {
  const es = generateMarketingPageSsrHtml("/es/ai-brain");
  const he = generateMarketingPageSsrHtml("/he/ai-brain");
  const en = generateMarketingPageSsrHtml("/ai-brain");
  assert.ok(es && he && en);
  assert.notEqual(es, en);
  assert.notEqual(he, en);
  assert.ok(!es!.includes("Teach WhachatCRM your business profile"), "ES SSR should not use English hero fallback verbatim");
  const esPricing = generateMarketingPageSsrHtml("/es/pricing");
  const hePricing = generateMarketingPageSsrHtml("/he/pricing");
  assert.ok(esPricing?.includes("Precios de WhachatCRM"));
  assert.ok(hePricing?.includes("מחירי WhachatCRM"));
});

test("injectPageMeta sets lang/dir and self canonical for localized routes", () => {
  const shell = `<!DOCTYPE html><html lang="en"><head><title>Old</title><meta name="description" content="x" /><link rel="canonical" href="https://www.whachatcrm.com/ai-brain" /></head><body></body></html>`;
  const es = injectPageMeta(shell, "/es/ai-brain");
  assert.match(es, /<html lang="es" dir="ltr">/);
  assert.match(es, /rel="canonical" href="https:\/\/www\.whachatcrm\.com\/es\/ai-brain"/);
  assert.match(es, /hreflang="he"/);
  assert.match(es, /hreflang="x-default"/);
  const he = injectPageMeta(shell, "/he/pricing");
  assert.match(he, /<html lang="he" dir="rtl">/);
  assert.match(he, /rel="canonical" href="https:\/\/www\.whachatcrm\.com\/he\/pricing"/);
});

test("Pricing content model fully localized for es and he", () => {
  const en = getLocalizedPricingPage("en");
  for (const locale of ["es", "he"] as const) {
    const content = getLocalizedPricingPage(locale);
    assert.notEqual(content.transparent.title, en.transparent.title);
    assert.notEqual(content.prospectAi.title, en.prospectAi.title);
    assert.notEqual(content.whyChoose.title, en.whyChoose.title);
    assert.notEqual(content.compareTitle, en.compareTitle);
    assert.notEqual(content.faq.title, en.faq.title);
    assert.notEqual(content.bottomCta.title, en.bottomCta.title);
    assert.equal(content.faq.items.length, en.faq.items.length);
    assert.ok(content.faq.items.length >= 7);
    for (let i = 0; i < content.faq.items.length; i++) {
      assert.notEqual(content.faq.items[i]!.q, en.faq.items[i]!.q);
      assert.notEqual(content.faq.items[i]!.a, en.faq.items[i]!.a);
    }
    for (const key of Object.keys(en.compareLabels)) {
      if (NARROW_ALLOWLIST.includes(en.compareLabels[key]!)) continue;
      assert.notEqual(content.compareLabels[key], en.compareLabels[key], `${locale} compare ${key}`);
    }
    const highlights = getLocalizedPlanPricingHighlights("starter", locale).join(" | ");
    assert.notEqual(highlights, getLocalizedPlanPricingHighlights("starter", "en").join(" | "));
    const rows = buildLocalizedPricingCompareRows({}, locale);
    const channels = rows.find((r) => r.featureKey === "supportedChannels");
    assert.notEqual(channels?.free, "Connected channels");
    const brain = getLocalizedAiBrainAddonHighlights(locale);
    assert.notEqual(brain[0], en.aiBrain.highlights[0]);

    const strings = collectStrings(content);
    for (const s of strings) {
      if (isAllowlisted(s)) continue;
      if (s.length < 24) continue;
      assert.ok(
        !ENGLISH_SENTENCE.test(s),
        `${locale} still looks English: ${s.slice(0, 90)}`,
      );
    }
  }
});

test("sitemap includes localized URLs and xhtml namespace", () => {
  const xml = fs.readFileSync(path.join(process.cwd(), "client/public/sitemap.xml"), "utf8");
  assert.ok(xml.includes("xmlns:xhtml"));
  assert.ok(xml.includes("https://www.whachatcrm.com/es/pricing"));
  assert.ok(xml.includes("https://www.whachatcrm.com/he/ai-brain"));
  assert.ok(xml.includes("https://www.whachatcrm.com/es/"));
  assert.ok(xml.includes("https://www.whachatcrm.com/he/"));
  assert.ok(!xml.includes("https://www.whachatcrm.com/es</loc>"));
  assert.ok(!xml.includes("https://www.whachatcrm.com/he</loc>"));
  assert.ok(!xml.includes("/es/auth"));
  assert.ok(xml.includes('hreflang="x-default"'));
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const es = locs.filter((l) => /\/es(\/|$)/.test(l.replace("https://www.whachatcrm.com", ""))).length;
  const he = locs.filter((l) => /\/he(\/|$)/.test(l.replace("https://www.whachatcrm.com", ""))).length;
  assert.equal(es, PHASE2_LOCALIZED_PATHS.length);
  assert.equal(he, PHASE2_LOCALIZED_PATHS.length);
});
