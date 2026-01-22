import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { injectSeoMeta } from "./seo";

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

  // fall through to index.html with SEO meta injection for blog pages
  app.use("*", (req, res) => {
    const indexPath = path.resolve(distPath, "index.html");
    const url = req.originalUrl;
    
    // For blog pages, inject proper SEO meta tags
    if (url.startsWith("/blog")) {
      fs.readFile(indexPath, "utf-8", (err, html) => {
        if (err) {
          return res.sendFile(indexPath);
        }
        const enhancedHtml = injectSeoMeta(html, url);
        res.set("Content-Type", "text/html");
        res.send(enhancedHtml);
      });
    } else {
      res.sendFile(indexPath);
    }
  });
}
