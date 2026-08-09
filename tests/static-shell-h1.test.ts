/**
 * Complete initial HTTP HTML: exactly one route H1; no crawlable English static-shell H1
 * on non-home or localized marketing routes.
 *
 * Run: npx tsx --test tests/static-shell-h1.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "fs";
import path from "path";
import {
  generateHomepageHtml,
  generateMarketingPageSsrHtml,
  getLocalizedMarketingRoutes,
  getMarketingRoutes,
  injectHomepageSeoMeta,
  injectLocalizedStaticShell,
  injectNoindexMeta,
  injectPageMeta,
  removeStaticShellFromHtml,
} from "../server/seo";
import { getLocalizedHomepage } from "../shared/localizeMarketingContent";
import { getLocalizedProductPage } from "../shared/localizeMarketingContent";
import { getLocalizedPricingPage } from "../shared/localizeMarketingContent";
import { getLocalizedSolutionPage } from "../shared/localizeMarketingContent";
import { getProductByPath } from "../shared/productPages";
import { getSolutionByPath } from "../shared/solutionPages";
import { PHASE2_LOCALIZED_PATHS, localizePath } from "../shared/localeRoutes";

function loadIndex(): string {
  return fs.readFileSync(path.join(process.cwd(), "client/index.html"), "utf8");
}

/** Mirrors production `server/static.ts` / preview assembly for marketing HTML. */
function assembleCompleteHtml(pathname: string): { status: number; html: string } {
  let html = loadIndex();

  if (pathname === "/") {
    html = injectHomepageSeoMeta(html, "en");
    html = html.replace('<div id="root"></div>', `<div id="root">${generateHomepageHtml("en")}</div>`);
    return { status: 200, html };
  }
  if (pathname === "/es/" || pathname === "/he/") {
    const locale = pathname.startsWith("/he") ? "he" : "es";
    html = injectHomepageSeoMeta(html, locale);
    html = injectLocalizedStaticShell(html, locale);
    html = html.replace(
      '<div id="root"></div>',
      `<div id="root">${generateHomepageHtml(locale)}</div>`,
    );
    return { status: 200, html };
  }

  const marketing = new Set([...getMarketingRoutes(), ...getLocalizedMarketingRoutes()]);
  if (pathname === "/es/not-a-real-page") {
    html = injectNoindexMeta(html);
    html = removeStaticShellFromHtml(html);
    html = html.replace(/<title>.*?<\/title>/i, "<title>404 Page Not Found | WhachatCRM</title>");
    html = html.replace(
      '<div id="root"></div>',
      `<div id="root"><main data-ssr-404="true"><h1>404 Page Not Found</h1></main></div>`,
    );
    return { status: 404, html };
  }

  if (marketing.has(pathname)) {
    html = injectPageMeta(html, pathname);
    html = removeStaticShellFromHtml(html);
    const ssr = generateMarketingPageSsrHtml(pathname);
    if (ssr) {
      html = html.replace('<div id="root"></div>', `<div id="root">${ssr}</div>`);
    }
    return { status: 200, html };
  }

  throw new Error(`Unhandled pathname in test assembler: ${pathname}`);
}

function h1Texts(html: string): string[] {
  return [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) =>
    m[1]!.replace(/\s+/g, " ").trim(),
  );
}

function expectedRouteH1(pathname: string): string {
  if (pathname === "/") return getLocalizedHomepage("en").staticShell.h1;
  if (pathname === "/es/") return getLocalizedHomepage("es").staticShell.h1;
  if (pathname === "/he/") return getLocalizedHomepage("he").staticShell.h1;
  if (pathname === "/es/not-a-real-page") return "404 Page Not Found";

  const locale = pathname.startsWith("/he/") ? "he" : pathname.startsWith("/es/") ? "es" : "en";
  const englishPath =
    locale === "en" ? pathname : pathname.replace(/^\/(es|he)/, "") || "/";

  if (englishPath === "/pricing") {
    return getLocalizedPricingPage(locale).ssr.h1;
  }
  const product = getProductByPath(englishPath);
  if (product) return getLocalizedProductPage(product, locale).h1;
  const solution = getSolutionByPath(englishPath);
  if (solution) return getLocalizedSolutionPage(solution, locale).h1;

  // Prospect AI / RGE landings use dedicated SSR; fall back to first SSR h1 check in test.
  const ssr = generateMarketingPageSsrHtml(pathname);
  const fromSsr = ssr ? h1Texts(ssr)[0] : undefined;
  if (fromSsr) return fromSsr;
  throw new Error(`No expected H1 for ${pathname}`);
}

test("non-home marketing HTML removes static shell and keeps one route H1", () => {
  const samples = [
    "/ai-brain",
    "/es/ai-brain",
    "/he/ai-brain",
    "/pricing",
    "/es/pricing",
    "/he/pricing",
    "/solutions/ecommerce",
    "/es/solutions/ecommerce",
    "/he/solutions/ecommerce",
  ];

  for (const pathname of samples) {
    const { status, html } = assembleCompleteHtml(pathname);
    assert.equal(status, 200, pathname);
    assert.ok(!html.includes('id="whachat-static-shell"'), `${pathname} still has static shell`);
    assert.ok(
      !html.includes('id="whachat-static-hero-title"'),
      `${pathname} still has homepage hero title id`,
    );
    // Homepage hero copy must not remain as a second crawlable H1 (Prospect AI EN H1 may reuse the phrase).
    assert.ok(
      !html.includes('<h1 id="whachat-static-hero-title">'),
      `${pathname} still has static hero H1 element`,
    );
    const h1s = h1Texts(html);
    assert.equal(h1s.length, 1, `${pathname} h1 count=${h1s.length}: ${h1s.join(" | ")}`);
    assert.equal(h1s[0], expectedRouteH1(pathname), pathname);
  }
});

test("all Phase 2 product/solution/pricing localized routes have one H1 and no English shell", () => {
  for (const englishPath of PHASE2_LOCALIZED_PATHS) {
    if (englishPath === "/") continue;
    for (const locale of ["en", "es", "he"] as const) {
      const pathname =
        locale === "en" ? englishPath : localizePath(englishPath, locale)!;
      const { html } = assembleCompleteHtml(pathname);
      assert.ok(!html.includes('id="whachat-static-shell"'), pathname);
      assert.ok(!html.includes('id="whachat-static-hero-title"'), pathname);
      const h1s = h1Texts(html);
      assert.equal(h1s.length, 1, `${pathname} → ${h1s.join(" | ")}`);
      if (locale !== "en") {
        assert.ok(!html.includes('<h1 id="whachat-static-hero-title">'), pathname);
        assert.notEqual(h1s[0], "Meet Your AI Sales Team", pathname);
      }
    }
  }
});

test("homepages keep exactly one localized H1 via static shell", () => {
  for (const [pathname, expected] of [
    ["/", "Meet Your AI Sales Team"],
    ["/es/", "Conoce a tu equipo de ventas con IA"],
    ["/he/", "הכירו את צוות המכירות מבוסס ה-AI שלכם"],
  ] as const) {
    const { html } = assembleCompleteHtml(pathname);
    assert.ok(html.includes("whachat-static-shell"), pathname);
    const h1s = h1Texts(html);
    assert.equal(h1s.length, 1, pathname);
    assert.equal(h1s[0], expected, pathname);
  }
});

test("unknown localized route is 404/noindex without homepage shell H1", () => {
  const { status, html } = assembleCompleteHtml("/es/not-a-real-page");
  assert.equal(status, 404);
  assert.match(html, /noindex/);
  assert.ok(!html.includes('id="whachat-static-shell"'));
  assert.ok(!html.includes('id="whachat-static-hero-title"'));
  assert.ok(!html.includes("<h1 id=\"whachat-static-hero-title\">"));
  const h1s = h1Texts(html);
  assert.equal(h1s.length, 1);
  assert.equal(h1s[0], "404 Page Not Found");
});

test("canonical and hreflang survive shell removal", () => {
  const { html: es } = assembleCompleteHtml("/es/ai-brain");
  assert.match(es, /rel="canonical" href="https:\/\/www\.whachatcrm\.com\/es\/ai-brain"/);
  assert.match(es, /hreflang="en"/);
  assert.match(es, /hreflang="he"/);
  assert.match(es, /hreflang="x-default"/);
  assert.match(es, /<html lang="es" dir="ltr">/);

  const { html: he } = assembleCompleteHtml("/he/pricing");
  assert.match(he, /rel="canonical" href="https:\/\/www\.whachatcrm\.com\/he\/pricing"/);
  assert.match(he, /<html lang="he" dir="rtl">/);
});
