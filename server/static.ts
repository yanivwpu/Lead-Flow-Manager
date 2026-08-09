import express, { type Express, type Response } from "express";
import fs from "fs";
import path from "path";
import {
  injectSeoMeta,
  generateBlogListHtml,
  generateBlogPostHtml,
  generateHomepageHtml,
  injectHomepageSeoMeta,
  injectLocalizedStaticShell,
  removeStaticShellFromHtml,
  injectPageMeta,
  generateMarketingPageSsrHtml,
  getMarketingRoutes,
  getLocalizedMarketingRoutes,
  isNoIndexPath,
  injectNoindexMeta,
} from "./seo";
import { normalizeRequestPath, shouldServeSpaFallback } from "./spaRouting";
import {
  isLocaleRootRedirect,
  localeRootRedirectTarget,
} from "@shared/localeRoutes";

const ONE_YEAR = 31536000;
const ONE_WEEK = 604800;
const ONE_DAY = 86400;

/** Long-lived cache for fingerprinted build assets; shorter cache for public media. */
function setStaticAssetCacheHeaders(res: Response, filePath: string) {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();

  if (normalized.includes("/assets/")) {
    res.setHeader("Cache-Control", `public, max-age=${ONE_YEAR}, immutable`);
    return;
  }

  if (/\.(css|js|mjs|cjs|map)$/i.test(normalized)) {
    res.setHeader("Cache-Control", `public, max-age=${ONE_YEAR}, immutable`);
    return;
  }

  if (/\.(avif|webp|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|otf|eot)$/i.test(normalized)) {
    res.setHeader("Cache-Control", `public, max-age=${ONE_WEEK}`);
    return;
  }

  if (normalized.includes("/.well-known/")) {
    res.setHeader("Cache-Control", `public, max-age=${ONE_DAY}`);
  }
}

function staticWithCache(root: string) {
  return express.static(root, {
    index: false,
    setHeaders(res, filePath) {
      setStaticAssetCacheHeaders(res, filePath);
    },
  });
}

function sendSpaShell(res: Response, indexPath: string, status = 200) {
  res.status(status);
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  res.sendFile(indexPath);
}

function sendNoIndexSpaShell(res: Response, indexPath: string, status = 200) {
  fs.readFile(indexPath, "utf-8", (err, html) => {
    if (err) {
      return sendSpaShell(res, indexPath, status);
    }
    let enhancedHtml = injectNoindexMeta(html);
    enhancedHtml = removeStaticShellFromHtml(enhancedHtml);
    res.status(status);
    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(enhancedHtml);
  });
}

/** Unknown marketing URL: HTTP 404 + noindex + SPA shell so React NotFound can hydrate. */
function sendNotFoundSpaShell(res: Response, indexPath: string) {
  fs.readFile(indexPath, "utf-8", (err, html) => {
    if (err) {
      res.status(404).type("text").send("Not Found");
      return;
    }
    let enhancedHtml = injectNoindexMeta(html);
    enhancedHtml = removeStaticShellFromHtml(enhancedHtml);
    enhancedHtml = enhancedHtml.replace(
      /<title>.*?<\/title>/i,
      "<title>404 Page Not Found | WhachatCRM</title>",
    );
    if (enhancedHtml.includes('<div id="root"></div>')) {
      enhancedHtml = enhancedHtml.replace(
        '<div id="root"></div>',
        `<div id="root"><main data-ssr-404="true"><h1>404 Page Not Found</h1><p>This page does not exist.</p><p><a href="/">Go to homepage</a></p></main></div>`,
      );
    }
    res.status(404);
    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(enhancedHtml);
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  const indexPath = path.resolve(distPath, "index.html");

  // Serve uploaded files for Twilio media messages
  const uploadsPath = path.resolve(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
  }
  app.use("/uploads", staticWithCache(uploadsPath));

  // Serve attached assets (avatars, stock images, etc.)
  const attachedAssetsPath = path.resolve(process.cwd(), "attached_assets");
  if (fs.existsSync(attachedAssetsPath)) {
    app.use("/attached_assets", staticWithCache(attachedAssetsPath));
  }

  // Homepage SSR - MUST be before express.static to intercept /
  app.get("/", (req, res) => {
    fs.readFile(indexPath, "utf-8", (err, html) => {
      if (err) {
        return res.sendFile(indexPath);
      }

      let enhancedHtml = injectHomepageSeoMeta(html, "en");
      const ssrContent = generateHomepageHtml("en");
      enhancedHtml = enhancedHtml.replace(
        '<div id="root"></div>',
        `<div id="root">${ssrContent}</div>`,
      );

      res.set("Content-Type", "text/html");
      res.set("Cache-Control", "public, max-age=3600"); // 1 hour cache
      res.send(enhancedHtml);
    });
  });

  // Locale homepage roots: /es/ and /he/ (canonical). /es and /he redirect once.
  for (const locale of ["es", "he"] as const) {
    app.get(`/${locale}/`, (_req, res) => {
      fs.readFile(indexPath, "utf-8", (err, html) => {
        if (err) {
          return res.sendFile(indexPath);
        }
        let enhancedHtml = injectHomepageSeoMeta(html, locale);
        enhancedHtml = injectLocalizedStaticShell(enhancedHtml, locale);
        const ssrContent = generateHomepageHtml(locale);
        enhancedHtml = enhancedHtml.replace(
          '<div id="root"></div>',
          `<div id="root">${ssrContent}</div>`,
        );
        res.set("Content-Type", "text/html");
        res.set("Cache-Control", "public, max-age=3600");
        res.send(enhancedHtml);
      });
    });
  }

  app.get("/es", (_req, res) => {
    res.redirect(301, "/es/");
  });
  app.get("/he", (_req, res) => {
    res.redirect(301, "/he/");
  });

  // Blog pages SSR - MUST be before express.static
  app.get("/blog", (req, res) => {
    fs.readFile(indexPath, "utf-8", (err, html) => {
      if (err) {
        console.error("[SSR/blog] Failed to read index.html:", err.message);
        return res.sendFile(indexPath);
      }

      try {
        let enhancedHtml = injectSeoMeta(html, "/blog");
        enhancedHtml = removeStaticShellFromHtml(enhancedHtml);
        const ssrContent = generateBlogListHtml();
        enhancedHtml = enhancedHtml.replace(
          '<div id="root"></div>',
          `<div id="root">${ssrContent}</div>`,
        );

        res.set("Content-Type", "text/html");
        res.set("Cache-Control", "public, max-age=3600");
        res.send(enhancedHtml);
      } catch (ssrErr: unknown) {
        const message = ssrErr instanceof Error ? ssrErr.message : String(ssrErr);
        console.error("[SSR/blog] Render failed, falling back to SPA shell:", message);
        if (ssrErr instanceof Error && ssrErr.stack) {
          console.error(ssrErr.stack);
        }
        sendSpaShell(res, indexPath);
      }
    });
  });

  app.get("/blog/:slug", (req, res) => {
    const slug = req.params.slug;
    fs.readFile(indexPath, "utf-8", (err, html) => {
      if (err) {
        console.error(`[SSR/blog/${slug}] Failed to read index.html:`, err.message);
        return res.sendFile(indexPath);
      }

      try {
        let enhancedHtml = injectSeoMeta(html, `/blog/${slug}`);
        enhancedHtml = removeStaticShellFromHtml(enhancedHtml);
        const ssrContent = generateBlogPostHtml(slug);
        if (ssrContent) {
          enhancedHtml = enhancedHtml.replace(
            '<div id="root"></div>',
            `<div id="root">${ssrContent}</div>`,
          );
        }

        res.set("Content-Type", "text/html");
        res.set("Cache-Control", "public, max-age=3600");
        res.send(enhancedHtml);
      } catch (ssrErr: unknown) {
        const message = ssrErr instanceof Error ? ssrErr.message : String(ssrErr);
        console.error(`[SSR/blog/${slug}] Render failed, falling back to SPA shell:`, message);
        if (ssrErr instanceof Error && ssrErr.stack) {
          console.error(ssrErr.stack);
        }
        sendSpaShell(res, indexPath);
      }
    });
  });

  // Marketing pages with SSR meta injection - MUST be before express.static
  const marketingRoutes = getMarketingRoutes();
  marketingRoutes.forEach((route) => {
    app.get(route, (req, res) => {
      fs.readFile(indexPath, "utf-8", (err, html) => {
        if (err) {
          console.error(`[SSR${route}] Failed to read index.html:`, err.message);
          return res.sendFile(indexPath);
        }

        try {
          let enhancedHtml = injectPageMeta(html, route);
          enhancedHtml = removeStaticShellFromHtml(enhancedHtml);
          const ssrBody = generateMarketingPageSsrHtml(route);
          if (ssrBody && enhancedHtml.includes('<div id="root"></div>')) {
            enhancedHtml = enhancedHtml.replace(
              '<div id="root"></div>',
              `<div id="root">${ssrBody}</div>`,
            );
          }
          res.set("Content-Type", "text/html");
          res.set("Cache-Control", "public, max-age=3600");
          res.send(enhancedHtml);
        } catch (ssrErr: unknown) {
          const message = ssrErr instanceof Error ? ssrErr.message : String(ssrErr);
          console.error(`[SSR${route}] Render failed, falling back to SPA shell:`, message);
          sendSpaShell(res, indexPath);
        }
      });
    });
  });

  // Localized Phase 2 marketing routes (/es/..., /he/...)
  const localizedRoutes = getLocalizedMarketingRoutes().filter(
    (r) => r !== "/es/" && r !== "/he/",
  );
  localizedRoutes.forEach((route) => {
    app.get(route, (_req, res) => {
      fs.readFile(indexPath, "utf-8", (err, html) => {
        if (err) {
          console.error(`[SSR${route}] Failed to read index.html:`, err.message);
          return res.sendFile(indexPath);
        }
        try {
          let enhancedHtml = injectPageMeta(html, route);
          enhancedHtml = removeStaticShellFromHtml(enhancedHtml);
          const ssrBody = generateMarketingPageSsrHtml(route);
          if (ssrBody && enhancedHtml.includes('<div id="root"></div>')) {
            enhancedHtml = enhancedHtml.replace(
              '<div id="root"></div>',
              `<div id="root">${ssrBody}</div>`,
            );
          }
          res.set("Content-Type", "text/html");
          res.set("Cache-Control", "public, max-age=3600");
          res.send(enhancedHtml);
        } catch (ssrErr: unknown) {
          const message = ssrErr instanceof Error ? ssrErr.message : String(ssrErr);
          console.error(`[SSR${route}] Render failed, falling back to SPA shell:`, message);
          sendSpaShell(res, indexPath);
        }
      });
    });
  });

  // Legacy / removed marketing URLs → current canonical page (301, before express.static).
  // Keeps old Google-indexed URLs from soft-404ing (200 SPA shell) under "Crawled - currently not indexed".
  const LEGACY_REDIRECTS: Record<string, string> = {
    "/WhachatCRM-User-Guide.html": "/user-guide",
    "/privacy": "/privacy-policy",
    // Retired competitor page with no dedicated modern equivalent → comparison hub.
    "/intent-ai-alternative": "/best-whatsapp-crm-2026",
  };
  for (const [from, to] of Object.entries(LEGACY_REDIRECTS)) {
    app.get(from, (_req, res) => {
      res.redirect(301, to);
    });
  }

  // Serve static assets (JS, CSS, images, fonts, sitemap.xml, robots.txt, etc.)
  app.use(staticWithCache(distPath));

  // Catch-all: known SPA/product routes → 200 shell; unknown marketing URLs → HTTP 404 + noindex.
  app.use("*", (req, res) => {
    const url = normalizeRequestPath(req.originalUrl || req.url || "/");

    if (isLocaleRootRedirect(url)) {
      const target = localeRootRedirectTarget(url);
      if (target) return res.redirect(301, target);
    }

    const allMarketing = [...marketingRoutes, ...getLocalizedMarketingRoutes()];
    if (!shouldServeSpaFallback(url, allMarketing)) {
      return sendNotFoundSpaShell(res, indexPath);
    }

    if (isNoIndexPath(url)) {
      return sendNoIndexSpaShell(res, indexPath);
    }

    return sendSpaShell(res, indexPath);
  });
}
