import { sql } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { supportsSeoContentRoute } from "../../shared/seoPublishedContent";
import { findForbiddenPublicClaims } from "../../shared/seoPolicy";
import { validateRecommendationOutput } from "./actionPlanner";

/** A dated, auditable review selection is not a publication or an automatic approval. */
export const SEO_DAILY_SHIPPING_SCHEMA = [
  "CREATE TABLE IF NOT EXISTS seo_daily_shipping_runs (" +
  "run_day date PRIMARY KEY, status text NOT NULL CHECK (status IN ('needs_review','blocked'))," +
  "action_id text, action_version integer, target_page text, target_query text," +
  "clicks integer NOT NULL DEFAULT 0, impressions integer NOT NULL DEFAULT 0," +
  "confidence real, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT NOW());",
  "CREATE INDEX IF NOT EXISTS seo_daily_shipping_created_idx ON seo_daily_shipping_runs(created_at DESC);"
].join("\n");

type RawCandidate = {
  actionId: string; version: number; targetPage: string; confidence: number;
  proposal: unknown; impressions: number; clicks: number;
};
export type ReviewableCandidate = RawCandidate & { targetQuery: string; proposedContent: string };
export const SEO_DAILY_SHIPPING_MIN_IMPRESSIONS = 50;

/** Validate the same finished-draft contract as the existing SEO GitHub publisher. */
export function selectDailySeoReviewCandidate(rows: RawCandidate[]): ReviewableCandidate | null {
  for (const row of rows) {
    if (!row.actionId || !Number.isInteger(Number(row.version)) ||
        !Number.isFinite(Number(row.confidence)) ||
        Number(row.impressions) < SEO_DAILY_SHIPPING_MIN_IMPRESSIONS ||
        !supportsSeoContentRoute(row.targetPage)) continue;
    try {
      const p = validateRecommendationOutput(row.proposal);
      if (p.actionType !== "content_expansion" || p.risk === "high" ||
          p.factValidationStatus !== "passed" || !p.generatedAt ||
          !p.proposedContent || p.proposedContent.trim().length < 120 ||
          findForbiddenPublicClaims(p.proposedContent).length) continue;
      return { ...row, targetQuery: p.targetQuery || "", proposedContent: p.proposedContent };
    } catch {
      // Invalid, incomplete, or unsafe copy cannot enter the publishing lane.
    }
  }
  return null;
}

const CANDIDATE_SQL = [
  'SELECT a.id::text AS "actionId", a.current_version AS version,',
  'a.target_page AS "targetPage", a.confidence, v.proposal,',
  'COALESCE(m.impressions,0)::int AS impressions, COALESCE(m.clicks,0)::int AS clicks',
  'FROM seo_actions a',
  'JOIN seo_action_versions v ON v.action_id=a.id AND v.version=a.current_version',
  'LEFT JOIN LATERAL (',
  ' SELECT SUM(s.impressions)::int AS impressions, SUM(s.clicks)::int AS clicks',
  ' FROM seo_search_snapshots s WHERE s.property_id=a.property_id',
  ' AND s.page=a.target_page',
  " AND s.reporting_date BETWEEN ((NOW() AT TIME ZONE 'UTC')::date - 30)",
  " AND ((NOW() AT TIME ZONE 'UTC')::date - 3)",
  ') m ON TRUE',
  "WHERE a.status='proposed' AND a.action_type='content_expansion'",
  "AND a.risk<>'high' AND a.stale_at IS NULL",
  'AND NOT EXISTS (',
  ' SELECT 1 FROM seo_github_executions g',
  ' JOIN seo_actions other ON other.id=g.action_id',
  ' WHERE other.target_page=a.target_page',
  " AND g.status IN ('pending','running','pr_created','awaiting_checks','deploying','publication_failed')",
  ')',
  'ORDER BY COALESCE(m.impressions,0) DESC,a.confidence DESC,a.updated_at DESC,a.id',
  'LIMIT 80'
].join("\n");

export async function runDailySeoShippingSelection() {
  const day = new Date().toISOString().slice(0, 10);
  const existing = await db.execute(sql`SELECT run_day FROM seo_daily_shipping_runs WHERE run_day=${day}::date LIMIT 1`);
  if (existing.rows.length) return { created: false, day };
  const recentSync = await db.execute(sql`SELECT completed_at FROM seo_sync_runs
    WHERE status='success' ORDER BY completed_at DESC LIMIT 1`);
  const syncedAt = recentSync.rows[0]?.completed_at;
  const stale = !syncedAt || Date.now() - new Date(String(syncedAt)).getTime() > 7 * 86400000;
  const candidates = stale ? [] : (await db.execute(sql.raw(CANDIDATE_SQL))).rows;
  const selected = selectDailySeoReviewCandidate(candidates as unknown as RawCandidate[]);
  const reason = stale ? "Search Console sync is missing or older than seven days"
    : selected ? "Highest-impression supported content proposal; owner review and publication checks required"
    : "No supported, fresh, low-risk finished draft with 50+ impressions; no content released";
  const inserted = await db.execute(sql`INSERT INTO seo_daily_shipping_runs
    (run_day,status,action_id,action_version,target_page,target_query,clicks,impressions,confidence,reason)
    VALUES (${day}::date,${selected ? "needs_review" : "blocked"},
      ${selected?.actionId ?? null},${selected?.version ?? null},
      ${selected?.targetPage ?? null},${selected?.targetQuery ?? null},
      ${selected?.clicks ?? 0},${selected?.impressions ?? 0},
      ${selected?.confidence ?? null},${reason})
    ON CONFLICT (run_day) DO NOTHING RETURNING run_day`);
  if (inserted.rows.length) console.info("[SEO Shipping] daily review selection", {
    day, status: selected ? "needs_review" : "blocked",
    impressions: selected?.impressions ?? 0, reason
  });
  return { created: inserted.rows.length > 0, day, status: selected ? "needs_review" : "blocked" };
}

export async function listDailySeoShippingRuns() {
  const result = await db.execute(sql`
    SELECT d.run_day AS "runDay", d.status,d.action_id AS "actionId",
      d.action_version AS "actionVersion", d.target_page AS "targetPage",
      d.target_query AS "targetQuery",d.clicks,d.impressions,d.confidence,d.reason,
      a.status AS "actionStatus",a.current_version AS "currentVersion",a.stale_at AS "staleAt",
      v.proposal->>'proposedContent' AS "proposedContent",
      g.status AS "publicationStatus",g.pr_url AS "prUrl",g.live_at AS "liveAt"
    FROM seo_daily_shipping_runs d
    LEFT JOIN seo_actions a ON a.id::text=d.action_id
    LEFT JOIN seo_action_versions v ON v.action_id=a.id AND v.version=d.action_version
    LEFT JOIN LATERAL (
      SELECT status,pr_url,live_at FROM seo_github_executions
      WHERE action_id=a.id AND action_version=d.action_version
      ORDER BY created_at DESC LIMIT 1
    ) g ON true
    ORDER BY d.run_day DESC LIMIT 14`);
  return result.rows;
}
