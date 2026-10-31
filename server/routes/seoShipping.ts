import type { Express, RequestHandler } from "express";
import { sql } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { transitionSeoAction } from "../seo/actionService";
import { wakeSeoGithubExecutionWorker } from "../seo/githubExecutionService";
import { requestSeoPublication } from "../seo/publicationService";
import { listDailySeoShippingRuns, selectDailySeoReviewCandidate } from "../seo/dailyShipping";

const BASE = "/api/admin/seo-intelligence/daily-shipping";
export function registerSeoShippingRoutes(app: Express, requireAdmin: RequestHandler) {
  app.get(BASE, requireAdmin, async (_req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      res.json({ days: await listDailySeoShippingRuns(), releaseMode: "owner_review_then_gated_publication" });
    } catch (error) {
      console.error("[SEO Shipping] history unavailable", error instanceof Error ? error.message : "unknown");
      res.status(503).json({ error: "Daily publishing review is temporarily unavailable" });
    }
  });

  /** One deliberate owner approval uses the existing PR, checks, deployment and live verification gates. */
  app.post(BASE + "/:day/publish", requireAdmin, async (req, res) => {
    const day = String(req.params.day || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day))
      return res.status(400).json({ error: "Invalid shipping day" });
    try {
      const r = await db.execute(sql`
        SELECT d.action_id AS "actionId",d.action_version AS version,
          d.target_page AS "targetPage",d.impressions,d.clicks,a.confidence,
          a.status AS "actionStatus",a.stale_at AS "staleAt",
          a.current_version AS "currentVersion", v.proposal
        FROM seo_daily_shipping_runs d
        JOIN seo_actions a ON a.id::text=d.action_id
        JOIN seo_action_versions v ON v.action_id=a.id AND v.version=d.action_version
        WHERE d.run_day=${day}::date AND d.status='needs_review' LIMIT 1`);
      const row = r.rows[0] as any;
      const selected = row ? selectDailySeoReviewCandidate([row]) : null;
      if (!selected || row.staleAt || Number(row.version) !== Number(row.currentVersion) ||
          !["proposed", "approved"].includes(row.actionStatus))
        return res.status(409).json({ error: "This review is no longer current. Refresh the daily review before approving." });
      const actor = String((req as typeof req & { user?: { id?: string }; session?: { userId?: string } }).user?.id ??
        (req as typeof req & { session?: { userId?: string } }).session?.userId ?? "sales-admin");
      if (row.actionStatus === "proposed")
        await transitionSeoAction(selected.actionId, "approved", actor, "Explicit daily SEO shipping review approval");
      const result = await requestSeoPublication(selected.actionId, actor);
      wakeSeoGithubExecutionWorker();
      res.json({ ...result, day, message: "Owner-approved change queued; only verified GitHub checks, deployment and live content can mark it published." });
    } catch (error) {
      console.error("[SEO Shipping] publication request failed", error instanceof Error ? error.message : "unknown");
      res.status(409).json({ error: "Could not submit this reviewed change. Check the SEO Action status and publication history." });
    }
  });
}
