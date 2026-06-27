/**
 * Marketing SEO audit — fetches live URLs and validates HTTP status, redirects, canonical, robots.
 * Usage: npx tsx scripts/seo-marketing-audit.ts
 */
import fs from "node:fs";
import path from "node:path";
import { BLOG_POSTS } from "../shared/blogPosts";
import { PAGE_META } from "../server/seo";

const BASE = process.env.MARKETING_URL?.replace(/\/+$/, "") || "https://www.whachatcrm.com";
const UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

type Row = {
  url: string;
  status: number;
  finalUrl: string;
  redirectChain: string[];
  canonical?: string;
  robots?: string;
  title?: string;
  hasOgImage: boolean;
  issue?: string;
};

function parseSitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
}

function parseMeta(html: string, name: string, attr: "name" | "property" = "name"): string | undefined {
  const re = new RegExp(`<meta\\s+${attr}="${name}"\\s+content="([^"]*)"`, "i");
  const m = html.match(re);
  return m?.[1];
}

function parseCanonical(html: string): string | undefined {
  const m = html.match(/<link rel="canonical"\s+href="([^"]*)"/i);
  return m?.[1];
}

function parseTitle(html: string): string | undefined {
  const m = html.match(/<title>([^<]*)<\/title>/i);
  return m?.[1];
}

async function fetchUrl(url: string, maxRedirects = 8): Promise<Row> {
  const chain: string[] = [];
  let current = url;
  for (let i = 0; i <= maxRedirects; i++) {
    const res = await fetch(current, {
      redirect: "manual",
      headers: { "User-Agent": UA, Accept: "text/html" },
    });
    chain.push(`${res.status} ${current}`);
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) {
        return { url, status: res.status, finalUrl: current, redirectChain: chain, hasOgImage: false, issue: "redirect missing Location" };
      }
      current = new URL(loc, current).href;
      continue;
    }
    const html = await res.text();
    return {
      url,
      status: res.status,
      finalUrl: current,
      redirectChain: chain,
      canonical: parseCanonical(html),
      robots: parseMeta(html, "robots"),
      title: parseTitle(html),
      hasOgImage: !!parseMeta(html, "og:image", "property"),
    };
  }
  return { url, status: 0, finalUrl: current, redirectChain: chain, hasOgImage: false, issue: "redirect chain too long" };
}

async function main() {
  const sitemapPath = path.resolve("client/public/sitemap.xml");
  const sitemapXml = fs.readFileSync(sitemapPath, "utf-8");
  const sitemapUrls = parseSitemapLocs(sitemapXml);

  const extraChecks = [
    `${BASE}/privacy`,
    `${BASE}/WhachatCRM-User-Guide.html`,
    `${BASE.replace("www.", "")}/crm-for-whatsapp-business`,
  ];

  const allUrls = [...new Set([...sitemapUrls, ...extraChecks])];
  const rows: Row[] = [];

  for (const url of allUrls) {
    try {
      rows.push(await fetchUrl(url));
    } catch (e) {
      rows.push({
        url,
        status: 0,
        finalUrl: url,
        redirectChain: [],
        hasOgImage: false,
        issue: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const pageMetaPaths = new Set(Object.keys(PAGE_META).map((p) => `${BASE}${p}`));
  const blogPaths = new Set(BLOG_POSTS.map((p) => `${BASE}/blog/${p.slug}`));

  const problems: string[] = [];
  for (const row of rows) {
    if (row.status !== 200) {
      problems.push(`${row.url} → HTTP ${row.status} (${row.redirectChain.join(" → ")})`);
    }
    if (row.robots?.includes("noindex") && !row.url.includes("/app")) {
      problems.push(`${row.url} has noindex`);
    }
    if (row.status === 200 && !row.hasOgImage && !row.url.includes("/unsubscribe")) {
      problems.push(`${row.url} missing og:image in initial HTML`);
    }
    if (row.status === 200 && row.canonical && row.finalUrl.replace(/\/$/, "") !== row.canonical.replace(/\/$/, "")) {
      problems.push(`${row.url} canonical ${row.canonical} != final ${row.finalUrl}`);
    }
  }

  for (const loc of sitemapUrls) {
    if (loc.includes("/privacy") && !loc.includes("privacy-policy")) {
      problems.push(`Sitemap lists redirect source: ${loc}`);
    }
    if (loc.includes("User-Guide.html")) {
      problems.push(`Sitemap lists legacy redirect URL: ${loc}`);
    }
  }

  for (const p of pageMetaPaths) {
    if (!sitemapUrls.includes(p) && !p.endsWith("/unsubscribe")) {
      problems.push(`PAGE_META not in sitemap: ${p}`);
    }
  }

  console.log(JSON.stringify({ base: BASE, checked: rows.length, problems, rows }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
