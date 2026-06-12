/**
 * Render flyer ribbon preview HTML/screenshot.
 * Usage: npx tsx scripts/flyer-ribbon-comparison.ts [output-dir]
 */
import fs from "fs";
import path from "path";
import {
  buildPublicListingFlyerHtml,
  inventoryRowToFlyerListing,
} from "../shared/inventory/publicListingFlyer";

const HERO_PHOTO =
  "https://dvvjkgh94f2v6.cloudfront.net/523fa3e6/475213068/83dcefb7.jpeg";

const listing = inventoryRowToFlyerListing({
  id: "b6aa87ce-c042-474e-a216-2394413be8ea",
  priceCents: 340000,
  beds: "3",
  baths: "2",
  squareFeet: 1152,
  yearBuilt: 1961,
  hoaFeeCents: null,
  propertyType: "house",
  propertySubtype: "Single Family Residence",
  description: "Charming home in Pompano Beach.",
  features: [],
  photos: [
    { url: HERO_PHOTO, order: 0 },
    { url: HERO_PHOTO, order: 1 },
  ],
  addressLine1: "1881 NW 5th Ter",
  addressLine2: "# 1881",
  city: "Pompano Beach",
  state: "FL",
  zip: "33060",
  latitude: 26.23,
  longitude: -80.12,
  status: "active",
  providerListingId: "A11990000",
  listingDetails: {},
});

const agent = {
  name: "Yaniv Haramatiy",
  email: "yanivharamaty@gmail.com",
  phone: "954.513.8408",
  avatarUrl: null,
  brokerageName: "Canvas Real Estate",
  bookingLink: "https://calendly.com/yaniv-whachatcrm",
};

const shareUrl =
  "https://app.whachatcrm.com/share/listings/1881-nw-5th-ter-1881-pompano-beach-fl-33060-b6aa87ce";
const qrDataUrl =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="100%" height="100%" fill="#e2e8f0"/></svg>',
  );

function buildPreviewPage(): string {
  const flyer = buildPublicListingFlyerHtml({
    listing,
    agent,
    shareUrl,
    qrDataUrl,
  });
  const styleMatch = flyer.match(/<style>([\s\S]*?)<\/style>/);
  const bodyMatch = flyer.match(/<body>([\s\S]*?)<\/body>/);
  const styles = styleMatch?.[1] ?? "";
  const body = bodyMatch?.[1] ?? "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Flyer ribbon preview</title>
  <style>
    body { margin: 0; padding: 24px; background: #e2e8f0; }
    .preview-flyer .flyer { margin: 0 auto; }
    .preview-flyer .flyer-floating-actions,
    .preview-flyer #toast,
    .preview-flyer script { display: none !important; }
    ${styles}
  </style>
</head>
<body>
  <div class="preview-flyer">${body}</div>
</body>
</html>`;
}

async function screenshotWithPlaywright(htmlPath: string, pngPath: string): Promise<void> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1960, height: 1200 } });
    await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: pngPath, fullPage: false });
  } finally {
    await browser.close();
  }
}

async function main() {
  const outDir = path.resolve(process.argv[2] || path.join(process.cwd(), "flyer-ribbon-comparison"));
  fs.mkdirSync(outDir, { recursive: true });

  const htmlPath = path.join(outDir, "preview.html");
  const pngPath = path.join(outDir, "flyer-ribbon-preview.png");

  fs.writeFileSync(htmlPath, buildPreviewPage(), "utf-8");
  console.log("Wrote", htmlPath);

  try {
    await screenshotWithPlaywright(htmlPath, pngPath);
    console.log("Wrote", pngPath);
  } catch (err) {
    console.warn(
      "Playwright screenshot skipped (install with: npx playwright install chromium):",
      err instanceof Error ? err.message : err,
    );
    console.log("Open preview.html in a browser to preview the ribbon.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
