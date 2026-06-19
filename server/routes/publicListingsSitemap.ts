import type { Express, Request, Response } from "express";
import {
  buildListingSharePath,
  buildListingShareUrl,
  type ListingShareRef,
} from "@shared/inventory/listingViewUrl";
import {
  countPublicShareableListings,
  fetchPublicListingSitemapEntries,
  type PublicListingSitemapEntry,
} from "../inventory/inventoryDb";
import { getAppOrigin } from "../urlOrigins";
import { requirePublicListingSchemaReady } from "../middleware/requirePublicListingSchemaReady";

export const SITEMAP_URLS_PER_FILE = 45_000;
export const SITEMAP_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=300";

export function applyPublicListingSeoCacheHeaders(res: Response): void {
  res.setHeader("Cache-Control", SITEMAP_CACHE_CONTROL);
}

export type RootSitemapPlan =
  | { kind: "empty" }
  | { kind: "urlset"; fetchLimit: number }
  | { kind: "index"; pageCount: number };

/** Decide whether the root sitemap is empty, a single urlset, or a sharded index. */
export function resolveRootSitemapPlan(total: number): RootSitemapPlan {
  if (total === 0) return { kind: "empty" };
  if (total <= SITEMAP_URLS_PER_FILE) return { kind: "urlset", fetchLimit: total };
  return { kind: "index", pageCount: Math.ceil(total / SITEMAP_URLS_PER_FILE) };
}

export type SitemapShardPageResult =
  | { ok: false }
  | { ok: true; offset: number; limit: number; pageCount: number };

/** Validate shard page number and compute DB offset/limit for that page. */
export function resolveSitemapShardPage(total: number, page: number): SitemapShardPageResult {
  if (!Number.isFinite(page) || page < 1) return { ok: false };
  const pageCount = Math.max(1, Math.ceil(total / SITEMAP_URLS_PER_FILE));
  if (page > pageCount) return { ok: false };
  const offset = (page - 1) * SITEMAP_URLS_PER_FILE;
  const limit = Math.min(SITEMAP_URLS_PER_FILE, Math.max(0, total - offset));
  return { ok: true, offset, limit, pageCount };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatSitemapLastmod(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function sitemapLocForEntry(entry: PublicListingSitemapEntry, appOrigin: string): string {
  const ref: ListingShareRef = { listingId: entry.id, publicSlug: entry.publicSlug };
  return buildListingShareUrl(ref, appOrigin);
}

function renderUrlset(entries: PublicListingSitemapEntry[], appOrigin: string): string {
  const urls = entries
    .map((entry) => {
      const loc = escapeXml(sitemapLocForEntry(entry, appOrigin));
      const lastmod = formatSitemapLastmod(entry.lastmod);
      return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function renderSitemapIndex(appOrigin: string, pageCount: number): string {
  const entries = Array.from({ length: pageCount }, (_, index) => {
    const page = index + 1;
    const loc = escapeXml(`${appOrigin}/public-listings-sitemap-${page}.xml`);
    return `  <sitemap>\n    <loc>${loc}</loc>\n  </sitemap>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>\n`;
}

export function appRobotsTxt(appOrigin: string, includeSitemap: boolean): string {
  const lines = [
    "User-agent: *",
    "Allow: /share/",
    "Disallow: /api/",
    "Disallow: /app/",
    "",
  ];
  if (includeSitemap) {
    lines.push(`Sitemap: ${appOrigin}/public-listings-sitemap.xml`, "");
  }
  return lines.join("\n");
}

function isAppHost(req: Request): boolean {
  const host = (req.get("host") || "").split(":")[0]?.toLowerCase() ?? "";
  const appHost = new URL(getAppOrigin()).hostname.toLowerCase();
  return host === appHost;
}

export function registerPublicListingSitemapRoutes(app: Express): void {
  app.get("/robots.txt", requirePublicListingSchemaReady, async (req: Request, res: Response, next) => {
    if (!isAppHost(req)) return next();
    const appOrigin = getAppOrigin();
    const publishedCount = await countPublicShareableListings();
    applyPublicListingSeoCacheHeaders(res);
    res.type("text/plain").send(appRobotsTxt(appOrigin, publishedCount > 0));
  });

  app.get("/public-listings-sitemap.xml", requirePublicListingSchemaReady, async (_req: Request, res: Response) => {
    try {
      const appOrigin = getAppOrigin();
      const total = await countPublicShareableListings();
      const plan = resolveRootSitemapPlan(total);
      applyPublicListingSeoCacheHeaders(res);

      if (plan.kind === "empty") {
        res.type("application/xml").send(renderUrlset([], appOrigin));
        return;
      }

      if (plan.kind === "urlset") {
        const entries = await fetchPublicListingSitemapEntries(0, plan.fetchLimit);
        res.type("application/xml").send(renderUrlset(entries, appOrigin));
        return;
      }

      res.type("application/xml").send(renderSitemapIndex(appOrigin, plan.pageCount));
    } catch (error) {
      console.error("[public-listing-sitemap] index failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).type("text/plain").send("Sitemap unavailable");
    }
  });

  app.get("/public-listings-sitemap-:page.xml", requirePublicListingSchemaReady, async (req: Request, res: Response) => {
    try {
      const page = Number.parseInt(req.params.page, 10);
      const appOrigin = getAppOrigin();
      const total = await countPublicShareableListings();
      const shard = resolveSitemapShardPage(total, page);
      if (!shard.ok) {
        res.status(404).type("text/plain").send("Not found");
        return;
      }

      const entries = await fetchPublicListingSitemapEntries(shard.offset, shard.limit);
      applyPublicListingSeoCacheHeaders(res);
      res.type("application/xml").send(renderUrlset(entries, appOrigin));
    } catch (error) {
      console.error("[public-listing-sitemap] page failed", {
        page: req.params.page,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).type("text/plain").send("Sitemap unavailable");
    }
  });
}

export { buildListingSharePath, renderUrlset, sitemapLocForEntry };
