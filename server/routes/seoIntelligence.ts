import { db } from "../../drizzle/db";
import { sql } from "drizzle-orm";
import { requestSeoPublication } from "../seo/publicationService";
import { SeoGithubExecutionError } from "../seo/githubExecutor";
import { publicationFailureMessage } from "../seo/publicationPolicy";
import { safeSeoRefreshFailure } from "@shared/seoRefreshFeedback";
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
    try { res.json(await listSeoActions({ status: String(req.query.status ?? "") || undefined, risk: String(req.query.risk ?? "") || undefined, type: String(req.query.type ?? "") || undefined, page: String(req.query.page ?? "") || undefined })); }
    catch { res.status(500).json({ error: "Unable to load SEO actions", code: "ACTION_LIST_FAILED" }); }
  });
  app.post("/api/admin/seo-intelligence/actions/analyze", requireAdmin, async (_req, res) => {
    try { res.json(await analyzeSeoOpportunities()); }
    catch (error) { res.status(error instanceof SeoAnalysisInProgressError ? 409 : 500).json({ error: error instanceof SeoAnalysisInProgressError ? "An SEO analysis is already running" : "SEO analysis could not be completed", code: error instanceof SeoAnalysisInProgressError ? error.code : "ANALYSIS_FAILED" }); }
  });
  app.post("/api/admin/seo-intelligence/actions/:id/revise",requireAdmin,async(req,res)=>{try{await db.transaction(async tx=>{const r=await tx.execute(sql`UPDATE seo_actions SET status='revision_required',approved_by=NULL,approved_at=NULL,updated_at=NOW() WHERE id=${req.params.id} AND status='approved' AND NOT EXISTS(SELECT 1 FROM seo_github_executions g WHERE g.action_id=seo_actions.id AND g.publication_requested_at IS NOT NULL) RETURNING id`);if(!r.rows.length)throw new Error("Publication has already been requested or this action is no longer approved");await tx.execute(sql`INSERT INTO seo_action_events(action_id,from_status,to_status,reason,safe_metadata) VALUES (${req.params.id},'approved','revision_required','Prior approval revoked for a fresh finished draft','{}')`);});res.json(await refreshSeoAction(req.params.id,"sales-admin"));}catch{res.status(409).json({error:"The draft could not be refreshed. Check its current status and review the refresh reason."});}});
  app.post("/api/admin/seo-intelligence/actions/:id/publish", requireAdmin, async (req,res)=>{try{res.json(await requestSeoPublication(req.params.id,String((req as any).user?.id??"sales-admin")));import("../seo/githubExecutionService").then(m=>m.wakeSeoGithubExecutionWorker());}catch(error){const code=error instanceof SeoGithubExecutionError?error.code:"PUBLICATION_FAILED";res.status(409).json({code,error:publicationFailureMessage(code)});}});
  app.post("/api/admin/seo-intelligence/actions/:id/:decision", requireAdmin, async (req, res) => {
    const decision = req.params.decision;
    if (!(["approve", "reject", "regenerate"] as const).includes(decision as never)) return res.status(404).json({ error: "Unknown action operation" });
    try {
      const actor = String((req as typeof req & { user?: { id?: string }; session?: { userId?: string } }).user?.id ?? (req as typeof req & { session?: { userId?: string } }).session?.userId ?? "sales-admin");
      res.json(decision === "regenerate" ? await refreshSeoAction(req.params.id, actor) : await transitionSeoAction(req.params.id, decision === "approve" ? "approved" : "rejected", actor, typeof req.body?.reason === "string" ? req.body.reason : undefined));
    } catch (error) { const status = Number((error as {status?:number}).status ?? 500); if (decision === "regenerate" && status === 502) { const feedback = (error as {feedback?:ReturnType<typeof safeSeoRefreshFailure>}).feedback ?? safeSeoRefreshFailure(error); return res.status(status).json({ error: feedback.message, code: feedback.category, rejectionReasons: feedback.reasons }); } res.status(status).json({ error: status === 404 ? "SEO action not found" : status === 409 ? "Action status changed; refresh and try again" : "Unable to update SEO action" }); }
  });
}
