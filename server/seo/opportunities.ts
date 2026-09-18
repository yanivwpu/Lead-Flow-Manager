import { SEO_TARGETS } from "@shared/seoTargets";

export type SeoMetricRow = { query: string; page: string; clicks: number; impressions: number; position: number };
export type SeoOpportunity = { type: "striking_distance" | "decline" | "low_ctr" | "cannibalization" | "no_visibility"; priority: number; query: string; page?: string; evidence: Record<string, number | string> };
const aggregate = (rows: SeoMetricRow[]) => {
  const map = new Map<string, SeoMetricRow>();
  for (const row of rows) {
    const key = `${row.query}\0${row.page}`; const old = map.get(key);
    const impressions = (old?.impressions ?? 0) + row.impressions;
    map.set(key, { query: row.query, page: row.page, clicks: (old?.clicks ?? 0) + row.clicks, impressions, position: (((old?.position ?? 0) * (old?.impressions ?? 0)) + row.position * row.impressions) / Math.max(1, impressions) });
  }
  return [...map.values()];
};

export function detectSeoOpportunities(currentInput: SeoMetricRow[], previousInput: SeoMetricRow[], targets = SEO_TARGETS): SeoOpportunity[] {
  const current = aggregate(currentInput), previous = aggregate(previousInput);
  const present = new Map(current.map((r) => [`${r.query}\0${r.page}`, r]));
  const prior = new Map(previous.map((r) => [`${r.query}\0${r.page}`, r]));
  const out: SeoOpportunity[] = [];
  for (const row of current) {
    const ctr = row.clicks / Math.max(1, row.impressions);
    if (row.impressions >= 100 && row.position >= 4 && row.position <= 20) out.push({ type: "striking_distance", priority: Math.round(row.impressions / Math.max(1, row.position)), query: row.query, page: row.page, evidence: { impressions: row.impressions, position: row.position, clicks: row.clicks } });
    const expectedCtr = row.position <= 3 ? .12 : row.position <= 10 ? .04 : .015;
    if (row.impressions >= 100 && ctr < expectedCtr * .6) out.push({ type: "low_ctr", priority: Math.round((expectedCtr - ctr) * row.impressions), query: row.query, page: row.page, evidence: { ctr, expectedCtr, impressions: row.impressions, position: row.position } });
  }
  // Compare the union of keys. Missing current rows represent zero traffic rather
  // than absence of evidence, so complete losses remain visible to admins.
  for (const [key, old] of prior) {
    const row = present.get(key) ?? { query: old.query, page: old.page, clicks: 0, impressions: 0, position: 0 };
    if (old.impressions >= 20 && (row.clicks < old.clicks * .8 || row.impressions < old.impressions * .8 || (row.position > 0 && row.position > old.position + 2))) {
      const positionDeterioration = row.position > 0 ? Math.max(0, row.position - old.position) : 0;
      const positionEvidence = positionDeterioration * Math.max(1, old.impressions);
      const priority = Math.max(0, Math.round(Math.max(old.clicks - row.clicks, old.impressions - row.impressions, positionEvidence)));
      out.push({ type: "decline", priority, query: row.query, page: row.page, evidence: { clicks: row.clicks, previousClicks: old.clicks, impressions: row.impressions, previousImpressions: old.impressions, position: row.position, previousPosition: old.position, positionDeterioration } });
    }
  }
  const important = new Set(targets.map((t) => t.keyword.toLowerCase()));
  for (const query of important) {
    const pages = current.filter((r) => r.query.toLowerCase() === query && r.impressions >= 10);
    if (pages.length > 1) out.push({ type: "cannibalization", priority: pages.reduce((n, r) => n + r.impressions, 0), query, evidence: { pages: pages.length, impressions: pages.reduce((n, r) => n + r.impressions, 0) } });
    if (pages.reduce((n, r) => n + r.impressions, 0) < 10) out.push({ type: "no_visibility", priority: 50, query, page: targets.find((t) => t.keyword === query)?.canonicalPage, evidence: { impressions: pages.reduce((n, r) => n + r.impressions, 0) } });
  }
  return out.sort((a, b) => b.priority - a.priority);
}
