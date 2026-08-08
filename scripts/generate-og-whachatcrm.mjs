import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Builds the default WhachatCRM Open Graph image (1200×630) from the
 * exact brand W logo — no logo redesign. Canvas fill is sampled from the logo.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const src = path.join(
  process.env.USERPROFILE || "",
  ".cursor",
  "projects",
  "c-Users-ssamm-Desktop-Lead-Flow-Manager",
  "assets",
  "c__Users_ssamm_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_APP_logo-44f317d8-d7bf-49dd-86fd-8474363f53aa.png",
);

const brandDir = path.join(root, "client/public/brand");
const brandLogo = path.join(brandDir, "whachatcrm-w-logo.png");
const ogPath = path.join(root, "client/public/og/og-whachatcrm.png");

fs.mkdirSync(brandDir, { recursive: true });
fs.mkdirSync(path.dirname(ogPath), { recursive: true });

// Prefer the exact supplied source; otherwise reuse the committed brand asset.
if (fs.existsSync(src)) {
  fs.copyFileSync(src, brandLogo);
} else if (!fs.existsSync(brandLogo)) {
  console.error("Source logo not found:", src);
  process.exit(1);
}

const meta = await sharp(brandLogo).metadata();
console.log("source", meta.width, meta.height, meta.format);

const { data, info } = await sharp(brandLogo)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const sample = (x, y) => {
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
};

const corners = [
  [0, 0],
  [info.width - 1, 0],
  [0, info.height - 1],
  [info.width - 1, info.height - 1],
].map(([x, y]) => sample(x, y));

const fill = {
  r: Math.round(corners.reduce((s, c) => s + c[0], 0) / corners.length),
  g: Math.round(corners.reduce((s, c) => s + c[1], 0) / corners.length),
  b: Math.round(corners.reduce((s, c) => s + c[2], 0) / corners.length),
  alpha: 1,
};
console.log("fill RGB", fill);

const W = 1200;
const H = 630;
// Previous mark was ~52% of canvas height; enlarge ~60% (within 50–70%)
// while keeping clear edge padding for compact Facebook cards.
const previousMarkSize = Math.round(H * 0.52);
const markSize = Math.round(previousMarkSize * 1.6);
const left = Math.round((W - markSize) / 2);
const top = Math.round((H - markSize) / 2);
console.log("markSize", markSize, "paddingX", left, "paddingY", top);

const mark = await sharp(brandLogo)
  .resize(markSize, markSize, { fit: "fill", kernel: "lanczos3" })
  .png()
  .toBuffer();

await sharp({
  create: { width: W, height: H, channels: 4, background: fill },
})
  .composite([{ input: mark, left, top }])
  .png({ compressionLevel: 9 })
  .toFile(ogPath);

const ogMeta = await sharp(ogPath).metadata();
console.log("og", ogMeta.width, ogMeta.height, fs.statSync(ogPath).size, "bytes");
console.log("wrote", brandLogo);
console.log("wrote", ogPath);
