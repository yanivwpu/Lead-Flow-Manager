import express, { type Express, type Response } from "express";
import fs from "fs";
import path from "path";
import { injectSeoMeta, generateBlogListHtml, generateBlogPostHtml, generateHomepageHtml, injectHomepageSeoMeta, injectPageMeta, getMarketingRoutes } from "./seo";

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

function sendSpaShell(res: Response, indexPath: string) {
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  res.sendFile(indexPath);
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
      
      // Inject WebPage schema (keeps existing Organization + SoftwareApplication schemas)
      let enhancedHtml = injectHomepageSeoMeta(html);
      
      // Generate and inject SSR content for homepage
      const ssrContent = generateHomepageHtml();
      enhancedHtml = enhancedHtml.replace(
        '<div id="root"></div>',
        `<div id="root">${ssrContent}</div>`
      );
      
      res.set("Content-Type", "text/html");
      res.set("Cache-Control", "public, max-age=3600"); // 1 hour cache
      res.send(enhancedHtml);
    });
  });

  // Blog pages SSR - MUST be before express.static
  app.get("/blog", (req, res) => {
    fs.readFile(indexPath, "utf-8", (err, html) => {
      if (err) {
        return res.sendFile(indexPath);
      }
      
      let enhancedHtml = injectSeoMeta(html, "/blog");
      const ssrContent = generateBlogListHtml();
      enhancedHtml = enhancedHtml.replace(
        '<div id="root"></div>',
        `<div id="root">${ssrContent}</div>`
      );
      
      res.set("Content-Type", "text/html");
      res.set("Cache-Control", "public, max-age=3600");
      res.send(enhancedHtml);
    });
  });

  app.get("/blog/:slug", (req, res) => {
    const slug = req.params.slug;
    fs.readFile(indexPath, "utf-8", (err, html) => {
      if (err) {
        return res.sendFile(indexPath);
      }
      
      let enhancedHtml = injectSeoMeta(html, `/blog/${slug}`);
      const ssrContent = generateBlogPostHtml(slug);
      if (ssrContent) {
        enhancedHtml = enhancedHtml.replace(
          '<div id="root"></div>',
          `<div id="root">${ssrContent}</div>`
        );
      }
      
      res.set("Content-Type", "text/html");
      res.set("Cache-Control", "public, max-age=3600");
      res.send(enhancedHtml);
    });
  });

  // Marketing pages with SSR meta injection - MUST be before express.static
  const marketingRoutes = getMarketingRoutes();
  marketingRoutes.forEach(route => {
    app.get(route, (req, res) => {
      fs.readFile(indexPath, "utf-8", (err, html) => {
        if (err) {
          return res.sendFile(indexPath);
        }
        
        const enhancedHtml = injectPageMeta(html, route);
        res.set("Content-Type", "text/html");
        res.set("Cache-Control", "public, max-age=3600");
        res.send(enhancedHtml);
      });
    });
  });

  // Legacy static HTML guide → canonical SPA route (301 before express.static)
  app.get("/WhachatCRM-User-Guide.html", (_req, res) => {
    res.redirect(301, "/user-guide");
  });

  // Serve static assets (JS, CSS, images, fonts, etc.)
  app.use(staticWithCache(distPath));

  // Catch-all for SPA routes (excluding protected routes)
  app.use("*", (req, res) => {
    const url = req.originalUrl.split("?")[0];
    
    // Routes that should NOT have SSR or caching (Shopify, auth, API, webhooks)
    const skipSsrRoutes = ['/auth', '/api', '/webhooks', '/shopify', '/app'];
    const shouldSkipSsr = skipSsrRoutes.some(route => url.startsWith(route));
    
    if (shouldSkipSsr) {
      return sendSpaShell(res, indexPath);
    }
    
    // All other routes - serve index.html without SSR
    sendSpaShell(res, indexPath);
  });
}
