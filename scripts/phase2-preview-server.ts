/**
 * Minimal Phase 2 SSR preview server for verification + screenshots.
 * Serves dist/public with injectPageMeta / SSR bodies for Phase 2 routes.
 * Reusable for ongoing multilingual SEO QA (not a one-shot dump).
 *
 * Run: npx tsx scripts/phase2-preview-server.ts
 */
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  applyHtmlLangDir,
  generateHomepageHtml,
  generateMarketingPageSsrHtml,
  getLocalizedMarketingRoutes,
  getMarketingRoutes,
  injectHomepageSeoMeta,
  injectLocalizedStaticShell,
  removeStaticShellFromHtml,
  injectPageMeta,
  injectNoindexMeta,
} from "../server/seo";
import { normalizeRequestPath, shouldServeSpaFallback } from "../server/spaRouting";
import {
  isLocaleRootRedirect,
  localeRootRedirectTarget,
  parseLocalizedPath,
} from "../shared/localeRoutes";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPublic = path.resolve(__dirname, "../dist/public");
const indexPath = path.join(distPublic, "index.html");
const PORT = Number(process.env.PHASE2_PREVIEW_PORT || 5055);

const marketingRoutes = [...getMarketingRoutes(), ...getLocalizedMarketingRoutes()];

function contentType(filePath: string): string {
  if (filePath.endsWith(".js")) return "application/javascript";
  if (filePath.endsWith(".css")) return "text/css";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".webp")) return "image/webp";
  if (filePath.endsWith(".woff2")) return "font/woff2";
  if (filePath.endsWith(".xml")) return "application/xml";
  return "application/octet-stream";
}

async function renderHtml(pathname: string): Promise<{ status: number; html: string }> {
  let html = fs.readFileSync(indexPath, "utf8");

  if (pathname === "/") {
    html = injectHomepageSeoMeta(html, "en");
    html = html.replace('<div id="root"></div>', `<div id="root">${generateHomepageHtml("en")}</div>`);
    return { status: 200, html };
  }
  if (pathname === "/es/" || pathname === "/he/") {
    const locale = pathname.startsWith("/he") ? "he" : "es";
    html = injectHomepageSeoMeta(html, locale);
    html = injectLocalizedStaticShell(html, locale);
    html = html.replace('<div id="root"></div>', `<div id="root">${generateHomepageHtml(locale)}</div>`);
    return { status: 200, html };
  }

  const parsed = parseLocalizedPath(pathname);
  if (parsed.isLocalePrefixed && !parsed.isSupported) {
    html = injectNoindexMeta(html);
    html = removeStaticShellFromHtml(html);
    html = html.replace(/<title>.*?<\/title>/i, "<title>404 Page Not Found | WhachatCRM</title>");
    html = html.replace(
      '<div id="root"></div>',
      `<div id="root"><main data-ssr-404="true"><h1>404 Page Not Found</h1></main></div>`,
    );
    return { status: 404, html };
  }

  if (marketingRoutes.includes(pathname) || (parsed.isLocalePrefixed && parsed.isSupported)) {
    html = injectPageMeta(html, pathname);
    html = removeStaticShellFromHtml(html);
    const ssr = generateMarketingPageSsrHtml(pathname);
    if (ssr) {
      html = html.replace('<div id="root"></div>', `<div id="root">${ssr}</div>`);
    }
    return { status: 200, html };
  }

  if (!shouldServeSpaFallback(pathname, marketingRoutes)) {
    html = injectNoindexMeta(html);
    html = removeStaticShellFromHtml(html);
    html = html.replace(/<title>.*?<\/title>/i, "<title>404 Page Not Found | WhachatCRM</title>");
    return { status: 404, html };
  }

  return { status: 200, html: removeStaticShellFromHtml(applyHtmlLangDir(html, "en")) };
}

const server = http.createServer(async (req, res) => {
  try {
    const raw = req.url || "/";
    const pathname = normalizeRequestPath(raw);

    if (isLocaleRootRedirect(pathname) || raw.split("?")[0] === "/es" || raw.split("?")[0] === "/he") {
      const target = localeRootRedirectTarget(raw.split("?")[0] || pathname) || `${pathname}/`;
      res.writeHead(301, { Location: target });
      res.end();
      return;
    }

    const filePath = path.join(distPublic, pathname === "/" ? "" : pathname);
    if (pathname !== "/" && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.writeHead(200, { "Content-Type": contentType(filePath) });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    const { status, html } = await renderHtml(pathname === "/es" || pathname === "/he" ? `${pathname}/` : pathname);
    res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  } catch (e) {
    console.error(e);
    res.writeHead(500);
    res.end("error");
  }
});

server.listen(PORT, () => {
  console.log(`Phase2 preview on http://127.0.0.1:${PORT}`);
});
