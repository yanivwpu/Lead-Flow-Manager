import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";
import { getMarketingRoutes, injectNoindexMeta, isNoIndexPath } from "./seo";
import { normalizeRequestPath, shouldServeSpaFallback } from "./spaRouting";

const viteLogger = createLogger();

export async function setupVite(server: Server, app: Express) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server, path: "/vite-hmr" },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);

  const marketingRoutes = getMarketingRoutes();

  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    const pathname = normalizeRequestPath(url);

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      let page = await vite.transformIndexHtml(url, template);

      const isKnownSpa = shouldServeSpaFallback(pathname, marketingRoutes);
      if (!isKnownSpa) {
        page = injectNoindexMeta(page);
        page = page.replace(
          /<title>.*?<\/title>/i,
          "<title>404 Page Not Found | WhachatCRM</title>",
        );
        res.status(404).set({ "Content-Type": "text/html" }).end(page);
        return;
      }

      if (isNoIndexPath(pathname)) {
        page = injectNoindexMeta(page);
      }

      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
