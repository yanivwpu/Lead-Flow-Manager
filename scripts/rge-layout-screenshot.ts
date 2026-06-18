/**
 * Screenshot RGE dashboard layout structure (workflows + sidebar, then full-width sections).
 * Usage: npx tsx scripts/rge-layout-screenshot.ts
 */
import fs from "fs";
import path from "path";

const outDir = path.join(process.cwd(), "artifacts");
const htmlPath = path.join(outDir, "rge-layout-preview.html");
const pngPath = path.join(outDir, "rge-layout-preview.png");

function findBootstrapCss(): string {
  const assetsDir = path.join(process.cwd(), "dist", "public", "assets");
  const match = fs.readdirSync(assetsDir).find((f) => f.startsWith("bootstrap-") && f.endsWith(".css"));
  if (!match) throw new Error("Run npm run build first");
  return path.join(assetsDir, match).replace(/\\/g, "/");
}

function buildPreviewHtml(cssPath: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>RGE layout preview</title>
  <link rel="stylesheet" href="file:///${cssPath}" />
  <style>
    body { margin: 0; background: #f9fafb; font-family: system-ui, sans-serif; }
    .mock-card { border: 1px solid #e5e7eb; border-radius: 0.75rem; background: #fff; box-shadow: 0 1px 2px rgb(0 0 0 / 0.04); }
    .mock-card-h { padding: 1.25rem 1.25rem 0.75rem; border-bottom: 1px solid #f3f4f6; font-weight: 600; }
    .mock-card-b { padding: 1rem 1.25rem 1.25rem; color: #6b7280; font-size: 0.875rem; }
    .mock-row { padding: 0.75rem; border: 1px solid #e5e7eb; border-radius: 0.5rem; background: #f9fafb; margin-bottom: 0.5rem; font-size: 0.875rem; }
    .layout-label { position: absolute; top: 0.5rem; right: 0.5rem; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #059669; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 2px 6px; border-radius: 4px; }
    .section-wrap { position: relative; }
  </style>
</head>
<body>
  <div class="w-full max-w-7xl mx-auto px-4 sm:px-6 py-8">
    <div class="mb-8">
      <div class="inline-block mb-2 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">Active Engine</div>
      <h1 class="text-3xl font-bold text-gray-900">Growth Engine</h1>
      <p class="text-muted-foreground">Your real estate automation system is active and running.</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] gap-6 items-start">
      <div class="space-y-6 min-w-0">
        <div class="mock-card min-w-0">
          <div class="mock-card-h">Active Automations</div>
          <div class="mock-card-b">
            <div class="mock-row">W1 — Lead intake</div>
            <div class="mock-row">W2 — AI qualification</div>
            <div class="mock-row">W3 — Booking</div>
            <div class="mock-row">W4 — Follow-up</div>
          </div>
        </div>
        <div class="mock-card w-full section-wrap">
          <span class="layout-label">Under automations</span>
          <div class="mock-card-h text-lg">Public Agent Page</div>
          <div class="mock-card-b">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="space-y-3">
                <div class="mock-row">Enable page · Slug · Lead capture · Visibility</div>
                <div class="mock-row">Agent URL copy / open</div>
              </div>
              <div class="space-y-3">
                <div class="mock-row">Business Profile preview</div>
                <div class="mock-row">Custom bio · Market area chips</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <aside class="space-y-6 min-w-0">
        <div class="mock-card">
          <div class="mock-card-h">AI Qualification</div>
          <div class="mock-card-b">Status: Active</div>
        </div>
        <div class="mock-card">
          <div class="mock-card-h">CRM Pipeline</div>
          <div class="mock-card-b">New Lead → Closed</div>
        </div>
        <div class="mock-card">
          <div class="mock-card-h">Agent Page (summary)</div>
          <div class="mock-card-b">Status · /agents/slug · Open settings</div>
        </div>
        <div class="mock-card">
          <div class="mock-card-h">Inventory Sources (summary)</div>
          <div class="mock-card-b">Bridge MLS · Connected · Open inventory settings</div>
        </div>
      </aside>
    </div>

    <section class="mt-8 w-full section-wrap">
      <span class="layout-label">Full width below</span>
      <p class="text-sm text-muted-foreground mb-3">Listings available on your public Agent Page come from connected inventory sources.</p>
      <div class="mock-card w-full">
        <div class="mock-card-h">Inventory Sources</div>
        <div class="mock-card-b">Bridge MLS · Connect · Sync status</div>
      </div>
    </section>
  </div>
</body>
</html>`;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const cssPath = findBootstrapCss();
  fs.writeFileSync(htmlPath, buildPreviewHtml(cssPath), "utf-8");

  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
    await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    await page.screenshot({ path: pngPath, fullPage: true });
    console.log("Wrote", pngPath);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
