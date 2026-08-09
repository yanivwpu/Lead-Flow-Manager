/**
 * Expand sitemap.xml with Phase 2 localized URLs + xhtml hreflang alternates.
 *
 * Reusable multilingual SEO maintenance helper — re-run after adding Phase 2 paths.
 * Does not write temporary review artifacts into git.
 *
 * Run: node scripts/expand-phase2-sitemap.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// Inline Phase 2 paths (avoid TS import friction in plain node).
const PHASE2 = [
  "/",
  "/pricing",
  "/prospect-ai",
  "/ai-brain",
  "/ai-copilot",
  "/unified-inbox",
  "/automations",
  "/chatbot-builder",
  "/campaigns",
  "/realtor-growth-engine",
  "/integrations",
  "/shared-team-inbox",
  "/real-estate-crm",
  "/solutions/ecommerce",
  "/solutions/local-service-businesses",
  "/solutions/marketing-agencies",
  "/solutions/med-spas",
];

const BASE = "https://www.whachatcrm.com";
const TODAY = "2026-08-09";

function localize(englishPath, locale) {
  if (locale === "en") return englishPath === "/" ? `${BASE}/` : `${BASE}${englishPath}`;
  if (englishPath === "/") return `${BASE}/${locale}/`;
  return `${BASE}/${locale}${englishPath}`;
}

function hreflangBlock(englishPath) {
  const en = localize(englishPath, "en");
  const es = localize(englishPath, "es");
  const he = localize(englishPath, "he");
  return [
    `    <xhtml:link rel="alternate" hreflang="en" href="${en}"/>`,
    `    <xhtml:link rel="alternate" hreflang="es" href="${es}"/>`,
    `    <xhtml:link rel="alternate" hreflang="he" href="${he}"/>`,
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${en}"/>`,
  ].join("\n");
}

function englishPathFromLoc(loc) {
  const u = loc.replace(BASE, "") || "/";
  if (u === "/" || u === "/es/" || u === "/he/") return "/";
  return u.replace(/^\/(es|he)/, "") || "/";
}

const sitemapPath = path.join(root, "client/public/sitemap.xml");
let xml = fs.readFileSync(sitemapPath, "utf8");

// Ensure xhtml namespace
if (!xml.includes("xmlns:xhtml")) {
  xml = xml.replace(
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  );
}

const existingLocs = new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
const originalCount = existingLocs.size;

// Add xhtml alternates to existing Phase 2 English URLs that lack them
for (const enPath of PHASE2) {
  const enLoc = localize(enPath, "en");
  if (!existingLocs.has(enLoc)) continue;
  // If this url block already has xhtml, skip rewrite
  const locEsc = enLoc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blockRe = new RegExp(
    `(<url>\\s*<loc>${locEsc}</loc>[\\s\\S]*?</url>)`,
    "m",
  );
  const match = xml.match(blockRe);
  if (!match) continue;
  if (match[1].includes("xhtml:link")) continue;
  const lastmod = (match[1].match(/<lastmod>([^<]+)<\/lastmod>/) || [, TODAY])[1];
  const priority = (match[1].match(/<priority>([^<]+)<\/priority>/) || [, "0.8"])[1];
  const changefreq = (match[1].match(/<changefreq>([^<]+)<\/changefreq>/) || [, "monthly"])[1];
  const rebuilt = `  <url>
    <loc>${enLoc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
${hreflangBlock(enPath)}
  </url>`;
  xml = xml.replace(match[1], rebuilt.trim());
}

// Append missing localized URLs
const additions = [];
for (const enPath of PHASE2) {
  for (const locale of ["es", "he"]) {
    const loc = localize(enPath, locale);
    if (existingLocs.has(loc)) continue;
    additions.push(`  <url>
    <loc>${loc}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${enPath === "/" || enPath === "/pricing" ? "0.9" : "0.8"}</priority>
${hreflangBlock(enPath)}
  </url>`);
    existingLocs.add(loc);
  }
}

if (additions.length) {
  xml = xml.replace("</urlset>", `${additions.join("\n")}\n</urlset>`);
}

fs.writeFileSync(sitemapPath, xml);

const finalLocs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const esCount = finalLocs.filter((l) => l.includes("/es/") || l.endsWith("/es/")).length;
const heCount = finalLocs.filter((l) => l.includes("/he/") || l.endsWith("/he/")).length;
const enCount = finalLocs.length - esCount - heCount;
const clusters = PHASE2.length;

console.log(
  JSON.stringify(
    {
      originalCount,
      finalTotal: finalLocs.length,
      english: enCount,
      spanish: esCount,
      hebrew: heCount,
      hreflangClusters: clusters,
      added: additions.length,
      hasXhtmlNs: xml.includes("xmlns:xhtml"),
      hasBareEs: finalLocs.includes(`${BASE}/es`),
      hasBareHe: finalLocs.includes(`${BASE}/he`),
    },
    null,
    2,
  ),
);
