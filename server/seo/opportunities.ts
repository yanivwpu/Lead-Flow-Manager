import { SEO_TARGETS } from "@shared/seoTargets";

export type SeoMetricRow = { query: string; page: string; clicks: number; impressions: number; position: number };
export type SeoOpportunity = { type: "striking_distance" | "decline" | "low_ctr" | "cannibalization" | "no_visibility"; priority: number; query: string; page?: string; evidence: Record<string, number | string> };
export type TargetVisibility = { query: string; impressions: number; qualifyingPages: number };
export const SEO_DECLINE_MIN_PREVIOUS_IMPRESSIONS = 20;
export const SEO_DECLINE_RETAINED_RATIO = 0.8;
export const SEO_DECLINE_POSITION_DELTA = 2;

export function scoreSeoDecline(current: SeoMetricRow, previous: SeoMetricRow): { qualifies: boolean; priority: number; positionDeterioration: number } {
  const positionDeterioration = current.position > 0 ? Math.max(0, current.position - previous.position) : 0;
  const qualifies = previous.impressions >= SEO_DECLINE_MIN_PREVIOUS_IMPRESSIONS && (
    (previous.clicks > 0 && current.clicks <= previous.clicks * SEO_DECLINE_RETAINED_RATIO) ||
    current.impressions <= previous.impressions * SEO_DECLINE_RETAINED_RATIO ||
    positionDeterioration > SEO_DECLINE_POSITION_DELTA
  );
  const positionEvidence = positionDeterioration * Math.max(1, previous.impressions);
  return {
    qualifies,
    priority: qualifies ? Math.max(0, Math.round(Math.max(previous.clicks - current.clicks, previous.impressions - current.impressions, positionEvidence))) : 0,
    positionDeterioration,
  };
}
const aggregate = (rows: SeoMetricRow[]) => {
  const map = new Map<string, SeoMetricRow>();
  for (const row of rows) {
    const key = `${row.query}\0${row.page}`; const old = map.get(key);
    const impressions = (old?.impressions ?? 0) + row.impressions;
    map.set(key, { query: row.query, page: row.page, clicks: (old?.clicks ?? 0) + row.clicks, impressions, position: (((old?.position ?? 0) * (old?.impressions ?? 0)) + row.position * row.impressions) / Math.max(1, impressions) });
  }
  return [...map.values()];
};

export function detectSeoOpportunities(currentInput: SeoMetricRow[], previousInput: SeoMetricRow[], targets = SEO_TARGETS, targetVisibility?: TargetVisibility[]): SeoOpportunity[] {
  const current = aggregate(currentInput), previous = aggregate(previousInput);
  const present = new Map(current.map((r) => [`${r.query}\0${r.page}`, r]));
  const prior = new Map(previous.map((r) => [`${r.query}\0${r.page}`, r]));
  const out: SeoOpportunity[] = [];
  for (const row of current) {
    const ctr = row.clicks / Math.max(1, row.impressions);
    if (row.impressions >= 100 && row.position >= 4 && row.position <= 20) out.push({ type: "striking_distance", priority: Math.round(row.impressions / Math.max(1, row.position)), query: row.query, page: row.page, evidence: { impressions: row.impressions, position: row.position, clicks: row.clicks } });
    const expectedCtr = row.position <= 3 ? .12 : row.position <= 10 ? .04 : .015;
    if (row.impressions >= 100 && ctr < expectedCtr * .6) out.push({ type: "low_ctr", priority: Math.round((expectedCtr - ctr) * row.impressions), query: row.query, page: row.page, evidence: { clicks: row.clicks, ctr, expectedCtr, impressions: row.impressions, position: row.position } });
  }
  // Compare the union of keys. Missing current rows represent zero traffic rather
  // than absence of evidence, so complete losses remain visible to admins.
  for (const [key, old] of prior) {
    const row = present.get(key) ?? { query: old.query, page: old.page, clicks: 0, impressions: 0, position: 0 };
    const decline = scoreSeoDecline(row, old);
    if (decline.qualifies) {
      out.push({ type: "decline", priority: decline.priority, query: row.query, page: row.page, evidence: { clicks: row.clicks, previousClicks: old.clicks, impressions: row.impressions, previousImpressions: old.impressions, position: row.position, previousPosition: old.position, positionDeterioration: decline.positionDeterioration } });
    }
  }
  const important = new Set(targets.map((t) => t.keyword.toLowerCase()));
  const visibility = new Map(targetVisibility?.map((row) => [row.query.toLowerCase(), row]));
  for (const query of important) {
    const reportedRows = current.filter((r) => r.query.toLowerCase() === query);
    const pages = reportedRows.filter((r) => r.impressions >= 10);
    const hasReportedVisibility = visibility.has(query) || reportedRows.length > 0;
    const totalImpressions = visibility.get(query)?.impressions ?? reportedRows.reduce((n, r) => n + r.impressions, 0);
    const qualifyingPages = visibility.get(query)?.qualifyingPages ?? pages.length;
    if (qualifyingPages > 1) {
      const competingPages = reportedRows.filter((row) => row.impressions >= 10).sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions || a.position - b.position || a.page.localeCompare(b.page));
      out.push({ type: "cannibalization", priority: Math.round(totalImpressions), query, page: competingPages[0]?.page, evidence: { pages: qualifyingPages, impressions: totalImpressions, competingPages: JSON.stringify(competingPages) } });
    }
    if (hasReportedVisibility && totalImpressions < 10) out.push({ type: "no_visibility", priority: 50, query, page: targets.find((t) => t.keyword === query)?.canonicalPage, evidence: { impressions: totalImpressions } });
  }
  return out.sort((a, b) => b.priority - a.priority);
}
