import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { injectSeoMeta, generateBlogListHtml, generateBlogPostHtml } from "./seo";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Serve uploaded files for Twilio media messages
  const uploadsPath = path.resolve(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
  }
  app.use("/uploads", express.static(uploadsPath));

  // Serve attached assets (avatars, stock images, etc.)
  const attachedAssetsPath = path.resolve(process.cwd(), "attached_assets");
  if (fs.existsSync(attachedAssetsPath)) {
    app.use("/attached_assets", express.static(attachedAssetsPath));
  }

  app.use(express.static(distPath));

  // fall through to index.html with SEO meta and content injection for blog pages
  app.use("*", (req, res) => {
    const indexPath = path.resolve(distPath, "index.html");
    const fullUrl = req.originalUrl;
    const url = fullUrl.split("?")[0];
    
    // For blog pages, inject SEO meta tags AND pre-rendered content
    if (url.startsWith("/blog")) {
      fs.readFile(indexPath, "utf-8", (err, html) => {
        if (err) {
          return res.sendFile(indexPath);
        }
        
        // Inject SEO meta tags
        let enhancedHtml = injectSeoMeta(html, url);
        
        // Generate and inject SSR content for blog pages
        let ssrContent = "";
        if (url === "/blog" || url === "/blog/") {
          ssrContent = generateBlogListHtml();
        } else if (url.startsWith("/blog/")) {
          const slug = url.replace("/blog/", "").replace(/\/$/, "");
          const postHtml = generateBlogPostHtml(slug);
          if (postHtml) {
            ssrContent = postHtml;
          }
        }
        
        // Inject SSR content as initial content inside #root
        // React will replace this when it hydrates, but crawlers will see the content
        if (ssrContent) {
          enhancedHtml = enhancedHtml.replace(
            '<div id="root"></div>',
            `<div id="root">${ssrContent}</div>`
          );
        }
        
        // Set cache headers for blog pages
        res.set("Content-Type", "text/html");
        res.set("Cache-Control", "public, max-age=3600"); // 1 hour cache
        res.send(enhancedHtml);
      });
    } else {
      res.sendFile(indexPath);
    }
  });
}
