import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { injectLocalizedStaticShell, applyHtmlLangDir } from "../../server/seo.ts";

const ROOT = path.resolve("dist/public");
const baseHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

function homepageHtml(pathname: string) {
  if (pathname === "/he" || pathname === "/he/") {
    return applyHtmlLangDir(injectLocalizedStaticShell(baseHtml, "he"), "he");
  }
  if (pathname === "/es" || pathname === "/es/") {
    return applyHtmlLangDir(injectLocalizedStaticShell(baseHtml, "es"), "es");
  }
  return applyHtmlLangDir(baseHtml, "en");
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".avif": "image/avif",
  ".webp": "image/webp",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const pathname = decodeURIComponent(url.pathname);
  if (pathname === "/" || pathname === "/es/" || pathname === "/he/" || pathname === "/es" || pathname === "/he") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(homepageHtml(pathname));
    return;
  }
  const filePath = path.normalize(path.join(ROOT, pathname.replace(/^\//, "")));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(homepageHtml(pathname));
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
});

server.listen(5178, "127.0.0.1", () => {
  console.log("listening http://127.0.0.1:5178");
});
