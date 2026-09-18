import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { seoSearchSnapshots, seoSyncRuns } from "@shared/schema";
import { fetchSearchPerformance, resolveSearchConsoleConfig, SeoConfigurationError, SearchConsoleError } from "./searchConsole";
import { detectSeoOpportunities, type SeoMetricRow } from "./opportunities";
import { SEO_SEARCH_CONSOLE_MAX_ROWS, SEO_SEARCH_CONSOLE_PAGE_SIZE, recentFirstReportingDates, searchConsoleImportIsTruncated, snapshotInsertBatches } from "./snapshotBatches";
import { averageSeoPosition } from "@shared/seoMetrics";

let syncInFlight: Promise<SeoSyncResult> | null = null;
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
export type SeoSyncResult = { runId: string; status: "success" | "partial"; rowsImported: number; pagesCompleted: number; startDate: string; endDate: string; diagnostic?: string };

export async function runSeoSync(trigger: "manual" | "scheduled" = "scheduled", now = new Date()): Promise<SeoSyncResult> {
  if (syncInFlight) return syncInFlight;
  const task: Promise<SeoSyncResult> = (async () => {
    const end = new Date(now); end.setUTCDate(end.getUTCDate() - 3);
    const start = new Date(end); start.setUTCDate(start.getUTCDate() - 61);
    const startDate = isoDay(start), endDate = isoDay(end);
    const [run] = await db.insert(seoSyncRuns).values({ trigger, startDate, endDate }).returning({ id: seoSyncRuns.id });
    let rowsImported = 0, pagesCompleted = 0;
    try {
      const pageSize = SEO_SEARCH_CONSOLE_PAGE_SIZE;
      let truncated = false;
      for (const reportingDate of recentFirstReportingDates(startDate, endDate)) {
        for (let startRow = 0; rowsImported < SEO_SEARCH_CONSOLE_MAX_ROWS; startRow += pageSize) {
          const rowLimit = Math.min(pageSize, SEO_SEARCH_CONSOLE_MAX_ROWS - rowsImported);
          const result = await fetchSearchPerformance({ startDate: reportingDate, endDate: reportingDate, startRow, rowLimit });
          const rows = result.rows ?? [];
          if (rows.length) {
            for (const batch of snapshotInsertBatches(rows)) {
              await db.insert(seoSearchSnapshots).values(batch.map((row) => ({ reportingDate: row.keys[0], query: row.keys[1], page: row.keys[2], clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position }))).onConflictDoUpdate({
                target: [seoSearchSnapshots.reportingDate, seoSearchSnapshots.query, seoSearchSnapshots.page],
                set: { clicks: sql`excluded.clicks`, impressions: sql`excluded.impressions`, ctr: sql`excluded.ctr`, position: sql`excluded.position`, importedAt: new Date() },
              });
              rowsImported += batch.length;
              await db.update(seoSyncRuns).set({ rowsImported, pagesCompleted }).where(eq(seoSyncRuns.id, run.id));
            }
            pagesCompleted += 1;
            await db.update(seoSyncRuns).set({ rowsImported, pagesCompleted }).where(eq(seoSyncRuns.id, run.id));
          }
          if (searchConsoleImportIsTruncated(rowsImported, rows.length, rowLimit)) {
            truncated = true;
            break;
          }
          if (rows.length < rowLimit) break;
        }
        if (truncated) break;
      }
      if (truncated) {
        const diagnostic = `Import reached the ${SEO_SEARCH_CONSOLE_MAX_ROWS}-row safety cap with a full final page; additional Search Console rows may exist`;
        await db.update(seoSyncRuns).set({ status: "partial", rowsImported, pagesCompleted, errorCode: "ROW_CAP_TRUNCATED", errorMessage: diagnostic, completedAt: new Date() }).where(eq(seoSyncRuns.id, run.id));
        console.warn(`[SEO Sync] truncated run=${run.id} rows=${rowsImported} pages=${pagesCompleted}`);
        return { runId: run.id, status: "partial" as const, rowsImported, pagesCompleted, startDate, endDate, diagnostic };
      }
      await db.update(seoSyncRuns).set({ status: "success", rowsImported, pagesCompleted, completedAt: new Date() }).where(eq(seoSyncRuns.id, run.id));
      console.info(`[SEO Sync] completed run=${run.id} rows=${rowsImported} pages=${pagesCompleted}`);
      return { runId: run.id, status: "success" as const, rowsImported, pagesCompleted, startDate, endDate };
    } catch (error) {
      const code = error instanceof SeoConfigurationError ? error.code : error instanceof SearchConsoleError ? error.code : "IMPORT_FAILED";
      const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown import failure";
      await db.update(seoSyncRuns).set({ status: rowsImported ? "partial" : "failed", rowsImported, pagesCompleted, errorCode: code, errorMessage: message, completedAt: new Date() }).where(eq(seoSyncRuns.id, run.id));
      console.error(`[SEO Sync] failed run=${run.id} code=${code} rows=${rowsImported}: ${message}`);
      throw error;
    }
  })();
  syncInFlight = task.finally(() => { syncInFlight = null; });
  return syncInFlight;
}

function summarize(rows: SeoMetricRow[]) {
  return rows.reduce((a, r) => ({ clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions, positionWeighted: a.positionWeighted + r.position * r.impressions }), { clicks: 0, impressions: 0, positionWeighted: 0 });
}
export async function getSeoDashboard(now = new Date()) {
  const end = new Date(now); end.setUTCDate(end.getUTCDate() - 3);
  const currentStart = new Date(end); currentStart.setUTCDate(currentStart.getUTCDate() - 27);
  const previousStart = new Date(currentStart); previousStart.setUTCDate(previousStart.getUTCDate() - 28);
  const rows = await db.select().from(seoSearchSnapshots).where(and(gte(seoSearchSnapshots.reportingDate, isoDay(previousStart)), lte(seoSearchSnapshots.reportingDate, isoDay(end))));
  const metricRows = rows.map((r) => ({ query: r.query, page: r.page, clicks: r.clicks, impressions: r.impressions, position: r.position }));
  const split = rows.map((r, i) => ({ date: r.reportingDate, row: metricRows[i] }));
  const current = split.filter((r) => r.date >= isoDay(currentStart)).map((r) => r.row), previous = split.filter((r) => r.date < isoDay(currentStart)).map((r) => r.row);
  const totals = summarize(current), previousTotals = summarize(previous);
  const group = (key: "query" | "page") => [...current.reduce((m, r) => { const k = r[key]; const v = m.get(k) ?? { name: k, clicks: 0, impressions: 0 }; v.clicks += r.clicks; v.impressions += r.impressions; m.set(k, v); return m; }, new Map<string, {name:string;clicks:number;impressions:number}>()).values()].sort((a,b) => b.clicks-a.clicks).slice(0,10);
  const [lastRun] = await db.select().from(seoSyncRuns).where(eq(seoSyncRuns.status, "success")).orderBy(desc(seoSyncRuns.completedAt)).limit(1);
  const config = resolveSearchConsoleConfig();
  return { config: { configured: config.configured, missing: config.missing }, lastSuccessfulSync: lastRun?.completedAt ?? null, period: { startDate: isoDay(currentStart), endDate: isoDay(end), clicks: totals.clicks, impressions: totals.impressions, ctr: totals.clicks / Math.max(1, totals.impressions), position: averageSeoPosition(totals.positionWeighted, totals.impressions), previous: { clicks: previousTotals.clicks, impressions: previousTotals.impressions, ctr: previousTotals.clicks / Math.max(1, previousTotals.impressions), position: averageSeoPosition(previousTotals.positionWeighted, previousTotals.impressions) } }, topQueries: group("query"), topPages: group("page"), opportunities: detectSeoOpportunities(current, previous).slice(0,50) };
}
