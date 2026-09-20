import type { Express } from "express";
import type { RequestHandler } from "express";
import { getSeoDashboard, runSeoSync } from "../seo/seoService";
import { extractSanitizedDatabaseError, safeSeoSyncHttpFailure } from "../seo/syncStatus";

export function registerSeoIntelligenceRoutes(app: Express, requireAdmin: RequestHandler) {
  app.get("/api/admin/seo-intelligence", requireAdmin, async (_req, res) => {
    try { res.json(await getSeoDashboard()); } catch (error) { res.status(500).json({ error: error instanceof Error ? error.message : "Unable to load SEO intelligence" }); }
  });
  app.post("/api/admin/seo-intelligence/sync", requireAdmin, async (_req, res) => {
    try { res.json(await runSeoSync("manual")); }
    catch (error) {
      const databaseError = extractSanitizedDatabaseError(error);
      if (databaseError) console.error("[SEO Sync API] database failure", databaseError);
      const failure = safeSeoSyncHttpFailure(error);
      res.status(failure.status).json(failure.body);
    }
  });
}
