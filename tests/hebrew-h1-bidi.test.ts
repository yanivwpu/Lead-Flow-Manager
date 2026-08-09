/**
 * Hebrew AI + RTL flex bidi layout (hero, generic card, comparison).
 * Run: npx tsx --test tests/hebrew-h1-bidi.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  formatHeadingHtmlWithLeadingLtrIsolate,
  formatHeGenericAiVsBrainHtml,
  HE_GENERIC_AI_VS_BRAIN,
  needsHebrewAiBidiLayout,
  needsLeadingLtrIsolate,
  splitHebrewAiBidiText,
  splitLeadingLtrBeforeHebrew,
} from "../shared/rtlLeadingLtrIsolate";
import { generateMarketingPageSsrHtml, injectPageMeta } from "../server/seo";
import { PRODUCT_PAGE_LOCALES } from "../shared/productPageLocales";
import { getLocalizedProductPage } from "../shared/localizeMarketingContent";
import { ALL_PRODUCT_PAGES } from "../shared/productPages";
import { getMarketingChrome } from "../shared/marketingChrome";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

test("AI + Hebrew splits into flex-ready aiHebrew segment; brands stay whole", () => {
  const he = "AI שמבין איך העסק שלכם עובד";
  assert.equal(needsHebrewAiBidiLayout(he), true);
  assert.deepEqual(splitHebrewAiBidiText(he), [
    { kind: "aiHebrew", ai: "AI", hebrew: "שמבין איך העסק שלכם עובד" },
  ]);

  const generic = "AI רגיל";
  assert.deepEqual(splitHebrewAiBidiText(generic), [
    { kind: "aiHebrew", ai: "AI", hebrew: "רגיל" },
  ]);

  const withBrand = "AI רגיל יכול. AI Brain מבין";
  const segs = splitHebrewAiBidiText(withBrand);
  assert.ok(segs.some((s) => s.kind === "aiHebrew" && s.hebrew.startsWith("רגיל")));
  assert.ok(segs.some((s) => s.kind === "brand" && s.text === "AI Brain"));
  assert.ok(!segs.some((s) => s.kind === "aiHebrew" && s.hebrew === "Brain"));

  const en = "AI That Understands How Your Business Works";
  assert.equal(needsHebrewAiBidiLayout(en), false);
  assert.equal(formatHeadingHtmlWithLeadingLtrIsolate(en, escapeHtmlText), en);

  const es = "IA que entiende cómo funciona tu negocio";
  assert.equal(needsHebrewAiBidiLayout(es), false);
});

test("SSR H1 uses RTL flex group with AI first (visual right in RTL)", () => {
  const html = formatHeadingHtmlWithLeadingLtrIsolate(
    "AI שמבין איך העסק שלכם עובד",
    escapeHtmlText,
  );
  assert.match(html, /dir="rtl"/);
  assert.match(html, /display:inline-flex/);
  assert.match(html, /<bdi dir="ltr">AI<\/bdi>/);
  assert.match(html, /<span> שמבין איך העסק שלכם עובד<\/span>/);
  // AI bdi appears before Hebrew span in DOM (RTL flex → AI on the right)
  assert.ok(html.indexOf("<bdi") < html.indexOf("שמבין"));
});

test("comparison heading HTML: brand, לעומת, AI רגיל in RTL flex order", () => {
  const html = formatHeGenericAiVsBrainHtml(escapeHtmlText);
  assert.match(html, /WhachatCRM AI Brain/);
  assert.match(html, /לעומת/);
  assert.match(html, /<bdi dir="ltr">AI<\/bdi><span> רגיל<\/span>/);
  assert.equal(HE_GENERIC_AI_VS_BRAIN.genericLabel, "רגיל");
  assert.equal(HE_GENERIC_AI_VS_BRAIN.vs, "לעומת");
  // DOM order: brand first (right), then vs, then generic pair
  const brandAt = html.indexOf("WhachatCRM AI Brain");
  const vsAt = html.indexOf("לעומת");
  const ragilAt = html.indexOf("רגיל");
  assert.ok(brandAt < vsAt && vsAt < ragilAt);
});

test("does not isolate mid-string Latin after Hebrew-only lead", () => {
  assert.equal(needsLeadingLtrIsolate("מחירי WhachatCRM"), false);
  assert.equal(needsHebrewAiBidiLayout("מחירי WhachatCRM"), false);
});

test("Hebrew AI Brain copy uses רגיל for generic label", () => {
  const brain = ALL_PRODUCT_PAGES.find((p) => p.path === "/ai-brain")!;
  const he = getLocalizedProductPage(brain, "he");
  assert.equal(he.h1, "AI שמבין איך העסק שלכם עובד");
  assert.equal(he.comparison?.leftTitle, "AI רגיל");
  assert.match(he.problemTitle, /AI רגיל/);
  assert.match(he.heroIntro, /^AI רגיל/);
  assert.match(getMarketingChrome("he").genericAiVsBrain, /AI רגיל/);
  assert.match(getMarketingChrome("he").genericAiVsBrain, /לעומת/);
  assert.equal(getLocalizedProductPage(brain, "es").h1, "IA que entiende cómo funciona tu negocio");
});

test("only AI Brain Hebrew product H1 needs AI+Hebrew layout among product locales", () => {
  const needing: string[] = [];
  for (const [pathKey, overlay] of Object.entries(PRODUCT_PAGE_LOCALES.he || {})) {
    if (overlay.h1 && needsHebrewAiBidiLayout(overlay.h1)) needing.push(pathKey);
  }
  assert.deepEqual(needing, ["/ai-brain"]);
});

test("Hebrew AI Brain SSR H1 uses flex bidi; EN/ES do not; one H1; meta intact", () => {
  const he = generateMarketingPageSsrHtml("/he/ai-brain")!;
  const es = generateMarketingPageSsrHtml("/es/ai-brain")!;
  const en = generateMarketingPageSsrHtml("/ai-brain")!;

  assert.match(he, /<h1>[\s\S]*<bdi dir="ltr">AI<\/bdi>[\s\S]*שמבין איך העסק שלכם עובד[\s\S]*<\/h1>/);
  assert.match(he, /display:inline-flex/);
  assert.equal((he.match(/<h1[\s>]/g) || []).length, 1);
  const h1Inner = he.match(/<h1>([\s\S]*?)<\/h1>/)?.[1] || "";
  assert.equal(h1Inner.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(), "AI שמבין איך העסק שלכם עובד");

  assert.match(es, /<h1>IA que entiende cómo funciona tu negocio<\/h1>/);
  assert.doesNotMatch(es, /inline-flex/);
  assert.match(en, /<h1>AI That Understands How Your Business Works<\/h1>/);

  const shell = `<!DOCTYPE html><html lang="en"><head><title>Old</title><meta name="description" content="x" /><link rel="canonical" href="https://www.whachatcrm.com/ai-brain" /></head><body><div id="root"></div></body></html>`;
  const html = injectPageMeta(shell, "/he/ai-brain").replace(
    '<div id="root"></div>',
    `<div id="root">${he}</div>`,
  );
  assert.match(html, /<html lang="he" dir="rtl">/);
  assert.match(html, /rel="canonical" href="https:\/\/www\.whachatcrm\.com\/he\/ai-brain"/);
  assert.match(html, /hreflang="es"/);
});

test("ProductPage wires flex bidi for H1, leftTitle, comparison, problemTitle", () => {
  const productPage = fs.readFileSync(
    path.join(root, "client/src/components/marketing/ProductPage.tsx"),
    "utf8",
  );
  assert.match(productPage, /renderRtlAwareHeadingText\(content\.h1\)/);
  assert.match(productPage, /renderHeGenericAiVsBrainHeading/);
  assert.match(productPage, /comparison\.leftTitle/);
  assert.match(productPage, /problemTitle/);
  assert.doesNotMatch(productPage, /dangerouslySetInnerHTML/);

  const rtlComp = fs.readFileSync(
    path.join(root, "client/src/components/marketing/RtlAwareHeadingText.tsx"),
    "utf8",
  );
  assert.match(rtlComp, /flexDirection:\s*[\"']row[\"']/);
  assert.match(rtlComp, /dir="rtl"/);
  // Must not use Tailwind flex-row (RTL plugin flips it to row-reverse).
  assert.doesNotMatch(rtlComp, /className=\{?["'`][^"'`]*flex-row/);
});

test("splitLeadingLtrBeforeHebrew still available for leading AI H1", () => {
  const parts = splitLeadingLtrBeforeHebrew("AI שמבין איך העסק שלכם עובד");
  assert.equal(parts[0]?.kind, "ltrIsolate");
  assert.equal(parts[0] && "text" in parts[0] ? parts[0].text : "", "AI");
});
