import type { Express } from "express";
import type { RequestHandler } from "express";
import { getSeoDashboard, runSeoSync } from "../seo/seoService";

export function registerSeoIntelligenceRoutes(app: Express, requireAdmin: RequestHandler) {
  app.get("/api/admin/seo-intelligence", requireAdmin, async (_req, res) => {
    try { res.json(await getSeoDashboard()); } catch (error) { res.status(500).json({ error: error instanceof Error ? error.message : "Unable to load SEO intelligence" }); }
  });
  app.post("/api/admin/seo-intelligence/sync", requireAdmin, async (_req, res) => {
    try { res.json(await runSeoSync("manual")); }
    catch (error) { const code = (error as { code?: string }).code; res.status(code === "MISSING_CONFIGURATION" ? 503 : code === "QUOTA_EXCEEDED" ? 429 : 502).json({ error: error instanceof Error ? error.message : "SEO sync failed", code: code ?? "SYNC_FAILED" }); }
  });
}
