/**
 * Optional Phase 2 visual QA screenshots into .tmp-review-screenshots/ (gitignored).
 * Requires Playwright browsers + a running preview server.
 * Not required for CI; keep for reusable multilingual visual checks.
 *
 * Run: npx tsx scripts/phase2-screenshots.ts
 */
import { chromium, devices } from "playwright";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../.tmp-review-screenshots");
const BASE = process.env.PHASE2_PREVIEW_URL || "http://127.0.0.1:5055";

fs.mkdirSync(outDir, { recursive: true });

const shots: Array<{ name: string; path: string; mobile?: boolean; scrollTo?: string }> = [
  { name: "phase2-es-home-desktop", path: "/es/" },
  { name: "phase2-he-home-desktop", path: "/he/" },
  { name: "phase2-es-pricing-desktop", path: "/es/pricing" },
  { name: "phase2-he-pricing-desktop", path: "/he/pricing" },
  { name: "phase2-es-ai-brain-desktop", path: "/es/ai-brain" },
  { name: "phase2-he-ai-brain-desktop", path: "/he/ai-brain" },
  { name: "phase2-es-ecommerce-desktop", path: "/es/solutions/ecommerce" },
  { name: "phase2-he-ecommerce-desktop", path: "/he/solutions/ecommerce" },
  { name: "phase2-es-home-mobile", path: "/es/", mobile: true },
  { name: "phase2-he-home-mobile", path: "/he/", mobile: true },
  { name: "phase2-es-pricing-mobile", path: "/es/pricing", mobile: true },
  { name: "phase2-he-pricing-mobile", path: "/he/pricing", mobile: true },
  { name: "phase2-es-ai-brain-mobile", path: "/es/ai-brain", mobile: true },
  { name: "phase2-he-ai-brain-mobile", path: "/he/ai-brain", mobile: true },
  { name: "phase2-es-ecommerce-mobile", path: "/es/solutions/ecommerce", mobile: true },
  { name: "phase2-he-ecommerce-mobile", path: "/he/solutions/ecommerce", mobile: true },
  { name: "phase2-he-pricing-compare-desktop", path: "/he/pricing", scrollTo: "[data-testid=section-comparison-table]" },
  { name: "phase2-he-pricing-faq-desktop", path: "/he/pricing", scrollTo: "[data-testid=section-faq]" },
  { name: "phase2-he-nav-mobile", path: "/he/pricing", mobile: true },
];

async function capture() {
  const browser = await chromium.launch({ headless: true });
  for (const shot of shots) {
    const context = await browser.newContext(
      shot.mobile
        ? { ...devices["iPhone 12"], viewport: { width: 390, height: 844 } }
        : { viewport: { width: 1440, height: 900 } },
    );
    const page = await context.newPage();
    await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1200);
    if (shot.scrollTo) {
      const el = page.locator(shot.scrollTo).first();
      if (await el.count()) await el.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
    }
    if (shot.name === "phase2-he-nav-mobile") {
      const menu = page.getByRole("button", { name: /menu|Open menu|Close menu/i }).first();
      if (await menu.count()) await menu.click();
      await page.waitForTimeout(500);
    }
    const file = path.join(outDir, `${shot.name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log("saved", file);
    await context.close();
  }

  // Language selector switch: es pricing → he equivalent
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/es/ai-brain`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const selector = page.getByTestId("language-selector").first();
  if (await selector.count()) {
    await selector.click();
    await page.getByTestId("language-option-he").click();
    await page.waitForURL(/\/he\/ai-brain/, { timeout: 10000 });
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(outDir, "phase2-lang-switch-es-to-he-ai-brain.png"),
      fullPage: false,
    });
    console.log("saved language switch shot");
  }
  await context.close();
  await browser.close();
}

capture().catch((e) => {
  console.error(e);
  process.exit(1);
});
