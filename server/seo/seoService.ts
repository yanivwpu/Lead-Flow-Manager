import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { seoSearchDailyTotals, seoSearchSnapshots, seoSyncRuns } from "@shared/schema";
import { fetchSearchDailyTotals, fetchSearchPerformance, resolveSearchConsoleConfig, SeoConfigurationError } from "./searchConsole";
import { detectSeoOpportunities, SEO_DECLINE_MIN_PREVIOUS_IMPRESSIONS, SEO_DECLINE_POSITION_DELTA, SEO_DECLINE_RETAINED_RATIO, type SeoMetricRow } from "./opportunities";
import { SEO_DASHBOARD_CANDIDATE_LIMIT, SEO_SEARCH_CONSOLE_DAILY_MAX_ROWS, SEO_SEARCH_CONSOLE_MAX_ROWS, SEO_SEARCH_CONSOLE_PAGE_SIZE, boundDashboardCandidates, recentFirstReportingDates, searchConsoleDayIsTruncated, searchConsoleImportIsTruncated, snapshotInsertBatches } from "./snapshotBatches";
import { averageSeoPosition } from "@shared/seoMetrics";
import { SEO_TARGETS } from "@shared/seoTargets";
import { describeSeoSyncFailure, serializeSeoSyncRun } from "./syncStatus";

let syncInFlight: Promise<SeoSyncResult> | null = null;
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
export type SeoSyncResult = { runId: string; status: "success" | "partial"; rowsImported: number; pagesCompleted: number; startDate: string; endDate: string; diagnostic?: string };

export async function runSeoSync(trigger: "manual" | "scheduled" = "scheduled", now = new Date()): Promise<SeoSyncResult> {
  if (syncInFlight) return syncInFlight;
  const task: Promise<SeoSyncResult> = (async () => {
    const config = resolveSearchConsoleConfig();
    if (!config.configured || !config.siteUrl) throw new SeoConfigurationError(`Search Console is not configured; missing ${config.missing.join(", ")}`);
    const propertyId = config.siteUrl;
    const end = new Date(now); end.setUTCDate(end.getUTCDate() - 3);
    const start = new Date(end); start.setUTCDate(start.getUTCDate() - 61);
    const startDate = isoDay(start), endDate = isoDay(end);
    const [run] = await db.insert(seoSyncRuns).values({ propertyId, trigger, startDate, endDate }).returning({ id: seoSyncRuns.id });
    let rowsImported = 0, pagesCompleted = 0;
    try {
      const totalsResult = await fetchSearchDailyTotals(startDate, endDate);
      const totalRows = totalsResult.rows ?? [];
      if (totalRows.length) {
        await db.insert(seoSearchDailyTotals).values(totalRows.map((row) => ({ propertyId, reportingDate: row.keys[0], clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position }))).onConflictDoUpdate({
          target: [seoSearchDailyTotals.propertyId, seoSearchDailyTotals.reportingDate],
          set: { clicks: sql`excluded.clicks`, impressions: sql`excluded.impressions`, ctr: sql`excluded.ctr`, position: sql`excluded.position`, importedAt: new Date() },
        });
      }
      const pageSize = SEO_SEARCH_CONSOLE_PAGE_SIZE;
      let truncated = false;
      let truncationCode = "ROW_CAP_TRUNCATED";
      let truncationDiagnostic = "";
      for (const reportingDate of recentFirstReportingDates(startDate, endDate)) {
        for (let startRow = 0; rowsImported < SEO_SEARCH_CONSOLE_MAX_ROWS; startRow += pageSize) {
          const rowLimit = Math.min(pageSize, SEO_SEARCH_CONSOLE_MAX_ROWS - rowsImported);
          const result = await fetchSearchPerformance({ startDate: reportingDate, endDate: reportingDate, startRow, rowLimit });
          const rows = result.rows ?? [];
          if (rows.length) {
            for (const batch of snapshotInsertBatches(rows)) {
              await db.insert(seoSearchSnapshots).values(batch.map((row) => ({ propertyId, reportingDate: row.keys[0], query: row.keys[1], page: row.keys[2], clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position }))).onConflictDoUpdate({
                target: [seoSearchSnapshots.propertyId, seoSearchSnapshots.reportingDate, seoSearchSnapshots.query, seoSearchSnapshots.page],
                set: { clicks: sql`excluded.clicks`, impressions: sql`excluded.impressions`, ctr: sql`excluded.ctr`, position: sql`excluded.position`, importedAt: new Date() },
              });
              rowsImported += batch.length;
              await db.update(seoSyncRuns).set({ rowsImported, pagesCompleted }).where(and(eq(seoSyncRuns.id, run.id), eq(seoSyncRuns.propertyId, propertyId)));
            }
            pagesCompleted += 1;
            await db.update(seoSyncRuns).set({ rowsImported, pagesCompleted }).where(and(eq(seoSyncRuns.id, run.id), eq(seoSyncRuns.propertyId, propertyId)));
          }
          if (searchConsoleDayIsTruncated(startRow, rows.length, rowLimit)) {
            truncated = true;
            truncationCode = "DAILY_ROW_CAP_TRUNCATED";
            truncationDiagnostic = `Search Console returned the ${SEO_SEARCH_CONSOLE_DAILY_MAX_ROWS}-row daily ceiling for ${reportingDate}; additional rows for that day may be unavailable`;
            break;
          }
          if (searchConsoleImportIsTruncated(rowsImported, rows.length, rowLimit)) {
            truncated = true;
            truncationDiagnostic = `Import reached the ${SEO_SEARCH_CONSOLE_MAX_ROWS}-row overall safety cap with a full final page; additional Search Console rows may exist`;
            break;
          }
          if (rows.length < rowLimit) break;
        }
        if (truncated) break;
      }
      if (truncated) {
        const diagnostic = truncationDiagnostic;
        await db.update(seoSyncRuns).set({ status: "partial", rowsImported, pagesCompleted, errorCode: truncationCode, errorMessage: diagnostic, completedAt: new Date() }).where(and(eq(seoSyncRuns.id, run.id), eq(seoSyncRuns.propertyId, propertyId)));
        console.warn(`[SEO Sync] truncated run=${run.id} rows=${rowsImported} pages=${pagesCompleted}`);
        return { runId: run.id, status: "partial" as const, rowsImported, pagesCompleted, startDate, endDate, diagnostic };
      }
      await db.update(seoSyncRuns).set({ status: "success", rowsImported, pagesCompleted, completedAt: new Date() }).where(and(eq(seoSyncRuns.id, run.id), eq(seoSyncRuns.propertyId, propertyId)));
      console.info(`[SEO Sync] completed run=${run.id} rows=${rowsImported} pages=${pagesCompleted}`);
      return { runId: run.id, status: "success" as const, rowsImported, pagesCompleted, startDate, endDate };
    } catch (error) {
      const failure = describeSeoSyncFailure(error, rowsImported);
      await db.update(seoSyncRuns).set({ ...failure, rowsImported, pagesCompleted, completedAt: new Date() }).where(and(eq(seoSyncRuns.id, run.id), eq(seoSyncRuns.propertyId, propertyId)));
      console.error(`[SEO Sync] failed run=${run.id} code=${failure.errorCode} rows=${rowsImported}: ${failure.errorMessage}`);
      throw error;
    }
  })();
  syncInFlight = task.finally(() => { syncInFlight = null; });
  return syncInFlight;
}

const numberValue = (value: unknown) => Number(value ?? 0);
export async function getSeoDashboard(now = new Date()) {
  const config = resolveSearchConsoleConfig();
  const propertyId = config.siteUrl ?? "__unconfigured__";
  const end = new Date(now); end.setUTCDate(end.getUTCDate() - 3);
  const currentStart = new Date(end); currentStart.setUTCDate(currentStart.getUTCDate() - 27);
  const previousStart = new Date(currentStart); previousStart.setUTCDate(previousStart.getUTCDate() - 28);
  const currentStartDay = isoDay(currentStart), previousStartDay = isoDay(previousStart), endDay = isoDay(end);
  const [totalsResult, topQueriesResult, topPagesResult, candidatesResult] = await Promise.all([
    db.execute(sql`SELECT
      COALESCE(SUM(clicks) FILTER (WHERE reporting_date >= ${currentStartDay}), 0) AS current_clicks,
      COALESCE(SUM(impressions) FILTER (WHERE reporting_date >= ${currentStartDay}), 0) AS current_impressions,
      COALESCE(SUM(position * impressions) FILTER (WHERE reporting_date >= ${currentStartDay}), 0) AS current_position_weighted,
      COALESCE(SUM(clicks) FILTER (WHERE reporting_date < ${currentStartDay}), 0) AS previous_clicks,
      COALESCE(SUM(impressions) FILTER (WHERE reporting_date < ${currentStartDay}), 0) AS previous_impressions,
      COALESCE(SUM(position * impressions) FILTER (WHERE reporting_date < ${currentStartDay}), 0) AS previous_position_weighted
      FROM seo_search_daily_totals WHERE property_id = ${propertyId} AND reporting_date BETWEEN ${previousStartDay} AND ${endDay}`),
    db.execute(sql`SELECT query AS name, SUM(clicks) AS clicks, SUM(impressions) AS impressions
      FROM seo_search_snapshots WHERE property_id = ${propertyId} AND reporting_date BETWEEN ${currentStartDay} AND ${endDay}
      GROUP BY query ORDER BY SUM(clicks) DESC LIMIT 10`),
    db.execute(sql`SELECT page AS name, SUM(clicks) AS clicks, SUM(impressions) AS impressions
      FROM seo_search_snapshots WHERE property_id = ${propertyId} AND reporting_date BETWEEN ${currentStartDay} AND ${endDay}
      GROUP BY page ORDER BY SUM(clicks) DESC LIMIT 10`),
    db.execute(sql`WITH metrics AS (
      SELECT query, page,
        COALESCE(SUM(clicks) FILTER (WHERE reporting_date >= ${currentStartDay}), 0) AS current_clicks,
        COALESCE(SUM(impressions) FILTER (WHERE reporting_date >= ${currentStartDay}), 0) AS current_impressions,
        COALESCE(SUM(position * impressions) FILTER (WHERE reporting_date >= ${currentStartDay}), 0) AS current_position_weighted,
        COALESCE(SUM(clicks) FILTER (WHERE reporting_date < ${currentStartDay}), 0) AS previous_clicks,
        COALESCE(SUM(impressions) FILTER (WHERE reporting_date < ${currentStartDay}), 0) AS previous_impressions,
        COALESCE(SUM(position * impressions) FILTER (WHERE reporting_date < ${currentStartDay}), 0) AS previous_position_weighted
      FROM seo_search_snapshots WHERE property_id = ${propertyId} AND reporting_date BETWEEN ${previousStartDay} AND ${endDay} GROUP BY query, page
    ), normalized AS (
      SELECT *, current_position_weighted / NULLIF(current_impressions, 0) AS current_position,
        previous_position_weighted / NULLIF(previous_impressions, 0) AS previous_position
      FROM metrics
    ), scored AS (
      SELECT *, GREATEST(
        CASE WHEN current_impressions >= 100 AND current_position BETWEEN 4 AND 20 THEN current_impressions / current_position ELSE 0 END,
        CASE WHEN current_impressions >= 100 AND current_clicks / NULLIF(current_impressions, 0) <
          (CASE WHEN current_position <= 3 THEN .12 WHEN current_position <= 10 THEN .04 ELSE .015 END) * .6
          THEN ((CASE WHEN current_position <= 3 THEN .12 WHEN current_position <= 10 THEN .04 ELSE .015 END) - current_clicks / current_impressions) * current_impressions ELSE 0 END,
        CASE WHEN previous_impressions >= ${SEO_DECLINE_MIN_PREVIOUS_IMPRESSIONS} AND
          ((previous_clicks > 0 AND current_clicks <= previous_clicks * ${SEO_DECLINE_RETAINED_RATIO}) OR current_impressions <= previous_impressions * ${SEO_DECLINE_RETAINED_RATIO} OR current_position > previous_position + ${SEO_DECLINE_POSITION_DELTA})
          THEN GREATEST(previous_clicks - current_clicks, previous_impressions - current_impressions,
            GREATEST(COALESCE(current_position - previous_position, 0), 0) * previous_impressions, 0)
          ELSE 0 END
      ) AS priority_evidence
      FROM normalized
    ) SELECT * FROM scored WHERE
      (current_impressions >= 100 AND current_position BETWEEN 4 AND 20) OR
      (current_impressions >= 100 AND current_clicks / NULLIF(current_impressions, 0) <
        (CASE WHEN current_position <= 3 THEN .12 WHEN current_position <= 10 THEN .04 ELSE .015 END) * .6) OR
      (previous_impressions >= ${SEO_DECLINE_MIN_PREVIOUS_IMPRESSIONS} AND
        ((previous_clicks > 0 AND current_clicks <= previous_clicks * ${SEO_DECLINE_RETAINED_RATIO}) OR current_impressions <= previous_impressions * ${SEO_DECLINE_RETAINED_RATIO} OR current_position > previous_position + ${SEO_DECLINE_POSITION_DELTA}))
      ORDER BY priority_evidence DESC LIMIT ${SEO_DASHBOARD_CANDIDATE_LIMIT}`),
  ]);
  const totals = (totalsResult.rows[0] ?? {}) as Record<string, unknown>;
  const candidateRows = boundDashboardCandidates(candidatesResult.rows as Record<string, unknown>[], (row) => numberValue(row.priority_evidence));
  const current: SeoMetricRow[] = candidateRows.filter((r) => numberValue(r.current_impressions) > 0).map((r) => ({ query: String(r.query), page: String(r.page), clicks: numberValue(r.current_clicks), impressions: numberValue(r.current_impressions), position: numberValue(r.current_position_weighted) / numberValue(r.current_impressions) }));
  const previous: SeoMetricRow[] = candidateRows.filter((r) => numberValue(r.previous_impressions) > 0).map((r) => ({ query: String(r.query), page: String(r.page), clicks: numberValue(r.previous_clicks), impressions: numberValue(r.previous_impressions), position: numberValue(r.previous_position_weighted) / numberValue(r.previous_impressions) }));
  const targetKeywords = SEO_TARGETS.map((target) => target.keyword.toLowerCase());
  const targetResult = targetKeywords.length ? await db.execute(sql`WITH page_visibility AS (
    SELECT lower(query) AS query, page, SUM(impressions) AS impressions
    FROM seo_search_snapshots WHERE property_id = ${propertyId} AND reporting_date BETWEEN ${currentStartDay} AND ${endDay}
      AND lower(query) IN (${sql.join(targetKeywords.map((keyword) => sql`${keyword}`), sql`, `)})
    GROUP BY lower(query), page
  ) SELECT query, SUM(impressions) AS impressions,
      COUNT(*) FILTER (WHERE impressions >= 10) AS qualifying_pages
    FROM page_visibility GROUP BY query LIMIT ${targetKeywords.length}`) : { rows: [] };
  const targetVisibility = (targetResult.rows as Record<string, unknown>[]).map((r) => ({ query: String(r.query), impressions: numberValue(r.impressions), qualifyingPages: numberValue(r.qualifying_pages) }));
  const topList = (rows: unknown[]) => (rows as Record<string, unknown>[]).map((r) => ({ name: String(r.name), clicks: numberValue(r.clicks), impressions: numberValue(r.impressions) }));
  const [[latestRun], [lastRun]] = await Promise.all([
    db.select().from(seoSyncRuns).where(eq(seoSyncRuns.propertyId, propertyId)).orderBy(desc(seoSyncRuns.startedAt)).limit(1),
    db.select().from(seoSyncRuns).where(sql`${seoSyncRuns.propertyId} = ${propertyId} AND ${seoSyncRuns.status} = 'success'`).orderBy(desc(seoSyncRuns.completedAt)).limit(1),
  ]);
  const currentClicks = numberValue(totals.current_clicks), currentImpressions = numberValue(totals.current_impressions), previousClicks = numberValue(totals.previous_clicks), previousImpressions = numberValue(totals.previous_impressions);
  return { config: { configured: config.configured, missing: config.missing }, latestSync: serializeSeoSyncRun(latestRun), lastSuccessfulSync: lastRun?.completedAt ?? null, period: { startDate: currentStartDay, endDate: endDay, clicks: currentClicks, impressions: currentImpressions, ctr: currentClicks / Math.max(1, currentImpressions), position: averageSeoPosition(numberValue(totals.current_position_weighted), currentImpressions), previous: { clicks: previousClicks, impressions: previousImpressions, ctr: previousClicks / Math.max(1, previousImpressions), position: averageSeoPosition(numberValue(totals.previous_position_weighted), previousImpressions) } }, topQueries: topList(topQueriesResult.rows), topPages: topList(topPagesResult.rows), opportunities: detectSeoOpportunities(current, previous, SEO_TARGETS, targetVisibility).slice(0,50) };
}
