/** Seven bound values per snapshot means 5,000 rows stays well below PostgreSQL's
 * 65,535-parameter extended-query limit, with room for ORM-added parameters. */
export const SEO_SNAPSHOT_INSERT_BATCH_SIZE = 5_000;
export const SEO_SEARCH_CONSOLE_PAGE_SIZE = 25_000;
export const SEO_SEARCH_CONSOLE_MAX_ROWS = 500_000;
export const SEO_SEARCH_CONSOLE_DAILY_MAX_ROWS = 50_000;
export const SEO_DASHBOARD_CANDIDATE_LIMIT = 5_000;

export function snapshotInsertBatches<T>(rows: readonly T[], size = SEO_SNAPSHOT_INSERT_BATCH_SIZE): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error("Snapshot batch size must be a positive integer");
  const batches: T[][] = [];
  for (let offset = 0; offset < rows.length; offset += size) batches.push(rows.slice(offset, offset + size));
  return batches;
}

export function boundDashboardCandidates<T>(rows: readonly T[], priority?: (row: T) => number): T[] {
  const candidates = priority ? [...rows].sort((a, b) => priority(b) - priority(a)) : rows;
  return candidates.slice(0, SEO_DASHBOARD_CANDIDATE_LIMIT);
}

export function searchConsoleImportIsTruncated(importedRows: number, fetchedRows: number, requestedRows = SEO_SEARCH_CONSOLE_PAGE_SIZE): boolean {
  return importedRows >= SEO_SEARCH_CONSOLE_MAX_ROWS && fetchedRows === requestedRows;
}

export function searchConsoleDayIsTruncated(startRow: number, fetchedRows: number, requestedRows = SEO_SEARCH_CONSOLE_PAGE_SIZE): boolean {
  return fetchedRows === requestedRows && startRow + fetchedRows >= SEO_SEARCH_CONSOLE_DAILY_MAX_ROWS;
}

export function evaluateSearchConsolePage(params: { startRow: number; fetchedRows: number; requestedRows: number; totalImported: number }) {
  return {
    dayTruncated: searchConsoleDayIsTruncated(params.startRow, params.fetchedRows, params.requestedRows),
    overallTruncated: searchConsoleImportIsTruncated(params.totalImported, params.fetchedRows, params.requestedRows),
  };
}

/** Search Console's default row ordering is not chronological. Querying one day
 * at a time makes global-cap behavior deterministic and preserves recent data. */
export function recentFirstReportingDates(startDate: string, endDate: string): string[] {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) {
    throw new Error("Invalid Search Console reporting date range");
  }
  const dates: string[] = [];
  for (const day = new Date(end); day >= start; day.setUTCDate(day.getUTCDate() - 1)) {
    dates.push(day.toISOString().slice(0, 10));
  }
  return dates;
}
