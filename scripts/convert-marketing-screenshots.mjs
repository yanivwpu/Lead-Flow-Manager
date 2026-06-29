/**
 * Convert marketing screenshot sources to WebP in client/public/images/screenshots/
 * Usage: node scripts/convert-marketing-screenshots.mjs
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const outDir = path.join(repoRoot, "client/public/images/screenshots");
const assetsDirs = [
  path.join(repoRoot, "assets"),
  path.join(repoRoot, ".cursor/projects/c-Users-ssamm-Desktop-Lead-Flow-Manager/assets"),
  path.join(process.env.USERPROFILE || "", ".cursor/projects/c-Users-ssamm-Desktop-Lead-Flow-Manager/assets"),
].filter((d, i, arr) => arr.indexOf(d) === i);

function resolveAsset(filename) {
  for (const dir of assetsDirs) {
    const p = path.join(dir, filename);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const USER_SCREENSHOTS = [
  {
    out: "property-match-details.webp",
    src: "c__Users_ssamm_AppData_Roaming_Cursor_User_workspaceStorage_a5fb108744b602079d0761d00e74ddd0_images_Screenshot_2026-06-28_141856-fedaab43-89cb-4be6-bb58-cb2ec552e392.png",
  },
  {
    out: "automation-workflows.webp",
    src: "c__Users_ssamm_AppData_Roaming_Cursor_User_workspaceStorage_a5fb108744b602079d0761d00e74ddd0_images_Screenshot_2026-06-28_142050-79d40d0f-7439-4740-83d6-8019be082b3f.png",
  },
  {
    out: "inventory-health.webp",
    src: "c__Users_ssamm_AppData_Roaming_Cursor_User_workspaceStorage_a5fb108744b602079d0761d00e74ddd0_images_Screenshot_2026-06-28_142152-2b97fc5c-2159-4428-9e3c-53d3d4999c8d.png",
  },
  {
    out: "ai-copilot.webp",
    src: "c__Users_ssamm_AppData_Roaming_Cursor_User_workspaceStorage_a5fb108744b602079d0761d00e74ddd0_images_Screenshot_2026-06-28_141804-3fcebb9a-7aa1-4356-bb0c-28ca826d0a31.png",
  },
  {
    out: "agent-page-settings.webp",
    src: "c__Users_ssamm_AppData_Roaming_Cursor_User_workspaceStorage_a5fb108744b602079d0761d00e74ddd0_images_Screenshot_2026-06-28_142354-cd53fec5-3577-48c6-ae0f-c57cf7df9083.png",
  },
  {
    out: "agent-page-public.webp",
    src: "c__Users_ssamm_AppData_Roaming_Cursor_User_workspaceStorage_a5fb108744b602079d0761d00e74ddd0_images_Screenshot_2026-06-28_142222-21204864-9c6b-4491-9658-c5a4bf6b78f6.png",
  },
  {
    out: "inventory-source.webp",
    src: "c__Users_ssamm_AppData_Roaming_Cursor_User_workspaceStorage_a5fb108744b602079d0761d00e74ddd0_images_Screenshot_2026-06-28_142248-f6e00124-ce7f-4bb6-80ec-35242846181d.png",
  },
  {
    out: "unified-inbox.webp",
    src: "c__Users_ssamm_AppData_Roaming_Cursor_User_workspaceStorage_a5fb108744b602079d0761d00e74ddd0_images_Screenshot_2026-06-28_141728-fc6902c9-0815-4809-b6c0-a19084c7daa9.png",
  },
  {
    out: "embedded-signup-meta.webp",
    src: "c__Users_ssamm_AppData_Roaming_Cursor_User_workspaceStorage_a5fb108744b602079d0761d00e74ddd0_images_Screenshot_2026-06-28_231617-5f0d6ac0-a9f4-412e-a2e5-59408e707ce0.png",
  },
  {
    out: "automation-template-cards.webp",
    src: "c__Users_ssamm_AppData_Roaming_Cursor_User_workspaceStorage_a5fb108744b602079d0761d00e74ddd0_images_Screenshot_2026-06-28_231700-0bbcdfb3-62e6-42d2-8de6-f0f6bd77e9d0.png",
  },
];

const EXISTING_PUBLIC = [
  { out: "embedded-signup.webp", src: "client/public/email/activation/embedded-signup.png" },
  { out: "connect-whatsapp.webp", src: "client/public/email/activation/connect-whatsapp.png" },
  { out: "channels.webp", src: "client/public/email/activation/channels.png" },
  { out: "meta-business-selection.webp", src: "client/public/email/activation/meta-business-selection.png" },
];

async function toWebp(inputPath, outputPath, maxWidth = 1400) {
  const meta = await sharp(inputPath).metadata();
  const width = meta.width && meta.width > maxWidth ? maxWidth : meta.width;
  await sharp(inputPath)
    .resize(width ? { width, withoutEnlargement: true } : undefined)
    .webp({ quality: 86, effort: 4 })
    .toFile(outputPath);
  const stat = fs.statSync(outputPath);
  console.log(`  ${path.basename(outputPath)} (${Math.round(stat.size / 1024)} KB)`);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  // Copy responsive dashboard hero as marketing dashboard screenshot
  const dashboardSrc = path.join(repoRoot, "client/public/hero/dashboard-1024.webp");
  if (fs.existsSync(dashboardSrc)) {
    fs.copyFileSync(dashboardSrc, path.join(outDir, "dashboard.webp"));
    console.log("  dashboard.webp (copied from hero)");
  }

  console.log("Converting user screenshots...");
  for (const { out, src } of USER_SCREENSHOTS) {
    const input = resolveAsset(src);
    if (!input) {
      console.warn(`  SKIP missing: ${src}`);
      continue;
    }
    await toWebp(input, path.join(outDir, out));
  }

  console.log("Converting existing activation PNGs...");
  for (const { out, src } of EXISTING_PUBLIC) {
    const input = path.join(repoRoot, src);
    if (!fs.existsSync(input)) {
      console.warn(`  SKIP missing: ${src}`);
      continue;
    }
    await toWebp(input, path.join(outDir, out), 1200);
  }

  // property-matching uses unified inbox crop variant — same source, optimized width
  const unifiedSrc = path.join(outDir, "unified-inbox.webp");
  if (fs.existsSync(unifiedSrc)) {
    fs.copyFileSync(unifiedSrc, path.join(outDir, "property-matching.webp"));
    console.log("  property-matching.webp (from unified-inbox)");
  }

  // Lead score uses ai-copilot panel screenshot
  const copilotSrc = path.join(outDir, "ai-copilot.webp");
  if (fs.existsSync(copilotSrc)) {
    fs.copyFileSync(copilotSrc, path.join(outDir, "lead-score.webp"));
    console.log("  lead-score.webp (from ai-copilot)");
  }

  console.log("Done →", outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
