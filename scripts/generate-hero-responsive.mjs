/**
 * Builds responsive hero LCP assets from the conversation mockup PNG.
 * Output: client/public/hero/hero-{w}.{avif,webp}
 * Run: node scripts/generate-hero-responsive.mjs
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "client", "public", "hero");

/** Canonical LCP asset used by static shell + React Welcome. */
const srcPng = path.join(outDir, "whachat-hero-mockup.png");
/** Fallback sources if public PNG is missing during a clean checkout. */
const srcFallback = path.join(
  root,
  "attached_assets",
  "generated_images",
  "whatsapp_crm_dashboard_mockup_resized.png",
);

const WIDTHS = [400, 640, 768, 1024];

async function writeWebp(buf, w, q) {
  const name = `hero-${w}.webp`;
  const fp = path.join(outDir, name);
  await sharp(buf)
    .resize(w, null, { withoutEnlargement: true, fit: "inside" })
    .webp({ quality: q, effort: 6 })
    .toFile(fp);
  return { name, bytes: fs.statSync(fp).size };
}

async function writeAvif(buf, w, q) {
  const name = `hero-${w}.avif`;
  const fp = path.join(outDir, name);
  await sharp(buf)
    .resize(w, null, { withoutEnlargement: true, fit: "inside" })
    .avif({ quality: q, effort: 4 })
    .toFile(fp);
  return { name, bytes: fs.statSync(fp).size };
}

async function main() {
  const input = fs.existsSync(srcPng)
    ? srcPng
    : fs.existsSync(srcFallback)
      ? srcFallback
      : null;
  if (!input) {
    console.warn("[hero] Source image not found. Skip responsive hero generation.");
    process.exit(0);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const inputBuf = fs.readFileSync(input);
  const meta = await sharp(inputBuf).metadata();
  console.log(
    `[hero] Source ${path.basename(input)} ${meta.width}x${meta.height}`,
  );

  const results = [];
  for (const w of WIDTHS) {
    let webpQ = w <= 400 ? 78 : w <= 640 ? 80 : w <= 768 ? 81 : 82;
    let avifQ = w <= 400 ? 45 : w <= 640 ? 48 : w <= 768 ? 50 : 52;

    let webp = await writeWebp(inputBuf, w, webpQ);
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

  for (const r of results) {
    console.log(`  ${r.name}\t${(r.bytes / 1024).toFixed(1)} KB`);
  }
  console.log(`[hero] Wrote ${results.length} files to ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
