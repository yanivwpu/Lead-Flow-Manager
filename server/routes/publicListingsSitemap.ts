import type { Express, Request, Response } from "express";
import {
  buildListingSharePath,
  buildListingShareUrl,
} from "@shared/inventory/listingViewUrl";
import {
  countPublicShareableListings,
  fetchPublicListingSitemapEntries,
  type PublicListingSitemapEntry,
} from "../inventory/inventoryDb";
import { getPublicListingAddressSlug } from "@shared/inventory/publicListingPublication";
import { buildAgentPageUrl } from "@shared/agent/agentPageSlug";
import { countAgentPageSitemapCandidates, fetchAgentPageSitemapSlugs } from "../agentPage/agentPageDb";
import { getAppOrigin } from "../urlOrigins";
import { requirePublicListingSchemaReady } from "../middleware/requirePublicListingSchemaReady";

export const SITEMAP_URLS_PER_FILE = 45_000;
const AGENT_SITEMAP_CANDIDATES_PER_FILE = 250;
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
export function resolveSitemapShardPage(
  total: number,
  page: number,
  pageSize = SITEMAP_URLS_PER_FILE,
): SitemapShardPageResult {
  if (!Number.isSafeInteger(page) || page < 1) return { ok: false };
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (page > pageCount) return { ok: false };
  const offset = (page - 1) * pageSize;
  const limit = Math.min(pageSize, Math.max(0, total - offset));
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
  return buildListingShareUrl({
    listingId: entry.id,
    publicSlug: getPublicListingAddressSlug(entry.publicSlug, entry.listingCompliance),
  }, appOrigin);
}

function renderSitemapUrls(entries: { loc: string; lastmod?: Date }[]): string {
  const urls = entries.map(({ loc, lastmod }) =>
    `  <url>\n    <loc>${escapeXml(loc)}</loc>${lastmod ? `\n    <lastmod>${formatSitemapLastmod(lastmod)}</lastmod>` : ""}\n  </url>`,
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function renderUrlset(entries: PublicListingSitemapEntry[], appOrigin: string): string {
  return renderSitemapUrls(entries.map((entry) => ({
    loc: sitemapLocForEntry(entry, appOrigin),
    lastmod: entry.lastmod,
  })));
}

export function renderAgentPageUrlset(slugs: string[], appOrigin: string): string {
  return renderSitemapUrls(slugs.map((slug) => ({ loc: buildAgentPageUrl(slug, appOrigin) })));
}

export function renderSitemapIndex(appOrigin: string, pageCount: number, agentPageCount = 0): string {
  const filenames = [
    ...Array.from({ length: pageCount }, (_, index) => `public-listings-sitemap-${index + 1}.xml`),
    ...Array.from({ length: agentPageCount }, (_, index) => `public-agents-sitemap-${index + 1}.xml`),
  ];
  const entries = filenames.map((filename) =>
    `  <sitemap>\n    <loc>${escapeXml(`${appOrigin}/${filename}`)}</loc>\n  </sitemap>`,
  ).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>\n`;
}

export function appRobotsTxt(appOrigin: string): string {
  return [
    "User-agent: *",
    "Allow: /share/",
    "Allow: /agents/",
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
  app.get("/robots.txt", requirePublicListingSchemaReady, async (req: Request, res: Response, next) => {
    if (!isAppHost(req)) return next();
    const appOrigin = getAppOrigin();
    applyPublicListingSeoCacheHeaders(res);
    res.type("text/plain").send(appRobotsTxt(appOrigin));
  });

  app.get("/public-listings-sitemap.xml", requirePublicListingSchemaReady, async (_req: Request, res: Response) => {
    try {
      const appOrigin = getAppOrigin();
      const [total, agentCandidates] = await Promise.all([
        countPublicShareableListings(),
        countAgentPageSitemapCandidates(),
      ]);
      const plan = resolveRootSitemapPlan(total);
      if (agentCandidates > 0) {
        // Keep the existing root URL and give Agent Pages their own uncached shards.
        const listingPages = Math.ceil(total / SITEMAP_URLS_PER_FILE);
        const agentPages = Math.ceil(agentCandidates / AGENT_SITEMAP_CANDIDATES_PER_FILE);
        res.setHeader("Cache-Control", "no-store");
        res.type("application/xml").send(renderSitemapIndex(appOrigin, listingPages, agentPages));
        return;
      }
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

  app.get("/public-agents-sitemap-:page.xml", requirePublicListingSchemaReady, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const page = Number(req.params.page);
      const total = await countAgentPageSitemapCandidates();
      const shard = resolveSitemapShardPage(total, page, AGENT_SITEMAP_CANDIDATES_PER_FILE);
      if (!shard.ok || !total) {
        res.status(404).type("text/plain").send("Not found");
        return;
      }
      const slugs = await fetchAgentPageSitemapSlugs(shard.offset, shard.limit);
      res.type("application/xml").send(renderAgentPageUrlset(slugs, getAppOrigin()));
    } catch (error) {
      console.error("[public-agent-sitemap] render failed", error);
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
