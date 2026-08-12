/**
 * Capture footer-only review screenshots across locales and viewports.
 * Run: npx tsx scripts/footer-screenshots.ts
 * Requires: PHASE2_PREVIEW_URL or http://127.0.0.1:5055
 */
import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../.tmp-review-screenshots");
const BASE = process.env.PHASE2_PREVIEW_URL || "http://127.0.0.1:5055";

fs.mkdirSync(outDir, { recursive: true });

type Shot = { name: string; path: string; width: number; height?: number };

const SHOTS: Shot[] = [
  { name: "footer-en-1440", path: "/", width: 1440 },
  { name: "footer-en-1280", path: "/", width: 1280 },
  { name: "footer-en-1180", path: "/", width: 1180 },
  { name: "footer-en-1024", path: "/", width: 1024 },
  { name: "footer-en-390", path: "/", width: 390, height: 844 },
  { name: "footer-he-1280", path: "/he/", width: 1280 },
  { name: "footer-he-390", path: "/he/", width: 390, height: 844 },
  { name: "footer-es-1280", path: "/es/", width: 1280 },
];

async function measureFooter(page: import("playwright").Page) {
  return page.evaluate(() => {
    const footerEl = document.querySelector('[data-testid="site-footer"]') as HTMLElement | null;
    if (!footerEl) return null;
    const headings = Array.from(footerEl.querySelectorAll("h3"));
    const productHeading = headings.find((h) => /product|producto|מוצר/i.test(h.textContent || ""));
    const productRoot = productHeading?.parentElement as HTMLElement | undefined;
    const wrapper = productRoot?.querySelector(":scope > div") as HTMLElement | null;
    const productLists = wrapper
      ? Array.from(wrapper.querySelectorAll(":scope > ul"))
      : [];

    const gaps: number[] = [];
    for (const ul of productLists.slice(0, 2)) {
      const items = Array.from(ul.querySelectorAll(":scope > li"));
      for (let i = 1; i < items.length; i++) {
        const a = items[i - 1].getBoundingClientRect();
        const b = items[i].getBoundingClientRect();
        gaps.push(Math.round(b.top - a.bottom));
      }
    }

    const sampleLabels = [
      "Prospect AI",
      "AI Brain",
      "AI Copilot",
      "Unified Inbox",
      "Chatbot Builder",
      "Campaigns",
      "Integrations",
      "Workflows & Automations",
      "Realtor Growth Engine",
      "Team Collaboration",
      "Best WhatsApp CRM",
      "Cookie Preferences",
    ];
    const wrap: Record<string, number> = {};
    const fontSizes: Record<string, string> = {};
    for (const label of sampleLabels) {
      const nodes = Array.from(footerEl.querySelectorAll("a, button"));
      const el = nodes.find((n) => (n.textContent || "").trim() === label) as HTMLElement | undefined;
      if (!el) continue;
      const cs = getComputedStyle(el);
      fontSizes[label] = cs.fontSize;
      // Count real text lines (ignore min-height touch targets)
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
      wrap[label] = Math.max(1, rects.length || 1);
    }

    const brandCol = footerEl.querySelector(":scope > div > div > div") as HTMLElement | null;
    const trust = brandCol?.querySelector('[role="group"]') as HTMLElement | null;
    const nav = footerEl.querySelector("nav") as HTMLElement | null;
    const copyright = footerEl.querySelector(":scope > div > div:last-child") as HTMLElement | null;

    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      footerHeight: Math.round(footerEl.getBoundingClientRect().height),
      brandWidth: brandCol ? Math.round(brandCol.getBoundingClientRect().width) : null,
      productWidth: productRoot ? Math.round(productRoot.getBoundingClientRect().width) : null,
      navWidth: nav ? Math.round(nav.getBoundingClientRect().width) : null,
      productListCount: productLists.length,
      productInternalCols: wrapper ? getComputedStyle(wrapper).gridTemplateColumns.split(" ").length : 0,
      interItemGapsPx: gaps,
      wrapLines: wrap,
      fontSizes,
      trustHeight: trust ? Math.round(trust.getBoundingClientRect().height) : null,
      copyrightOffsetFromNav: (() => {
        if (!nav || !copyright) return null;
        return Math.round(copyright.getBoundingClientRect().top - nav.getBoundingClientRect().bottom);
      })(),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      dir: document.documentElement.getAttribute("dir") || footerEl.getAttribute("dir"),
    };
  });
}

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const allMetrics: Record<string, unknown> = {};

  for (const shot of SHOTS) {
    const context = await browser.newContext({
      viewport: { width: shot.width, height: shot.height ?? 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForSelector('[data-testid="site-footer"]', { timeout: 30000 });
    const footer = page.locator('[data-testid="site-footer"]');
    await footer.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);

    const metrics = await measureFooter(page);
    allMetrics[shot.name] = metrics;

    const file = `${shot.name}.png`;
    await footer.screenshot({ path: path.join(outDir, file) });
    console.log(JSON.stringify({ name: file, metrics }, null, 2));
    await context.close();
  }

  fs.writeFileSync(
    path.join(outDir, "footer-polish-metrics.json"),
    JSON.stringify(allMetrics, null, 2),
  );
  await browser.close();
}

capture().catch((err) => {
  console.error(err);
  process.exit(1);
});
