/**
 * Render Day 3 / Day 10 activation emails and capture desktop + mobile previews.
 * Usage: npx tsx scripts/activation-email-preview.ts
 */
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import {
  renderActivationEmailDay3Html,
  renderActivationEmailDay10Html,
} from "../server/email";

const OUT_DIR = path.join(process.cwd(), "artifacts", "activation-email-previews");
const SAMPLE_NAME = "Alex";
const APP_URL = "https://app.whachatcrm.com";

const DESKTOP_VIEWPORT = { width: 800, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

type PreviewSpec = {
  id: string;
  label: string;
  subject: string;
  html: string;
};

function localAssetBase(): string {
  const dir = path.join(process.cwd(), "client", "public", "email", "activation");
  return pathToFileURL(dir).href.replace(/\/$/, "");
}

/** Playwright setContent cannot load file:// images — inline as data URIs for faithful previews. */
function inlineActivationImages(html: string): string {
  const assetDir = path.join(process.cwd(), "client", "public", "email", "activation");
  let result = html;
  for (const file of fs.readdirSync(assetDir)) {
    if (!file.endsWith(".png")) continue;
    const filePath = path.join(assetDir, file);
    const dataUri = `data:image/png;base64,${fs.readFileSync(filePath).toString("base64")}`;
    const fileUrl = pathToFileURL(filePath).href;
    result = result.split(fileUrl).join(dataUri);
  }
  return result;
}

function buildPreviewShell(specs: PreviewSpec[]): string {
  const frames = specs
    .map(
      (spec) => `
    <section class="preview-block">
      <div class="preview-meta">
        <h2>${spec.label}</h2>
        <p class="subject"><strong>Subject:</strong> ${spec.subject}</p>
        <div class="png-links">
          <a href="${spec.id}-desktop.png" target="_blank">Desktop PNG</a>
          <a href="${spec.id}-mobile.png" target="_blank">Mobile PNG</a>
          <a href="${spec.id}-desktop.html" target="_blank">Desktop HTML</a>
          <a href="${spec.id}-mobile.html" target="_blank">Mobile HTML</a>
        </div>
      </div>
      <div class="preview-row">
        <div class="preview-col">
          <p class="viewport-label">Desktop (800px viewport)</p>
          <div class="device desktop">
            <iframe src="${spec.id}-desktop.html" title="${spec.label} desktop"></iframe>
          </div>
        </div>
        <div class="preview-col">
          <p class="viewport-label">Mobile (390px viewport)</p>
          <div class="device mobile">
            <iframe src="${spec.id}-mobile.html" title="${spec.label} mobile"></iframe>
          </div>
        </div>
      </div>
    </section>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Activation email previews</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      padding: 32px 24px 64px;
    }
    h1 { margin: 0 0 8px; font-size: 28px; font-weight: 700; }
    .intro { margin: 0 0 32px; color: #94a3b8; max-width: 720px; line-height: 1.6; }
    .preview-block {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 32px;
    }
    .preview-meta h2 { margin: 0 0 6px; font-size: 20px; color: #f8fafc; }
    .subject { margin: 0 0 12px; color: #94a3b8; font-size: 14px; }
    .png-links { margin: 0 0 20px; display: flex; flex-wrap: wrap; gap: 12px; font-size: 13px; }
    .png-links a { color: #34d399; text-decoration: none; }
    .png-links a:hover { text-decoration: underline; }
    .preview-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }
    @media (max-width: 1100px) {
      .preview-row { grid-template-columns: 1fr; }
    }
    .viewport-label {
      margin: 0 0 10px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #64748b;
    }
    .device {
      background: #f8fafc;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid #475569;
      box-shadow: 0 12px 40px rgb(0 0 0 / 0.35);
    }
    .device.desktop iframe { width: 800px; height: 2200px; border: 0; display: block; }
    .device.mobile {
      width: 390px;
      max-width: 100%;
      margin: 0 auto;
    }
    .device.mobile iframe { width: 390px; height: 2600px; border: 0; display: block; }
  </style>
</head>
<body>
  <h1>Activation email previews</h1>
  <p class="intro">
    Exact HTML rendered by <code>renderActivationEmailDay3Html</code> and
    <code>renderActivationEmailDay10Html</code> with local product screenshots.
    Review spacing, image sizing, CTA buttons, and footer before deployment.
  </p>
  ${frames}
</body>
</html>`;
}

async function screenshotEmail(
  browser: Awaited<ReturnType<(typeof import("playwright"))["chromium"]["launch"]>>,
  html: string,
  outPath: string,
  viewport: { width: number; height: number },
): Promise<void> {
  const page = await browser.newPage({ viewport });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: outPath, fullPage: true });
  await page.close();
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const assetBase = localAssetBase();
  const renderOpts = { appUrl: APP_URL, assetBase };

  const day3Html = inlineActivationImages(renderActivationEmailDay3Html(SAMPLE_NAME, renderOpts));
  const day10Html = inlineActivationImages(renderActivationEmailDay10Html(SAMPLE_NAME, renderOpts));

  const specs: PreviewSpec[] = [
    {
      id: "day3",
      label: "Day 3 — Getting Connected",
      subject: "Connect WhatsApp in minutes — your free AI assistant is ready",
      html: day3Html,
    },
    {
      id: "day10",
      label: "Day 10 — Why Connect?",
      subject: "Your AI assistant is waiting — connect your channels to activate it",
      html: day10Html,
    },
  ];

  for (const spec of specs) {
    fs.writeFileSync(path.join(OUT_DIR, `${spec.id}-desktop.html`), spec.html, "utf-8");
    fs.writeFileSync(path.join(OUT_DIR, `${spec.id}-mobile.html`), spec.html, "utf-8");
  }

  fs.writeFileSync(path.join(OUT_DIR, "index.html"), buildPreviewShell(specs), "utf-8");

  const { chromium } = await import("playwright");
  const browser = await chromium.launch();

  try {
    for (const spec of specs) {
      await screenshotEmail(
        browser,
        spec.html,
        path.join(OUT_DIR, `${spec.id}-desktop.png`),
        DESKTOP_VIEWPORT,
      );
      await screenshotEmail(
        browser,
        spec.html,
        path.join(OUT_DIR, `${spec.id}-mobile.png`),
        MOBILE_VIEWPORT,
      );
      console.log("Wrote", `${spec.id}-desktop.png`, `${spec.id}-mobile.png`);
    }
  } finally {
    await browser.close();
  }

  console.log("\nPreview index:", path.join(OUT_DIR, "index.html"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
