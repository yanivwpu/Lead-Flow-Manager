/**
 * Builds responsive hero assets into client/public/hero/ for Welcome LCP.
 * Run: node scripts/generate-hero-responsive.mjs
 * Uses whatsapp_crm_dashboard_mockup_resized.png (sharp detail when scaling down).
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "client", "public", "hero");
const srcPng = path.join(
  root,
  "attached_assets",
  "generated_images",
  "whatsapp_crm_dashboard_mockup_resized.png",
);
const srcWebp = path.join(
  root,
  "attached_assets",
  "generated_images",
  "whatsapp_crm_dashboard_mockup.webp",
);

/** 768w bridges retina phones between 640 and 1024 srcset selection */
const WIDTHS = [400, 640, 768, 1024];

async function writeWebp(buf, w, q) {
  const name = `dashboard-${w}.webp`;
  const fp = path.join(outDir, name);
  await sharp(buf)
    .resize(w, null, { withoutEnlargement: true, fit: "inside" })
    .webp({ quality: q, effort: 6 })
    .toFile(fp);
  const st = fs.statSync(fp);
  return { name, bytes: st.size };
}

async function writeAvif(buf, w, q) {
  const name = `dashboard-${w}.avif`;
  const fp = path.join(outDir, name);
  await sharp(buf)
    .resize(w, null, { withoutEnlargement: true, fit: "inside" })
    .avif({ quality: q, effort: 4 })
    .toFile(fp);
  const st = fs.statSync(fp);
  return { name, bytes: st.size };
}

async function main() {
  const input = fs.existsSync(srcPng) ? srcPng : fs.existsSync(srcWebp) ? srcWebp : null;
  if (!input) {
    console.warn("[hero] Source image not found (expected resized PNG or webp). Skip.");
    process.exit(0);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const inputBuf = fs.readFileSync(input);

  const results = [];
  for (const w of WIDTHS) {
    let webpQ = w <= 400 ? 78 : w <= 640 ? 80 : w <= 768 ? 81 : 82;
    let avifQ = w <= 400 ? 45 : w <= 640 ? 48 : w <= 768 ? 50 : 52;

    let webp = await writeWebp(inputBuf, w, webpQ);
    /** Mobile LCP targets ≤ ~80 KB WebP for widths used on phones */
    while (w <= 768 && webp.bytes > 80 * 1024 && webpQ > 50) {
      webpQ -= 5;
      webp = await writeWebp(inputBuf, w, webpQ);
    }

    let avif = await writeAvif(inputBuf, w, avifQ);
    while (w <= 768 && avif.bytes > 75 * 1024 && avifQ > 35) {
      avifQ -= 5;
      avif = await writeAvif(inputBuf, w, avifQ);
    }

    results.push(webp, avif);
  }

  console.log("[hero] Wrote", outDir);
  for (const r of results) {
    console.log(`  ${r.name}\t${(r.bytes / 1024).toFixed(1)} KB`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
