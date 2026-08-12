/**
 * Capture Inbox channel-health bar layout screenshots (desktop / mobile / RTL).
 * Run: npx tsx scripts/inbox-channel-health-screenshots.ts
 * Output: .tmp-review-screenshots/inbox-channel-health-*.png
 */
import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../.tmp-review-screenshots");
fs.mkdirSync(outDir, { recursive: true });

const CHANNELS = [
  { short: "WA", full: "WhatsApp", connected: true, color: "#10b981" },
  { short: "FB", full: "Facebook", connected: true, color: "#10b981" },
  { short: "IG", full: "Instagram", connected: false, color: "#d1d5db" },
  { short: "TG", full: "Telegram", connected: false, color: "#d1d5db" },
  { short: "TT", full: "TikTok", connected: false, color: "#d1d5db" },
  { short: "Mail", full: "Email", connected: true, color: "#10b981" },
] as const;

function buildHtml(opts: { dir: "ltr" | "rtl"; lang: string; title: string }) {
  const items = CHANNELS.map((ch) => {
    const textColor = ch.connected ? "#6b7280" : "#9ca3af";
    const status = ch.connected ? "connected" : "not configured";
    return `<div role="listitem" title="${ch.full}: ${status}" aria-label="${ch.full}: ${status}"
      style="display:flex;align-items:center;gap:2px;font-size:9px;line-height:1;white-space:nowrap;flex-shrink:0;color:${textColor}">
      <span aria-hidden="true" style="width:6px;height:6px;border-radius:9999px;background:${ch.color};flex-shrink:0"></span>
      <span aria-hidden="true">${ch.short}</span>
    </div>`;
  }).join("\n");

  return `<!doctype html>
<html lang="${opts.lang}" dir="${opts.dir}">
<head>
  <meta charset="utf-8" />
  <title>${opts.title}</title>
  <style>
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #f8fafc; }
    .panel {
      width: 320px; max-width: 100%; margin: 24px;
      background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px;
    }
    .tabs { display: flex; gap: 8px; font-size: 12px; color: #6b7280; }
    .tabs strong { color: #111827; }
    .bar {
      display: flex; flex-wrap: nowrap; align-items: center; gap: 6px;
      margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb;
      overflow-x: auto; overscroll-behavior-x: contain;
      -ms-overflow-style: none; scrollbar-width: none;
    }
    .bar::-webkit-scrollbar { display: none; }
    h1 { font-size: 14px; margin: 0 0 12px; color: #334155; }
  </style>
</head>
<body>
  <h1>${opts.title}</h1>
  <div class="panel">
    <div class="tabs"><strong>All</strong><span>Unread</span><span>Mine</span></div>
    <div class="bar" data-testid="channel-health-bar" role="list" aria-label="Channel connection status">
      ${items}
    </div>
  </div>
</body>
</html>`;
}

async function shot(
  page: import("playwright").Page,
  name: string,
  html: string,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  const bar = page.locator('[data-testid="channel-health-bar"]');
  await bar.waitFor();
  const metrics = await bar.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const texts = Array.from(el.querySelectorAll('[role="listitem"]')).map((n) =>
      (n.textContent || "").replace(/\s+/g, " ").trim(),
    );
    return {
      width: Math.round(r.width),
      height: Math.round(r.height),
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      wrap: getComputedStyle(el).flexWrap,
      texts,
      rowCount: (() => {
        const items = Array.from(el.querySelectorAll('[role="listitem"]'));
        const tops = new Set(items.map((i) => Math.round(i.getBoundingClientRect().top)));
        return tops.size;
      })(),
    };
  });
  const file = path.join(outDir, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log(JSON.stringify({ name, ...metrics }));
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await shot(
    page,
    "inbox-channel-health-desktop-en.png",
    buildHtml({ dir: "ltr", lang: "en", title: "Inbox channel health — desktop EN" }),
    { width: 1280, height: 720 },
  );

  await shot(
    page,
    "inbox-channel-health-mobile-en.png",
    buildHtml({ dir: "ltr", lang: "en", title: "Inbox channel health — mobile EN (320px panel)" }),
    { width: 390, height: 844 },
  );

  // Force a narrower bar container to demonstrate horizontal scroll without wrap.
  const tightHtml = buildHtml({
    dir: "ltr",
    lang: "en",
    title: "Inbox channel health — narrow scroll",
  }).replace(
    "width: 320px; max-width: 100%;",
    "width: 100px; max-width: 100%;",
  );
  await shot(page, "inbox-channel-health-mobile-scroll.png", tightHtml, {
    width: 390,
    height: 844,
  });

  await shot(
    page,
    "inbox-channel-health-rtl-he.png",
    buildHtml({ dir: "rtl", lang: "he", title: "סרגל מצב ערוצים — RTL HE" }),
    { width: 1280, height: 720 },
  );

  await browser.close();
  console.log(`Wrote screenshots to ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
