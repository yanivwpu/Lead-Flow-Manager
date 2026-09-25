import type { Express } from "express";
import type { RequestHandler } from "express";
import { getSeoDashboard, runSeoSync } from "../seo/seoService";
import { extractSanitizedDatabaseError, safeSeoSyncHttpFailure } from "../seo/syncStatus";
import { analyzeSeoOpportunities, listSeoActions, refreshSeoAction, SeoAnalysisInProgressError, transitionSeoAction } from "../seo/actionService";

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
  app.get("/api/admin/seo-intelligence/actions", requireAdmin, async (req, res) => {
    try { res.json(await listSeoActions({ view: String(req.query.view ?? "") || undefined, type: String(req.query.type ?? "") || undefined, search: String(req.query.search ?? "") || undefined, page: Number(req.query.page ?? 1), limit: Number(req.query.limit ?? 20) })); }
    catch { res.status(500).json({ error: "Unable to load SEO actions", code: "ACTION_LIST_FAILED" }); }
  });
  app.post("/api/admin/seo-intelligence/actions/analyze", requireAdmin, async (_req, res) => {
    try { res.json(await analyzeSeoOpportunities()); }
    catch (error) { res.status(error instanceof SeoAnalysisInProgressError ? 409 : 500).json({ error: error instanceof SeoAnalysisInProgressError ? "An SEO analysis is already running" : "SEO analysis could not be completed", code: error instanceof SeoAnalysisInProgressError ? error.code : "ANALYSIS_FAILED" }); }
  });
  app.post("/api/admin/seo-intelligence/actions/:id/:decision", requireAdmin, async (req, res) => {
    const decision = req.params.decision;
    if (!(["approve", "reject", "regenerate"] as const).includes(decision as never)) return res.status(404).json({ error: "Unknown action operation" });
    try {
      const actor = String((req as typeof req & { user?: { id?: string }; session?: { userId?: string } }).user?.id ?? (req as typeof req & { session?: { userId?: string } }).session?.userId ?? "sales-admin");
      res.json(decision === "regenerate" ? await refreshSeoAction(req.params.id, actor) : await transitionSeoAction(req.params.id, decision === "approve" ? "approved" : "rejected", actor, typeof req.body?.reason === "string" ? req.body.reason : undefined));
    } catch (error) { const status = Number((error as {status?:number}).status ?? 500); res.status(status).json({ error: status === 404 ? "SEO action not found" : status === 409 ? "Action status changed; refresh and try again" : "Unable to update SEO action" }); }
  });
}
