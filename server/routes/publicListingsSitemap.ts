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

const SITEMAP_URLS_PER_FILE = 45_000;

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

function renderSitemapIndex(appOrigin: string, pageCount: number): string {
  const entries = Array.from({ length: pageCount }, (_, index) => {
    const page = index + 1;
    const loc = escapeXml(`${appOrigin}/public-listings-sitemap-${page}.xml`);
    return `  <sitemap>\n    <loc>${loc}</loc>\n  </sitemap>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>\n`;
}

function appRobotsTxt(appOrigin: string): string {
  return [
    "User-agent: *",
    "Allow: /share/",
    "Disallow: /api/",
    "Disallow: /app/",
    "",
    `Sitemap: ${appOrigin}/public-listings-sitemap.xml`,
    "",
  ].join("\n");
}

function isAppHost(req: Request): boolean {
  const host = (req.get("host") || "").split(":")[0]?.toLowerCase() ?? "";
  const appHost = new URL(getAppOrigin()).hostname.toLowerCase();
  return host === appHost;
}

export function registerPublicListingSitemapRoutes(app: Express): void {
  app.get("/robots.txt", (req: Request, res: Response, next) => {
    if (!isAppHost(req)) return next();
    res.type("text/plain").send(appRobotsTxt(getAppOrigin()));
  });

  app.get("/public-listings-sitemap.xml", async (_req: Request, res: Response) => {
    try {
      const appOrigin = getAppOrigin();
      const total = await countPublicShareableListings();

      if (total === 0) {
        res.type("application/xml").send(renderUrlset([], appOrigin));
        return;
      }

      if (total <= SITEMAP_URLS_PER_FILE) {
        const entries = await fetchPublicListingSitemapEntries(0, total);
        res.type("application/xml").send(renderUrlset(entries, appOrigin));
        return;
      }

      const pageCount = Math.ceil(total / SITEMAP_URLS_PER_FILE);
      res.type("application/xml").send(renderSitemapIndex(appOrigin, pageCount));
    } catch (error) {
      console.error("[public-listing-sitemap] index failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).type("text/plain").send("Sitemap unavailable");
    }
  });

  app.get("/public-listings-sitemap-:page.xml", async (req: Request, res: Response) => {
    try {
      const page = Number.parseInt(req.params.page, 10);
      if (!Number.isFinite(page) || page < 1) {
        res.status(404).type("text/plain").send("Not found");
        return;
      }

      const appOrigin = getAppOrigin();
      const total = await countPublicShareableListings();
      const pageCount = Math.max(1, Math.ceil(total / SITEMAP_URLS_PER_FILE));
      if (page > pageCount) {
        res.status(404).type("text/plain").send("Not found");
        return;
      }

      const offset = (page - 1) * SITEMAP_URLS_PER_FILE;
      const limit = Math.min(SITEMAP_URLS_PER_FILE, Math.max(0, total - offset));
      const entries = await fetchPublicListingSitemapEntries(offset, limit);
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
