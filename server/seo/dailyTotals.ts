export type SearchConsoleDailyTotal = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

export function expectedUtcReportingDates(startDate: string, endDate: string): string[] {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) {
    throw new Error("Invalid Search Console totals date range");
  }
  const dates: string[] = [];
  for (const day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) dates.push(isoDay(day));
  return dates;
}

/** A completed date-only response is authoritative for the requested range.
 * Missing dates are explicit zeroes so an older nonzero total cannot survive. */
export function reconcileSearchConsoleDailyTotals(
  propertyId: string,
  startDate: string,
  endDate: string,
  rows: readonly SearchConsoleDailyTotal[],
) {
  const byDate = new Map(rows.map((row) => [row.keys[0], row]));
  return expectedUtcReportingDates(startDate, endDate).map((reportingDate) => {
    const row = byDate.get(reportingDate);
    return {
      propertyId,
      reportingDate,
      clicks: row?.clicks ?? 0,
      impressions: row?.impressions ?? 0,
      ctr: row?.ctr ?? 0,
      position: row?.position ?? 0,
    };
  });
}
