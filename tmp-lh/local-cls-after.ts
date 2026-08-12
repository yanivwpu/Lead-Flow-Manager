/**
 * Local after-fix CLS probe against dist/public (hard refresh).
 */
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { injectLocalizedStaticShell } from "../server/seo.ts";

const ROOT = path.resolve("dist/public");
const OUT = path.resolve("tmp-lh/prod-cls-after");
fs.mkdirSync(OUT, { recursive: true });
const baseHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

function homepageHtml(pathname) {
  if (pathname === "/he" || pathname === "/he/") {
    let html = injectLocalizedStaticShell(baseHtml, "he");
    html = html.replace("<html lang=\"en\">", '<html lang="he" dir="rtl" class="rtl">');
    return html;
  }
  if (pathname === "/es" || pathname === "/es/") {
    let html = injectLocalizedStaticShell(baseHtml, "es");
    html = html.replace("<html lang=\"en\">", '<html lang="es" dir="ltr">');
    return html;
  }
  return baseHtml;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".avif": "image/avif",
  ".webp": "image/webp",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/" || pathname === "/es/" || pathname === "/he/" || pathname === "/es" || pathname === "/he") {
    const html = homepageHtml(pathname);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(html);
    return;
  }
  const filePath = path.normalize(path.join(ROOT, pathname.replace(/^\//, "")));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      const html = homepageHtml(pathname);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(html);
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  });
});

await new Promise((r) => server.listen(5177, "127.0.0.1", r));
const base = "http://127.0.0.1:5177";

const INJECT = `
window.__clsLog=[];
try {
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      const sources = (e.sources || []).map((s) => {
        const n = s.node;
        const info = { prev: s.previousRect, cur: s.currentRect };
        try {
          if (n) {
            info.sel = n.id ? "#" + n.id : (n.className && typeof n.className === "string" ? "." + String(n.className).trim().split(/\\s+/).slice(0, 4).join(".") : n.tagName);
            info.text = (n.textContent || "").trim().slice(0, 40);
          }
        } catch (_) {}
        return info;
      });
      window.__clsLog.push({ value: e.value, startTime: e.startTime, sources });
    }
  }).observe({ type: "layout-shift", buffered: true });
} catch (_) {}
`;

const specs = [
  { id: "en-desktop", path: "/", viewport: { width: 1280, height: 800 }, mobile: false },
  { id: "en-mobile", path: "/", viewport: { width: 390, height: 844 }, mobile: true },
  { id: "he-desktop", path: "/he/", viewport: { width: 1280, height: 800 }, mobile: false },
];

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const results = [];

for (const spec of specs) {
  const context = await browser.newContext({
    viewport: spec.viewport,
    isMobile: spec.mobile,
    hasTouch: spec.mobile,
    deviceScaleFactor: spec.mobile ? 2 : 1,
  });
  const page = await context.newPage();
  await page.addInitScript(INJECT);
  const client = await context.newCDPSession(page);
  await client.send("Network.setCacheDisabled", { cacheDisabled: true });
  try {
    await client.send("Overlay.setShowLayoutShiftRegions", { result: true });
  } catch (_) {}

  let earlyGeom = null;
  const nav = page.goto(base + spec.path, { waitUntil: "domcontentloaded", timeout: 60000 });
  for (let i = 0; i < 40; i++) {
    earlyGeom = await page
      .evaluate(`(() => {
        const host = document.getElementById("wcs-react-header-host");
        const center = host && host.querySelector(".wcs-nav-center");
        const actions = host && host.querySelector(".wcs-nav-actions");
        const product = center && center.querySelector('a[href*="prospect-ai"]');
        const pricing = actions && actions.querySelector('a[href*="pricing"]');
        const r = (el) => {
          if (!el) return null;
          const b = el.getBoundingClientRect();
          return { t: +b.top.toFixed(1), l: +b.left.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) };
        };
        return {
          host: r(host),
          product: r(product),
          pricing: r(pricing),
          centerDisplay: center ? getComputedStyle(center).display : null,
          portal: !!document.querySelector(".wcs-react-header-portal"),
          width: document.documentElement.clientWidth,
          dir: document.documentElement.dir,
        };
      })()`)
      .catch(() => null);
    if (earlyGeom?.host && !earlyGeom.portal) {
      await page.screenshot({ path: path.join(OUT, `${spec.id}-01-shell.png`) });
      break;
    }
    await page.waitForTimeout(50);
  }
  await nav.catch(() => {});
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(OUT, `${spec.id}-05-settled.png`) });
  const final = await page.evaluate(`(() => {
    const host = document.getElementById("wcs-react-header-host");
    const portal = document.querySelector(".wcs-react-header-portal");
    const r = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { t: +b.top.toFixed(1), l: +b.left.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) };
    };
    const cls = (window.__clsLog || []).reduce((a, x) => a + x.value, 0);
    return {
      cls: +cls.toFixed(5),
      shifts: window.__clsLog || [],
      host: r(host),
      portal: r(portal),
      shellLive: document.documentElement.classList.contains("wcs-homepage-shell-live"),
      width: document.documentElement.clientWidth,
      hasScrollbarCss: getComputedStyle(document.documentElement).scrollbarGutter,
      dir: document.documentElement.dir,
    };
  })()`);
  results.push({ id: spec.id, earlyGeom, final });
  console.log(spec.id, "CLS=", final.cls, "hostH", earlyGeom?.host?.h, "->", final.host?.h, "width", earlyGeom?.width, "->", final.width, "productL", earlyGeom?.product?.l);
  await context.close();
}

fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(results, null, 2));
await browser.close();
server.close();
console.log("Wrote", path.join(OUT, "summary.json"));
