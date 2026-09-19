/** Run: npx tsx tests/seo-intelligence.test.ts */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectSeoOpportunities, scoreSeoDecline } from "../server/seo/opportunities";
import { normalizeSearchConsoleProperty, resolveSearchConsoleConfig, SearchConsoleError, SeoConfigurationError, fetchSearchPerformance } from "../server/seo/searchConsole";
import { SEO_DASHBOARD_CANDIDATE_LIMIT, SEO_SEARCH_CONSOLE_DAILY_MAX_ROWS, SEO_SEARCH_CONSOLE_MAX_ROWS, SEO_SEARCH_CONSOLE_PAGE_SIZE, SEO_SNAPSHOT_INSERT_BATCH_SIZE, boundDashboardCandidates, recentFirstReportingDates, searchConsoleDayIsTruncated, searchConsoleImportIsTruncated, snapshotInsertBatches } from "../server/seo/snapshotBatches";
import { averagePositionImprovementPercent, averageSeoPosition, formatSeoPercent } from "../shared/seoMetrics";
import { describeSeoSyncFailure, summarizeSeoSyncHistory, type PersistedSeoSyncRun } from "../server/seo/syncStatus";

const current = [
  { query: "whatsapp crm", page: "https://www.whachatcrm.com/", clicks: 5, impressions: 500, position: 8 },
  { query: "whatsapp crm", page: "https://www.whachatcrm.com/pricing", clicks: 2, impressions: 200, position: 11 },
  { query: "falling", page: "https://www.whachatcrm.com/a", clicks: 10, impressions: 100, position: 12 },
  { query: "missing target", page: "https://www.whachatcrm.com/missing", clicks: 0, impressions: 5, position: 40 },
];
const previous = [{ query: "falling", page: "https://www.whachatcrm.com/a", clicks: 30, impressions: 300, position: 7 }];
const opportunities = detectSeoOpportunities(current, previous, [
  { keyword: "whatsapp crm", canonicalPage: "https://www.whachatcrm.com", priority: "primary" },
  { keyword: "missing target", canonicalPage: "https://www.whachatcrm.com/missing", priority: "primary" },
]);
for (const type of ["striking_distance", "decline", "low_ctr", "cannibalization", "no_visibility"]) assert.ok(opportunities.some((o) => o.type === type), `classifies ${type}`);
assert.equal(opportunities.find((o) => o.type === "decline")?.evidence.previousClicks, 30, "preceding-period comparison is retained");

const disappeared = detectSeoOpportunities([], [{ query: "vanished", page: "/old", clicks: 25, impressions: 250, position: 6 }], []);
assert.deepEqual(disappeared[0]?.evidence, { clicks: 0, previousClicks: 25, impressions: 0, previousImpressions: 250, position: 0, previousPosition: 6, positionDeterioration: 0 });

const oversized = Array.from({ length: SEO_SNAPSHOT_INSERT_BATCH_SIZE * 2 + 17 }, (_, id) => ({ id }));
const batches = snapshotInsertBatches(oversized);
assert.deepEqual(batches.map((batch) => batch.length), [5_000, 5_000, 17]);
assert.deepEqual(batches.flat(), oversized, "batching neither drops nor duplicates rows");
const largeDashboardResult = boundDashboardCandidates(Array.from({ length: 500_000 }, (_, id) => id));
assert.equal(largeDashboardResult.length, SEO_DASHBOARD_CANDIDATE_LIMIT, "dashboard candidates remain bounded for cap-sized imports");
assert.equal(largeDashboardResult.at(-1), SEO_DASHBOARD_CANDIDATE_LIMIT - 1);
const priorityCandidates = Array.from({ length: 5_100 }, (_, id) => ({ id, priority: 10 }));
priorityCandidates.push({ id: 99_999, priority: 10_000 });
const boundedByPriority = boundDashboardCandidates(priorityCandidates, (row) => row.priority);
assert.ok(boundedByPriority.some((row) => row.id === 99_999), "high-priority low-volume opportunity survives more than 5,000 candidates");

const minorDeclines = Array.from({ length: 5_100 }, (_, id) => ({
  id,
  score: scoreSeoDecline(
    { query: `minor-${id}`, page: `/minor/${id}`, clicks: 9_900, impressions: 99_000, position: 30 },
    { query: `minor-${id}`, page: `/minor/${id}`, clicks: 10_000, impressions: 100_000, position: 30 },
  ),
}));
assert.ok(minorDeclines.every((candidate) => !candidate.score.qualifies && candidate.score.priority === 0), "one-percent declines receive no decline priority");
const genuineDecline = {
  id: 999_999,
  score: scoreSeoDecline(
    { query: "genuine", page: "/genuine", clicks: 80, impressions: 800, position: 30 },
    { query: "genuine", page: "/genuine", clicks: 100, impressions: 1_000, position: 30 },
  ),
};
assert.ok(genuineDecline.score.qualifies, "an exact twenty-percent loss qualifies");
const sqlEligibleCandidates = [...minorDeclines, genuineDecline].filter((candidate) => candidate.score.qualifies);
const boundedEligibleCandidates = boundDashboardCandidates(sqlEligibleCandidates, (candidate) => candidate.score.priority);
assert.deepEqual(boundedEligibleCandidates.map((candidate) => candidate.id), [999_999], "genuine lower-impression decline survives the cap after shared eligibility filtering");
const finalDeclines = detectSeoOpportunities(
  [{ query: "genuine", page: "/genuine", clicks: 80, impressions: 800, position: 30 }],
  [{ query: "genuine", page: "/genuine", clicks: 100, impressions: 1_000, position: 30 }],
  [],
);
assert.ok(finalDeclines.some((opportunity) => opportunity.type === "decline" && opportunity.query === "genuine"));

const zeroBaselineStable = scoreSeoDecline(
  { query: "zero", page: "/zero", clicks: 0, impressions: 100, position: 8 },
  { query: "zero", page: "/zero", clicks: 0, impressions: 100, position: 8 },
);
assert.equal(zeroBaselineStable.qualifies, false, "zero-to-zero clicks do not create a click decline");
assert.equal(scoreSeoDecline(
  { query: "click-loss", page: "/click", clicks: 80, impressions: 100, position: 8 },
  { query: "click-loss", page: "/click", clicks: 100, impressions: 100, position: 8 },
).qualifies, true, "positive click baseline with a twenty-percent loss qualifies");
assert.equal(scoreSeoDecline(
  { query: "impression-loss", page: "/impression", clicks: 0, impressions: 80, position: 8 },
  { query: "impression-loss", page: "/impression", clicks: 0, impressions: 100, position: 8 },
).qualifies, true, "zero clicks do not block an independent impression decline");
assert.equal(scoreSeoDecline(
  { query: "ranking-loss", page: "/ranking", clicks: 0, impressions: 100, position: 11 },
  { query: "ranking-loss", page: "/ranking", clicks: 0, impressions: 100, position: 8 },
).qualifies, true, "zero clicks do not block an independent ranking decline");
const zeroBaselineNoise = Array.from({ length: 5_100 }, (_, id) => ({ id, score: scoreSeoDecline(
  { query: `zero-noise-${id}`, page: `/zero/${id}`, clicks: 0, impressions: 100_000, position: 30 },
  { query: `zero-noise-${id}`, page: `/zero/${id}`, clicks: 0, impressions: 100_000, position: 30 },
) }));
const boundedZeroBaseline = boundDashboardCandidates([...zeroBaselineNoise, genuineDecline].filter((row) => row.score.qualifies), (row) => row.score.priority);
assert.deepEqual(boundedZeroBaseline.map((row) => row.id), [999_999], "zero-baseline noise cannot crowd a genuine decline out of the cap");

const successRun: PersistedSeoSyncRun = { id: "success", propertyId: "sc-domain:example.com", status: "success", trigger: "scheduled", rowsImported: 100, pagesCompleted: 2, errorCode: null, errorMessage: null, startedAt: new Date("2026-09-01T00:00:00Z"), completedAt: new Date("2026-09-01T00:05:00Z") };
const partialRun: PersistedSeoSyncRun = { id: "partial", propertyId: "sc-domain:example.com", status: "partial", trigger: "manual", rowsImported: 50, pagesCompleted: 1, errorCode: "ROW_CAP_TRUNCATED", errorMessage: "additional rows may exist", startedAt: new Date("2026-09-02T00:00:00Z"), completedAt: new Date("2026-09-02T00:05:00Z") };
const failedRun: PersistedSeoSyncRun = { id: "failed", propertyId: "sc-domain:example.com", status: "failed", trigger: "scheduled", rowsImported: 0, pagesCompleted: 0, errorCode: "API_ERROR", errorMessage: "quota unavailable", startedAt: new Date("2026-09-03T00:00:00Z"), completedAt: new Date("2026-09-03T00:01:00Z") };
const afterPartial = summarizeSeoSyncHistory([successRun, partialRun], "sc-domain:example.com");
assert.equal(afterPartial.latestSync?.status, "partial");
assert.equal(afterPartial.latestSync?.errorCode, "ROW_CAP_TRUNCATED");
assert.equal(afterPartial.lastSuccessfulSync?.toISOString(), successRun.completedAt?.toISOString());
const afterFailure = summarizeSeoSyncHistory([successRun, failedRun], "sc-domain:example.com");
assert.equal(afterFailure.latestSync?.status, "failed");
assert.equal(afterFailure.latestSync?.errorMessage, "quota unavailable");
assert.equal(afterFailure.lastSuccessfulSync?.toISOString(), successRun.completedAt?.toISOString(), "latest success remains separately available after failure");
const otherPropertyRun = { ...failedRun, id: "other", propertyId: "sc-domain:other.example", startedAt: new Date("2026-09-04T00:00:00Z") };
assert.equal(summarizeSeoSyncHistory([successRun, otherPropertyRun], "sc-domain:example.com").latestSync?.id, "success", "latest-run diagnostics cannot cross properties");

assert.equal(averagePositionImprovementPercent(5, 10), 50, "10 to 5 is a positive 50% improvement");
assert.equal(averagePositionImprovementPercent(15, 10), -50, "10 to 15 is a negative 50% deterioration");
assert.equal(averageSeoPosition(0, 0), null, "no current impressions means average position is unavailable");
assert.equal(averagePositionImprovementPercent(null, 10), null, "missing current position is not a 100% improvement");
assert.equal(formatSeoPercent(averagePositionImprovementPercent(null, 10)), "—");

assert.equal(searchConsoleImportIsTruncated(SEO_SEARCH_CONSOLE_MAX_ROWS, SEO_SEARCH_CONSOLE_PAGE_SIZE), true, "a full final capped page is truncated");
assert.equal(searchConsoleImportIsTruncated(SEO_SEARCH_CONSOLE_MAX_ROWS, SEO_SEARCH_CONSOLE_PAGE_SIZE - 1), false);
const recentDates = recentFirstReportingDates("2026-07-01", "2026-08-31");
assert.equal(recentDates.length, 62);
assert.deepEqual(recentDates.slice(0, 3), ["2026-08-31", "2026-08-30", "2026-08-29"]);
assert.equal(recentDates.slice(0, 28).at(-1), "2026-08-04", "the complete current 28-day window is planned before older dates");
assert.equal(searchConsoleDayIsTruncated(SEO_SEARCH_CONSOLE_DAILY_MAX_ROWS - SEO_SEARCH_CONSOLE_PAGE_SIZE, SEO_SEARCH_CONSOLE_PAGE_SIZE), true, "a full second page reaches the per-day ceiling");
assert.equal(searchConsoleDayIsTruncated(SEO_SEARCH_CONSOLE_DAILY_MAX_ROWS - SEO_SEARCH_CONSOLE_PAGE_SIZE, SEO_SEARCH_CONSOLE_PAGE_SIZE - 1), false, "a short second page proves the day completed");

const rankingOnlyDecline = detectSeoOpportunities(
  [{ query: "growing traffic worse rank", page: "/growth", clicks: 40, impressions: 400, position: 12 }],
  [{ query: "growing traffic worse rank", page: "/growth", clicks: 20, impressions: 200, position: 8 }],
  [],
).find((item) => item.type === "decline");
assert.ok(rankingOnlyDecline);
assert.equal(rankingOnlyDecline.priority, 800, "ranking deterioration contributes positive evidence despite traffic growth");

const unrelated = Array.from({ length: 60 }, (_, index) => ({ query: `unrelated ${index}`, page: `/u/${index}`, clicks: 10, impressions: 100, position: 10 }));
const sortedWithRankingDecline = detectSeoOpportunities(
  [...unrelated, { query: "important ranking loss", page: "/important", clicks: 40, impressions: 400, position: 12 }],
  [{ query: "important ranking loss", page: "/important", clicks: 20, impressions: 200, position: 8 }],
  [],
);
const rankingDeclineIndex = sortedWithRankingDecline.findIndex((item) => item.type === "decline" && item.query === "important ranking loss");
assert.ok(rankingDeclineIndex >= 0 && rankingDeclineIndex < 50, "ranking-only decline remains visible in a top-50 result set");

const splitVisibility = detectSeoOpportunities(
  [
    { query: "split target", page: "/a", clicks: 0, impressions: 6, position: 30 },
    { query: "split target", page: "/b", clicks: 0, impressions: 6, position: 31 },
  ], [], [{ keyword: "split target", canonicalPage: "/canonical", priority: "primary" }],
);
assert.ok(!splitVisibility.some((item) => item.type === "no_visibility"), "all matching pages contribute to total target visibility");
assert.ok(!splitVisibility.some((item) => item.type === "cannibalization"), "sub-threshold pages do not count toward cannibalization");
assert.ok(detectSeoOpportunities([{ query: "boundary", page: "/a", clicks: 0, impressions: 9, position: 30 }], [], [{ keyword: "boundary", canonicalPage: "/", priority: "primary" }]).some((item) => item.type === "no_visibility"));
assert.ok(!detectSeoOpportunities([{ query: "boundary", page: "/a", clicks: 0, impressions: 10, position: 30 }], [], [{ keyword: "boundary", canonicalPage: "/", priority: "primary" }]).some((item) => item.type === "no_visibility"));
assert.ok(detectSeoOpportunities([{ query: "cannibal", page: "/a", clicks: 0, impressions: 10, position: 30 }, { query: "cannibal", page: "/b", clicks: 0, impressions: 10, position: 30 }], [], [{ keyword: "cannibal", canonicalPage: "/", priority: "primary" }]).some((item) => item.type === "cannibalization"));
assert.ok(!detectSeoOpportunities([], [], [{ keyword: "anonymized-or-absent", canonicalPage: "/", priority: "primary" }]).some((item) => item.type === "no_visibility"), "an absent query row is unknown, not affirmative zero visibility");

const missing = resolveSearchConsoleConfig({});
assert.equal(missing.configured, false);
assert.deepEqual(missing.missing, ["GSC_SITE_URL", "GSC_CLIENT_EMAIL", "GSC_PRIVATE_KEY"]);
await assert.rejects(() => fetchSearchPerformance({ startDate: "2026-01-01", endDate: "2026-01-02", startRow: 0, rowLimit: 1, env: {} }), SeoConfigurationError);

const configuredEnv = { GSC_SITE_URL: "sc-domain:example.com", GSC_CLIENT_EMAIL: "seo@example.test", GSC_PRIVATE_KEY: "fake-key" } as NodeJS.ProcessEnv;
const okResponse = () => new Response(JSON.stringify({ rows: [] }), { status: 200, headers: { "content-type": "application/json" } });
{
  let attempts = 0; const delays: number[] = [];
  const result = await fetchSearchPerformance({ startDate: "2026-01-01", endDate: "2026-01-01", startRow: 0, rowLimit: 1, env: configuredEnv, getAccessToken: async () => "token", sleepImpl: async (ms) => { delays.push(ms); }, fetchImpl: (async () => { attempts += 1; if (attempts === 1) throw new TypeError("fetch failed"); return okResponse(); }) as typeof fetch });
  assert.deepEqual(result.rows, []); assert.equal(attempts, 2); assert.deepEqual(delays, [500]);
}
{
  let attempts = 0; const delays: number[] = []; const finalCause = new TypeError("socket reset");
  let exhausted: unknown;
  try { await fetchSearchPerformance({ startDate: "2026-01-01", endDate: "2026-01-01", startRow: 0, rowLimit: 1, env: configuredEnv, getAccessToken: async () => "token", sleepImpl: async (ms) => { delays.push(ms); }, fetchImpl: (async () => { attempts += 1; throw finalCause; }) as typeof fetch }); } catch (error) { exhausted = error; }
  assert.ok(exhausted instanceof SearchConsoleError); assert.equal(attempts, 4); assert.deepEqual(delays, [500, 1_000, 2_000]); assert.equal(exhausted.code, "TRANSPORT_ERROR"); assert.equal(exhausted.cause, finalCause);
  assert.deepEqual(describeSeoSyncFailure(exhausted, 0), { status: "failed", errorCode: "TRANSPORT_ERROR", errorMessage: "Search Console transport or response body failed after 4 attempts" });
}
{
  let attempts = 0; const delays: number[] = []; const statuses = [429, 503, 200];
  await fetchSearchPerformance({ startDate: "2026-01-01", endDate: "2026-01-01", startRow: 0, rowLimit: 1, env: configuredEnv, getAccessToken: async () => "token", sleepImpl: async (ms) => { delays.push(ms); }, fetchImpl: (async () => { const status = statuses[attempts++]; return status === 200 ? okResponse() : new Response("retry", { status }); }) as typeof fetch });
  assert.equal(attempts, 3); assert.deepEqual(delays, [500, 1_000]);
}
{
  let attempts = 0; const delays: number[] = [];
  await assert.rejects(() => fetchSearchPerformance({ startDate: "2026-01-01", endDate: "2026-01-01", startRow: 0, rowLimit: 1, env: configuredEnv, getAccessToken: async () => "token", sleepImpl: async (ms) => { delays.push(ms); }, fetchImpl: (async () => { attempts += 1; return new Response("bad request", { status: 400 }); }) as typeof fetch }), (error: unknown) => error instanceof SearchConsoleError && error.status === 400);
  assert.equal(attempts, 1); assert.deepEqual(delays, []);
}
{
  let attempts = 0; const delays: number[] = [];
  await fetchSearchPerformance({ startDate: "2026-01-01", endDate: "2026-01-01", startRow: 0, rowLimit: 1, env: configuredEnv, getAccessToken: async () => "token", sleepImpl: async (ms) => { delays.push(ms); }, fetchImpl: (async () => { attempts += 1; return attempts === 1 ? { ok: true, status: 200, json: async () => { throw new TypeError("body stream reset"); } } as Response : okResponse(); }) as typeof fetch });
  assert.equal(attempts, 2); assert.deepEqual(delays, [500]);
}
{
  let attempts = 0; const delays: number[] = [];
  await fetchSearchPerformance({ startDate: "2026-01-01", endDate: "2026-01-01", startRow: 0, rowLimit: 1, env: configuredEnv, getAccessToken: async () => "token", sleepImpl: async (ms) => { delays.push(ms); }, fetchImpl: (async () => { attempts += 1; return attempts === 1 ? { ok: false, status: 503, text: async () => { throw new TypeError("error body reset"); } } as Response : okResponse(); }) as typeof fetch });
  assert.equal(attempts, 2); assert.deepEqual(delays, [500]);
}
{
  let attempts = 0; const causes: TypeError[] = [];
  let exhausted: unknown;
  try { await fetchSearchPerformance({ startDate: "2026-01-01", endDate: "2026-01-01", startRow: 0, rowLimit: 1, env: configuredEnv, getAccessToken: async () => "token", sleepImpl: async () => {}, fetchImpl: (async () => { attempts += 1; const cause = new TypeError(`body failure ${attempts}`); causes.push(cause); return { ok: true, status: 200, json: async () => { throw cause; } } as Response; }) as typeof fetch }); } catch (error) { exhausted = error; }
  assert.ok(exhausted instanceof SearchConsoleError); assert.equal(attempts, 4); assert.equal(exhausted.cause, causes[3]);
}

assert.equal(normalizeSearchConsoleProperty(" SC-DOMAIN:Example.COM "), "sc-domain:example.com");
assert.equal(normalizeSearchConsoleProperty("https://example.com"), "https://example.com/");

const routes = readFileSync("server/routes/seoIntelligence.ts", "utf8");
assert.match(routes, /app\.get\([^\n]+requireAdmin/);
assert.match(routes, /app\.post\([^\n]+requireAdmin/);
const migration = readFileSync("migrations/0093_seo_intelligence.sql", "utf8");
assert.match(migration, /UNIQUE INDEX[^;]+property_id, reporting_date, query, page/i, "property-scoped natural key makes re-imports idempotent");
assert.match(migration, /seo_search_daily_totals_property_date_uidx[^;]+property_id, reporting_date/i);
const service = readFileSync("server/seo/seoService.ts", "utf8");
assert.match(service, /onConflictDoUpdate/, "imports upsert duplicates");
assert.match(service, /describeSeoSyncFailure\(error, rowsImported\)/, "failed and partial diagnostics are derived before persistence");
assert.match(service, /set\(\{ \.\.\.failure, rowsImported, pagesCompleted, completedAt:/, "sync failure diagnostics and progress are persisted");
assert.match(service, /rowsImported < SEO_SEARCH_CONSOLE_MAX_ROWS/, "pagination is globally bounded");
assert.match(service, /recentFirstReportingDates\(startDate, endDate\)/, "capped imports query newest reporting dates first");
assert.match(service, /snapshotInsertBatches\(rows\)/, "upserts use parameter-safe batches");
assert.match(service, /truncationCode = "DAILY_ROW_CAP_TRUNCATED"/, "daily ceiling persists an explicit truncated diagnostic");
assert.match(service, /errorCode: truncationCode/, "capped imports persist the selected truncation diagnostic");
assert.match(service, /status: "partial"/, "full capped imports cannot be recorded as successful");
assert.match(service, /averageSeoPosition\(numberValue\(totals\.current_position_weighted\), currentImpressions\)/, "service returns unavailable position without impressions");
assert.doesNotMatch(service, /db\.select\(\)\.from\(seoSearchSnapshots\)/, "dashboard never materializes the raw 56-day window");
assert.match(service, /LIMIT \$\{SEO_DASHBOARD_CANDIDATE_LIMIT\}/, "opportunity candidates are bounded in PostgreSQL");
assert.match(service, /ORDER BY priority_evidence DESC LIMIT/, "database bounds candidates only after evidence-priority ordering");
assert.match(service, /SEO_DECLINE_RETAINED_RATIO/, "SQL candidate eligibility uses the detector's shared decline threshold");
assert.match(service, /previous_clicks > 0 AND current_clicks <= previous_clicks/, "SQL click decline requires a positive baseline");
assert.match(service, /LIMIT 10/, "top query and page lists are bounded in PostgreSQL");
assert.match(service, /FROM seo_search_daily_totals WHERE property_id = \$\{propertyId\} AND reporting_date BETWEEN/, "aggregate cards use only current-property daily totals");
assert.match(service, /fetchSearchDailyTotals\(startDate, endDate\)/, "sync imports aggregate totals separately from query details");
assert.match(service, /orderBy\(desc\(seoSyncRuns\.startedAt\)\)\.limit\(1\)/, "dashboard reload fetches the newest persisted run regardless of status");
assert.match(service, /latestSync: serializeSeoSyncRun\(latestRun\)/);
assert.match(service, /values\(\{ propertyId, trigger, startDate, endDate \}\)/, "sync diagnostics are property scoped");
assert.match(service, /target: \[seoSearchSnapshots\.propertyId, seoSearchSnapshots\.reportingDate, seoSearchSnapshots\.query, seoSearchSnapshots\.page\]/);
assert.match(service, /target: \[seoSearchDailyTotals\.propertyId, seoSearchDailyTotals\.reportingDate\]/);
assert.ok((service.match(/property_id = \$\{propertyId\}/g) ?? []).length >= 5, "totals, detail, comparison, opportunity, and target queries filter property");
assert.match(service, /where\(eq\(seoSyncRuns\.propertyId, propertyId\)\)/, "latest run is isolated to selected property");
const ui = readFileSync("client/src/components/admin/AdminSeoIntelligenceTab.tsx", "utf8");
assert.match(ui, /d\.period\.position === null \? "—"/);
assert.match(ui, /sync\.data\.status === "partial"/);
assert.match(ui, /Detailed query reports exclude anonymized queries; aggregate cards above include them/);
assert.match(ui, /Latest sync:/);
assert.match(ui, /d\.latestSync\.status === "partial" \|\| d\.latestSync\.status === "failed"/);
const searchConsole = readFileSync("server/seo/searchConsole.ts", "utf8");
assert.match(searchConsole, /dimensions: \["date"\]/, "daily totals omit the query dimension");
const startup = readFileSync("server/startupSchemaPatches.ts", "utf8");
assert.match(startup, /tag: "0093_seo_intelligence"/);
assert.match(startup, /seoIntelligencePatchOk: patchResults\.get\("0093_seo_intelligence"\) === true/);
const patchStart = startup.indexOf('tag: "0093_seo_intelligence"');
const patchEnd = startup.indexOf('].join(";\\n"),', patchStart);
const patchStatements = (startup.slice(patchStart, patchEnd).match(/`[^`]+`/g) ?? []).map((value) => value.slice(1, -1)).join(";\n");
const normalizeSql = (sql: string) => sql.split(";").map((statement) => statement.replace(/\s+/g, " ").trim().toLowerCase()).filter(Boolean);
assert.deepEqual(normalizeSql(patchStatements), normalizeSql(migration), "standalone migration and Railway startup patch stay in parity");
const index = readFileSync("server/index.ts", "utf8");
assert.match(index, /if \(!schemaPatches\.seoIntelligencePatchOk\)/, "startup fails closed before listen/workers");
const cron = readFileSync("server/cron.ts", "utf8");
assert.match(cron, /utcMin >= 20 && utcMin <= 25/, "scheduled failures have a bounded same-day retry window");
assert.match(cron, /if \(shouldMarkScheduledSeoSyncComplete\(result\.status\)\) lastSeoSyncDay = seoDay/, "only successful scheduled sync blocks another daily attempt");
console.log("seo-intelligence.test.ts: all assertions passed");
