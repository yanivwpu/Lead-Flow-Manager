/**
 * Production homepage CLS probe (hard refresh, cache disabled).
 * Captures layout-shift sources + stage screenshots.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("tmp-lh/prod-cls");
fs.mkdirSync(OUT, { recursive: true });

const URLS = [
  { id: "en-desktop", url: "https://www.whachatcrm.com/", viewport: { width: 1280, height: 800 }, mobile: false },
  { id: "es-desktop", url: "https://www.whachatcrm.com/es/", viewport: { width: 1280, height: 800 }, mobile: false },
  { id: "he-desktop", url: "https://www.whachatcrm.com/he/", viewport: { width: 1280, height: 800 }, mobile: false },
  { id: "en-mobile", url: "https://www.whachatcrm.com/", viewport: { width: 390, height: 844 }, mobile: true },
  { id: "es-mobile", url: "https://www.whachatcrm.com/es/", viewport: { width: 390, height: 844 }, mobile: true },
  { id: "he-mobile", url: "https://www.whachatcrm.com/he/", viewport: { width: 390, height: 844 }, mobile: true },
];

const INJECT = `
window.__clsLog=[];
window.__clsSnapshots=[];
try {
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      const sources = (e.sources || []).map((s) => {
        const n = s.node;
        const info = { prev: s.previousRect, cur: s.currentRect };
        try {
          if (n) {
            info.sel = n.id
              ? "#" + n.id
              : n.className && typeof n.className === "string"
                ? "." + String(n.className).trim().split(/\\s+/).slice(0, 4).join(".")
                : n.tagName;
            info.tag = n.tagName;
            info.id = n.id || null;
            info.cls = typeof n.className === "string" ? n.className.slice(0, 120) : null;
            info.text = (n.textContent || "").trim().slice(0, 60);
          }
        } catch (_) {}
        return info;
      });
      window.__clsLog.push({ value: e.value, startTime: e.startTime, sources });
    }
  }).observe({ type: "layout-shift", buffered: true });
} catch (_) {}

function rect(el) {
  if (!el) return null;
  const b = el.getBoundingClientRect();
  return {
    t: +b.top.toFixed(1),
    h: +b.height.toFixed(1),
    w: +b.width.toFixed(1),
    v: getComputedStyle(el).visibility,
    d: getComputedStyle(el).display,
  };
}

window.__snap = function snap(label) {
  try {
    const html = document.documentElement;
    const host = document.getElementById("wcs-react-header-host");
    const nav = host && host.querySelector(":scope > .wcs-nav");
    const portal = host && host.querySelector(":scope > .wcs-react-header-portal");
    const root = document.getElementById("root");
    const shell = document.getElementById("whachat-static-shell");
    const h1 = document.getElementById("whachat-static-hero-title");
    const heroImg = document.querySelector("#whachat-static-shell picture img, #whachat-static-shell img");
    const cssHrefs = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href);
    window.__clsSnapshots.push({
      label,
      t: +performance.now().toFixed(1),
      classes: html.className,
      dir: html.dir,
      lang: html.lang,
      title: document.title.slice(0, 80),
      h1Count: document.querySelectorAll("h1").length,
      hostChildren: host ? [...host.children].map((c) => c.className || c.id || c.tagName) : null,
      h1: rect(h1),
      nav: rect(nav),
      portal: rect(portal),
      host: rect(host),
      root: rect(root),
      shell: rect(shell),
      heroImg: rect(heroImg),
      fonts: document.fonts ? document.fonts.status : "n/a",
      clsSum: +((window.__clsLog || []).reduce((a, x) => a + x.value, 0)).toFixed(5),
      cssHrefs,
    });
  } catch (e) {
    window.__clsSnapshots.push({ label, err: String(e) });
  }
};

document.addEventListener("DOMContentLoaded", () => window.__snap("domcontentloaded"));
window.addEventListener("load", () => window.__snap("load"));
`;

async function probe(browser, spec) {
  const context = await browser.newContext({
    viewport: spec.viewport,
    deviceScaleFactor: spec.mobile ? 2 : 1,
    isMobile: spec.mobile,
    hasTouch: spec.mobile,
    userAgent: spec.mobile
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      : undefined,
  });
  await context.route("**/*", (route) => route.continue());
  const page = await context.newPage();
  await page.addInitScript(INJECT);

  const stages = [];
  const shot = async (label) => {
    const file = path.join(OUT, `${spec.id}-${label}.png`);
    await page.screenshot({ path: file, fullPage: false });
    await page.evaluate((l) => window.__snap && window.__snap(l), label);
    stages.push(label);
    return file;
  };

  // Capture early paints via CDP screenshots timed around navigation
  const client = await context.newCDPSession(page);
  await client.send("Network.setCacheDisabled", { cacheDisabled: true });
  try {
    await client.send("Overlay.setShowLayoutShiftRegions", { result: true });
  } catch (_) {}

  const navPromise = page.goto(spec.url, { waitUntil: "domcontentloaded", timeout: 60000 });

  // Poll for early stages
  let gotInitial = false;
  let gotBeforeReact = false;
  let gotPortal = false;
  let gotLocale = false;
  const start = Date.now();
  while (Date.now() - start < 12000) {
    const state = await page
      .evaluate(() => {
        const ready = document.readyState;
        const shell = !!document.getElementById("whachat-static-shell");
        const h1 = !!document.getElementById("whachat-static-hero-title");
        const portal = !!document.querySelector(".wcs-react-header-portal");
        const shellLive = document.documentElement.classList.contains("wcs-homepage-shell-live");
        const rootKids = document.getElementById("root")?.childElementCount || 0;
        const dir = document.documentElement.dir;
        const lang = document.documentElement.lang;
        const fonts = document.fonts ? document.fonts.status : "n/a";
        return { ready, shell, h1, portal, shellLive, rootKids, dir, lang, fonts, title: document.title };
      })
      .catch(() => null);

    if (!state) {
      await page.waitForTimeout(40);
      continue;
    }

    if (!gotInitial && state.shell && state.h1) {
      gotInitial = true;
      await shot("01-initial-html-paint");
    }
    if (!gotBeforeReact && gotInitial && !state.portal && state.rootKids === 0) {
      gotBeforeReact = true;
      await shot("02-before-react-mount");
    }
    if (!gotPortal && state.portal) {
      gotPortal = true;
      await shot("03-react-header-portal");
    }
    if (!gotLocale && state.shellLive && (spec.id.startsWith("es") || spec.id.startsWith("he"))) {
      // locale sync: title/lang/dir should match locale route
      const expectLang = spec.id.startsWith("es") ? "es" : "he";
      const expectDir = expectLang === "he" ? "rtl" : "ltr";
      if (state.lang === expectLang && state.dir === expectDir) {
        gotLocale = true;
        await shot("04-locale-sync");
      }
    } else if (!gotLocale && state.shellLive && spec.id.startsWith("en") && state.lang === "en") {
      gotLocale = true;
      await shot("04-locale-sync");
    }

    if (gotPortal && gotLocale) break;
    await page.waitForTimeout(40);
  }

  await navPromise.catch(() => {});
  await page.waitForTimeout(2500);
  await shot("05-final-settled");

  // Asset freshness checks
  const assets = await page.evaluate(() => {
    const css = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href);
    const scripts = [...document.querySelectorAll("script[src]")].map((s) => s.src).filter((s) => s.includes("/assets/"));
    const preloads = [...document.querySelectorAll('link[rel="preload"]')].map((l) => ({
      as: l.getAttribute("as"),
      href: l.href,
      imagesrcset: l.getAttribute("imagesrcset"),
    }));
    const htmlHasShellLive = !!document.documentElement.classList.contains("wcs-homepage-shell-live") ||
      !!document.querySelector("#wcs-react-header-host");
    const criticalHasShellLive = [...document.querySelectorAll("style")].some((s) =>
      (s.textContent || "").includes("wcs-homepage-shell-live"),
    );
    let sheetHasShellLive = false;
    try {
      sheetHasShellLive = [...document.styleSheets].some((sheet) => {
        try {
          return [...(sheet.cssRules || [])].some((r) => String(r.cssText || "").includes("wcs-homepage-shell-live"));
        } catch {
          return false;
        }
      });
    } catch (_) {}
    return {
      css,
      scripts: scripts.slice(0, 8),
      preloads,
      htmlHasShellLive,
      criticalHasShellLive,
      sheetHasShellLive,
      dir: document.documentElement.dir,
      lang: document.documentElement.lang,
      classes: document.documentElement.className,
    };
  });

  const result = await page.evaluate(() => ({
    clsLog: window.__clsLog || [],
    snapshots: window.__clsSnapshots || [],
    cls: +((window.__clsLog || []).reduce((a, x) => a + x.value, 0)).toFixed(5),
  }));

  await context.close();
  return { id: spec.id, url: spec.url, viewport: spec.viewport, assets, stages, ...result };
}

const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
});
const results = [];
for (const spec of URLS) {
  console.log("Probing", spec.id, spec.url);
  try {
    const r = await probe(browser, spec);
    results.push(r);
    console.log(
      " ",
      r.id,
      "CLS=",
      r.cls,
      "shifts=",
      r.clsLog.length,
      "top=",
      r.clsLog
        .slice()
        .sort((a, b) => b.value - a.value)
        .slice(0, 3)
        .map((s) => `${s.value.toFixed(4)}@${Math.round(s.startTime)}ms:${(s.sources[0] && s.sources[0].sel) || "?"}`)
        .join(" | "),
    );
  } catch (e) {
    console.error("FAIL", spec.id, e);
    results.push({ id: spec.id, error: String(e) });
  }
}
await browser.close();

const summaryPath = path.join(OUT, "summary.json");
fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));
console.log("Wrote", summaryPath);
