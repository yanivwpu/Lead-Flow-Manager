import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { seoSearchDailyTotals, seoSearchSnapshots, seoSyncExecutionLeases, seoSyncRuns } from "@shared/schema";
import { fetchSearchDailyTotals, fetchSearchPerformance, resolveSearchConsoleConfig, SeoConfigurationError } from "./searchConsole";
import { detectSeoOpportunities, SEO_DECLINE_MIN_PREVIOUS_IMPRESSIONS, SEO_DECLINE_POSITION_DELTA, SEO_DECLINE_RETAINED_RATIO, type SeoMetricRow } from "./opportunities";
import { SEO_DASHBOARD_CANDIDATE_LIMIT, SEO_SEARCH_CONSOLE_DAILY_MAX_ROWS, SEO_SEARCH_CONSOLE_MAX_ROWS, SEO_SEARCH_CONSOLE_PAGE_SIZE, boundDashboardCandidates, evaluateSearchConsolePage, recentFirstReportingDates, snapshotInsertBatches } from "./snapshotBatches";
import { averageSeoPosition } from "@shared/seoMetrics";
import { SEO_TARGETS } from "@shared/seoTargets";
import { describeSeoSyncFailure, serializeSeoSyncRun } from "./syncStatus";
import { applySearchConsoleDailyTotalsReconciliation } from "./dailyTotals";
import { claimSeoExecutionLease, releaseSeoExecutionLease, renewSeoExecutionLease, SeoExecutionLeaseLostError, withSeoExecutionLease, type SeoExecutionLease } from "./scheduledSync";
import { SEO_SCHEDULED_HEARTBEAT_MINUTES } from "./scheduledPolicy";
import { bestEffortExecutionCleanup } from "./executionLifecycle";

const syncInFlight = new Map<string, Promise<SeoSyncResult>>();
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
export type SeoSyncResult = { runId: string; status: "success" | "partial"; rowsImported: number; pagesCompleted: number; startDate: string; endDate: string; diagnostic?: string; errorCode?: string };
type SearchPerformanceRow = NonNullable<Awaited<ReturnType<typeof fetchSearchPerformance>>["rows"]>[number];
export class SeoSyncInProgressError extends Error { code = "SYNC_IN_PROGRESS"; }

export async function runSeoSync(trigger: "manual" | "scheduled" = "scheduled", now = new Date(), ownedLease?: SeoExecutionLease): Promise<SeoSyncResult> {
  const config = resolveSearchConsoleConfig();
  if (!config.configured || !config.siteUrl) throw new SeoConfigurationError(`Search Console is not configured; missing ${config.missing.join(", ")}`);
  const propertyId = config.siteUrl;
  const inFlightKey = propertyId;
  const existing = syncInFlight.get(inFlightKey);
  if (existing) return existing;
  const task: Promise<SeoSyncResult> = (async () => {
    const executionLease = ownedLease ?? await claimSeoExecutionLease(trigger);
    if (!executionLease) throw new SeoSyncInProgressError(`SEO synchronization is already in progress for ${propertyId}`);
    if (executionLease.propertyId !== propertyId || executionLease.trigger !== trigger) {
      await releaseSeoExecutionLease(executionLease);
      throw new Error("SEO execution lease does not match the requested property and trigger");
    }
    const abortController = new AbortController();
    let leaseLost = false;
    const loseLease = (cause?: unknown) => {
      if (leaseLost) return;
      leaseLost = true;
      abortController.abort(cause ?? new SeoExecutionLeaseLostError("SEO synchronization lease ownership was lost"));
    };
    const heartbeat = setInterval(async () => {
      try {
        if (!await renewSeoExecutionLease(executionLease)) loseLease();
      } catch (error) {
        console.error("[SEO Sync] execution lease heartbeat failed; fencing worker:", error);
        loseLease(error);
      }
    }, SEO_SCHEDULED_HEARTBEAT_MINUTES * 60_000);
    const fencedMutation = <T>(work: (tx: typeof db) => Promise<T>) => {
      if (leaseLost) throw new SeoExecutionLeaseLostError("SEO synchronization lease ownership was lost");
      return withSeoExecutionLease(executionLease, work);
    };
    /** Execution lifecycle:
     * importing -> finalizing -> finalized -> cleanup(best effort)
     * importing/finalizing -> aborted -> fenced failure finalization -> cleanup
     * failed finalization -> lease retained -> expired reclaim marks abandoned. */
    let runCreated = false;
    let runFinalized = false;
    try {
    const end = new Date(now); end.setUTCDate(end.getUTCDate() - 3);
    const start = new Date(end); start.setUTCDate(start.getUTCDate() - 61);
    const startDate = isoDay(start), endDate = isoDay(end);
    const [run] = await fencedMutation(async (tx) => {
      const rows = await tx.insert(seoSyncRuns).values({ propertyId, trigger, startDate, endDate }).returning({ id: seoSyncRuns.id });
      await tx.update(seoSyncExecutionLeases).set({ runId: rows[0].id, updatedAt: new Date() }).where(and(
        eq(seoSyncExecutionLeases.propertyId, executionLease.propertyId), eq(seoSyncExecutionLeases.leaseToken, executionLease.leaseToken),
      ));
      return rows;
    });
    runCreated = true;
    let rowsImported = 0, pagesCompleted = 0;
    try {
      await applySearchConsoleDailyTotalsReconciliation({
        propertyId,
        startDate,
        endDate,
        fetchRows: async () => (await fetchSearchDailyTotals(startDate, endDate, abortController.signal)).rows ?? [],
        persist: async (reconciledTotals) => fencedMutation(async (tx) => {
          await tx.insert(seoSearchDailyTotals).values(reconciledTotals).onConflictDoUpdate({
            target: [seoSearchDailyTotals.propertyId, seoSearchDailyTotals.reportingDate],
            set: { clicks: sql`excluded.clicks`, impressions: sql`excluded.impressions`, ctr: sql`excluded.ctr`, position: sql`excluded.position`, importedAt: new Date() },
          });
        }),
      });
      const pageSize = SEO_SEARCH_CONSOLE_PAGE_SIZE;
      let overallTruncated = false;
      const truncatedDays: string[] = [];
      for (const reportingDate of recentFirstReportingDates(startDate, endDate)) {
        const dayRows: SearchPerformanceRow[] = [];
        let dayFetched = false;
        for (let startRow = 0; rowsImported + dayRows.length < SEO_SEARCH_CONSOLE_MAX_ROWS; startRow += pageSize) {
          const rowLimit = Math.min(pageSize, SEO_SEARCH_CONSOLE_MAX_ROWS - rowsImported - dayRows.length);
          const result = await fetchSearchPerformance({ startDate: reportingDate, endDate: reportingDate, startRow, rowLimit, signal: abortController.signal });
          const rows = result.rows ?? [];
          dayFetched = true;
          dayRows.push(...rows);
          pagesCompleted += 1;
          await fencedMutation((tx) => tx.update(seoSyncRuns).set({ rowsImported, pagesCompleted }).where(and(eq(seoSyncRuns.id, run.id), eq(seoSyncRuns.propertyId, propertyId))));
          const pageState = evaluateSearchConsolePage({ startRow, fetchedRows: rows.length, requestedRows: rowLimit, totalImported: rowsImported + dayRows.length });
          if (pageState.dayTruncated) {
            truncatedDays.push(reportingDate);
            if (pageState.overallTruncated) overallTruncated = true;
            break;
          }
          if (pageState.overallTruncated) {
            overallTruncated = true;
            break;
          }
          if (rows.length < rowLimit) break;
        }
        if (dayFetched) {
          await fencedMutation(async (tx) => {
            await tx.delete(seoSearchSnapshots).where(and(
              eq(seoSearchSnapshots.propertyId, propertyId),
              eq(seoSearchSnapshots.reportingDate, reportingDate),
            ));
            for (const batch of snapshotInsertBatches(dayRows)) {
              await tx.insert(seoSearchSnapshots).values(batch.map((row) => ({ propertyId, reportingDate, query: row.keys[1], page: row.keys[2], clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position }))).onConflictDoUpdate({
                target: [seoSearchSnapshots.propertyId, seoSearchSnapshots.reportingDate, seoSearchSnapshots.query, seoSearchSnapshots.page],
                set: { clicks: sql`excluded.clicks`, impressions: sql`excluded.impressions`, ctr: sql`excluded.ctr`, position: sql`excluded.position`, importedAt: new Date() },
              });
            }
          });
          rowsImported += dayRows.length;
          await fencedMutation((tx) => tx.update(seoSyncRuns).set({ rowsImported, pagesCompleted }).where(and(eq(seoSyncRuns.id, run.id), eq(seoSyncRuns.propertyId, propertyId))));
        }
        if (overallTruncated || rowsImported >= SEO_SEARCH_CONSOLE_MAX_ROWS) break;
      }
      if (truncatedDays.length || overallTruncated) {
        const dailyDiagnostic = truncatedDays.length ? `${truncatedDays.length} reporting day(s) reached the ${SEO_SEARCH_CONSOLE_DAILY_MAX_ROWS}-row daily ceiling (${truncatedDays.join(", ")}); additional rows for those days may be unavailable.` : "";
        const overallDiagnostic = overallTruncated ? ` Import reached the ${SEO_SEARCH_CONSOLE_MAX_ROWS}-row overall safety cap; older reporting dates may be incomplete.` : "";
        const diagnostic = `${dailyDiagnostic}${overallDiagnostic}`.trim();
        const truncationCode = overallTruncated ? "OVERALL_AND_DAILY_ROW_CAP_TRUNCATED" : "DAILY_ROW_CAP_TRUNCATED";
        await fencedMutation((tx) => tx.update(seoSyncRuns).set({ status: "partial", rowsImported, pagesCompleted, errorCode: truncationCode, errorMessage: diagnostic, completedAt: new Date() }).where(and(eq(seoSyncRuns.id, run.id), eq(seoSyncRuns.propertyId, propertyId))));
        runFinalized = true;
        console.warn(`[SEO Sync] truncated run=${run.id} rows=${rowsImported} pages=${pagesCompleted}`);
        return { runId: run.id, status: "partial" as const, rowsImported, pagesCompleted, startDate, endDate, diagnostic, errorCode: truncationCode };
      }
      await fencedMutation((tx) => tx.update(seoSyncRuns).set({ status: "success", rowsImported, pagesCompleted, completedAt: new Date() }).where(and(eq(seoSyncRuns.id, run.id), eq(seoSyncRuns.propertyId, propertyId))));
      runFinalized = true;
      console.info(`[SEO Sync] completed run=${run.id} rows=${rowsImported} pages=${pagesCompleted}`);
      return { runId: run.id, status: "success" as const, rowsImported, pagesCompleted, startDate, endDate };
    } catch (error) {
      const lost = leaseLost || error instanceof SeoExecutionLeaseLostError || (error as { code?: string }).code === "LEASE_LOST";
      const failure = lost
        ? { status: "failed" as const, errorCode: "LEASE_HEARTBEAT_ABORTED", errorMessage: "SEO import aborted after execution lease heartbeat or ownership was lost" }
        : describeSeoSyncFailure(error, rowsImported);
      try {
        await withSeoExecutionLease(executionLease, (tx) => tx.update(seoSyncRuns).set({ ...failure, rowsImported, pagesCompleted, completedAt: new Date() }).where(and(eq(seoSyncRuns.id, run.id), eq(seoSyncRuns.propertyId, propertyId))));
        runFinalized = true;
      } catch (finalizeError) {
        console.error(`[SEO Sync] could not finalize run=${run.id}; expired-lease reclaim will reconcile it:`, finalizeError);
      }
      console.error(`[SEO Sync] failed run=${run.id} code=${failure.errorCode} rows=${rowsImported}: ${failure.errorMessage}`);
      throw error;
    }
    } finally {
      clearInterval(heartbeat);
      if (!runCreated || runFinalized) {
        await bestEffortExecutionCleanup(async () => {
          if (!await releaseSeoExecutionLease(executionLease)) console.warn("[SEO Sync] execution lease cleanup skipped; ownership already changed");
        }, (cleanupError) => console.error("[SEO Sync] execution lease cleanup failed; finalized result is preserved and lease will expire:", cleanupError));
      }
    }
  })();
  const tracked = task.finally(() => { syncInFlight.delete(inFlightKey); });
  syncInFlight.set(inFlightKey, tracked);
  return tracked;
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
  let visibleLatestRun = latestRun;
  if (latestRun?.status === "running") {
    const activeLease = await db.select({ runId: seoSyncExecutionLeases.runId }).from(seoSyncExecutionLeases).where(and(
      eq(seoSyncExecutionLeases.propertyId, propertyId), eq(seoSyncExecutionLeases.runId, latestRun.id),
      sql`${seoSyncExecutionLeases.leaseExpiresAt} > NOW()`,
    )).limit(1);
    if (!activeLease.length) visibleLatestRun = { ...latestRun, status: "failed", errorCode: "LEASE_ABANDONED", errorMessage: "Execution lease expired before the worker finalized the run", completedAt: latestRun.completedAt ?? new Date() };
  }
  const currentClicks = numberValue(totals.current_clicks), currentImpressions = numberValue(totals.current_impressions), previousClicks = numberValue(totals.previous_clicks), previousImpressions = numberValue(totals.previous_impressions);
  return { config: { configured: config.configured, missing: config.missing }, latestSync: serializeSeoSyncRun(visibleLatestRun), lastSuccessfulSync: lastRun?.completedAt ?? null, period: { startDate: currentStartDay, endDate: endDay, clicks: currentClicks, impressions: currentImpressions, ctr: currentClicks / Math.max(1, currentImpressions), position: averageSeoPosition(numberValue(totals.current_position_weighted), currentImpressions), previous: { clicks: previousClicks, impressions: previousImpressions, ctr: previousClicks / Math.max(1, previousImpressions), position: averageSeoPosition(numberValue(totals.previous_position_weighted), previousImpressions) } }, topQueries: topList(topQueriesResult.rows), topPages: topList(topPagesResult.rows), opportunities: detectSeoOpportunities(current, previous, SEO_TARGETS, targetVisibility).slice(0,50) };
}
