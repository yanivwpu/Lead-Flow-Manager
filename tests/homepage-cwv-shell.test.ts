/**
 * Homepage CWV / static-shell geometry guards.
 * Run: npx tsx --test tests/homepage-cwv-shell.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const indexHtml = fs.readFileSync(path.join(root, "client/index.html"), "utf8");
const welcome = fs.readFileSync(path.join(root, "client/src/pages/Welcome.tsx"), "utf8");
const heroCss = fs.readFileSync(path.join(root, "client/src/index.css"), "utf8");
const heroComp = fs.readFileSync(
  path.join(root, "client/src/components/marketing/HeroConversationMockup.tsx"),
  "utf8",
);

test("static shell and React share hero eyebrow + matching h1 class", () => {
  assert.ok(indexHtml.includes('class="wcs-hero-eyebrow"'));
  assert.ok(indexHtml.includes('class="wcs-hero-h1"'));
  assert.ok(welcome.includes("wcs-hero-eyebrow"));
  assert.ok(welcome.includes("wcs-hero-h1"));
  assert.ok(heroCss.includes(".wcs-hero-eyebrow"));
  assert.ok(heroCss.includes(".wcs-hero-h1"));
});

test("hero LCP uses picture + responsive AVIF/WebP and is not lazy-loaded", () => {
  assert.ok(indexHtml.includes("<picture>"));
  assert.ok(indexHtml.includes("hero-640.avif"));
  assert.ok(indexHtml.includes('fetchpriority="high"'));
  assert.ok(indexHtml.includes('rel="preload"'));
  assert.ok(indexHtml.includes('as="image"'));
  assert.ok(heroComp.includes("HERO_AVIF_SRCSET"));
  assert.ok(heroComp.includes('fetchPriority="high"'));
  assert.ok(heroComp.includes('loading="eager"'));
  assert.ok(fs.existsSync(path.join(root, "client/public/hero/hero-640.avif")));
});

test("shell reserves lang/menu header slots; trust pill not shown in header", () => {
  assert.ok(indexHtml.includes("wcs-slot-lang"));
  assert.ok(indexHtml.includes("wcs-slot-menu"));
  assert.ok(indexHtml.includes(".wcs-trust-pill { display: none !important; }"));
});

test("Welcome keeps static shell hero live for LCP (does not remount H1)", () => {
  assert.ok(welcome.includes("wcs-homepage-shell-live"));
  assert.ok(welcome.includes("shellLive"));
  assert.ok(welcome.includes("createPortal"));
  assert.ok(welcome.includes("wcs-react-header-host"));
  assert.ok(indexHtml.includes('id="wcs-react-header-host"'));
  assert.ok(welcome.includes('setAttribute("inert"') || welcome.includes("setAttribute('inert'"));
  assert.ok(welcome.includes('aria-hidden'));
});

test("Welcome above-fold hero uses sync staticShell when shell absent", () => {
  assert.ok(welcome.includes("home.staticShell") || welcome.includes("const shell = home.staticShell"));
  assert.ok(welcome.includes("shell.h1"));
  assert.ok(welcome.includes("shell.trustPill"));
});

test("critical CSS includes metric-aligned font fallbacks", () => {
  assert.ok(indexHtml.includes("Plus Jakarta Sans Fallback"));
  assert.ok(indexHtml.includes("size-adjust: 105%"));
  assert.ok(indexHtml.includes("Inter Fallback"));
});

test("#root does not force full viewport height while shell is visible", () => {
  assert.ok(heroCss.includes("html:not(.wcs-hide-static-marketing)"));
  assert.ok(heroCss.includes("wcs-homepage-shell-live"));
  assert.ok(heroCss.includes("height: 0"));
});
