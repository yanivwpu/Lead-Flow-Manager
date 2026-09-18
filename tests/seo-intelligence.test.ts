/** Run: npx tsx tests/seo-intelligence.test.ts */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectSeoOpportunities } from "../server/seo/opportunities";
import { resolveSearchConsoleConfig, SeoConfigurationError, fetchSearchPerformance } from "../server/seo/searchConsole";
import { SEO_SEARCH_CONSOLE_MAX_ROWS, SEO_SEARCH_CONSOLE_PAGE_SIZE, SEO_SNAPSHOT_INSERT_BATCH_SIZE, searchConsoleImportIsTruncated, snapshotInsertBatches } from "../server/seo/snapshotBatches";
import { averagePositionImprovementPercent, averageSeoPosition, formatSeoPercent } from "../shared/seoMetrics";

const current = [
  { query: "whatsapp crm", page: "https://www.whachatcrm.com/", clicks: 5, impressions: 500, position: 8 },
  { query: "whatsapp crm", page: "https://www.whachatcrm.com/pricing", clicks: 2, impressions: 200, position: 11 },
  { query: "falling", page: "https://www.whachatcrm.com/a", clicks: 10, impressions: 100, position: 12 },
];
const previous = [{ query: "falling", page: "https://www.whachatcrm.com/a", clicks: 30, impressions: 300, position: 7 }];
const opportunities = detectSeoOpportunities(current, previous, [
  { keyword: "whatsapp crm", canonicalPage: "https://www.whachatcrm.com", priority: "primary" },
  { keyword: "missing target", canonicalPage: "https://www.whachatcrm.com/missing", priority: "primary" },
]);
for (const type of ["striking_distance", "decline", "low_ctr", "cannibalization", "no_visibility"]) assert.ok(opportunities.some((o) => o.type === type), `classifies ${type}`);
assert.equal(opportunities.find((o) => o.type === "decline")?.evidence.previousClicks, 30, "preceding-period comparison is retained");

const disappeared = detectSeoOpportunities([], [{ query: "vanished", page: "/old", clicks: 25, impressions: 250, position: 6 }], []);
assert.deepEqual(disappeared[0]?.evidence, { clicks: 0, previousClicks: 25, impressions: 0, previousImpressions: 250, position: 0, previousPosition: 6 });

const oversized = Array.from({ length: SEO_SNAPSHOT_INSERT_BATCH_SIZE * 2 + 17 }, (_, id) => ({ id }));
const batches = snapshotInsertBatches(oversized);
assert.deepEqual(batches.map((batch) => batch.length), [5_000, 5_000, 17]);
assert.deepEqual(batches.flat(), oversized, "batching neither drops nor duplicates rows");

assert.equal(averagePositionImprovementPercent(5, 10), 50, "10 to 5 is a positive 50% improvement");
assert.equal(averagePositionImprovementPercent(15, 10), -50, "10 to 15 is a negative 50% deterioration");
assert.equal(averageSeoPosition(0, 0), null, "no current impressions means average position is unavailable");
assert.equal(averagePositionImprovementPercent(null, 10), null, "missing current position is not a 100% improvement");
assert.equal(formatSeoPercent(averagePositionImprovementPercent(null, 10)), "—");

assert.equal(searchConsoleImportIsTruncated(SEO_SEARCH_CONSOLE_MAX_ROWS - SEO_SEARCH_CONSOLE_PAGE_SIZE, SEO_SEARCH_CONSOLE_PAGE_SIZE), true, "a full final capped page is truncated");
assert.equal(searchConsoleImportIsTruncated(SEO_SEARCH_CONSOLE_MAX_ROWS - SEO_SEARCH_CONSOLE_PAGE_SIZE, SEO_SEARCH_CONSOLE_PAGE_SIZE - 1), false);

const rankingOnlyDecline = detectSeoOpportunities(
  [{ query: "growing traffic worse rank", page: "/growth", clicks: 40, impressions: 400, position: 12 }],
  [{ query: "growing traffic worse rank", page: "/growth", clicks: 20, impressions: 200, position: 8 }],
  [],
).find((item) => item.type === "decline");
assert.ok(rankingOnlyDecline);
assert.equal(rankingOnlyDecline.priority, 0, "ranking decline priority is clamped when traffic grew");

const missing = resolveSearchConsoleConfig({});
assert.equal(missing.configured, false);
assert.deepEqual(missing.missing, ["GSC_SITE_URL", "GSC_CLIENT_EMAIL", "GSC_PRIVATE_KEY"]);
await assert.rejects(() => fetchSearchPerformance({ startDate: "2026-01-01", endDate: "2026-01-02", startRow: 0, rowLimit: 1, env: {} }), SeoConfigurationError);

const routes = readFileSync("server/routes/seoIntelligence.ts", "utf8");
assert.match(routes, /app\.get\([^\n]+requireAdmin/);
assert.match(routes, /app\.post\([^\n]+requireAdmin/);
const migration = readFileSync("migrations/0093_seo_intelligence.sql", "utf8");
assert.match(migration, /UNIQUE INDEX[^;]+reporting_date, query, page/i, "natural key makes re-imports idempotent");
const service = readFileSync("server/seo/seoService.ts", "utf8");
assert.match(service, /onConflictDoUpdate/, "imports upsert duplicates");
assert.match(service, /status: rowsImported \? "partial" : "failed"/, "partial failure is persisted");
assert.match(service, /startRow < SEO_SEARCH_CONSOLE_MAX_ROWS/, "pagination is bounded");
assert.match(service, /snapshotInsertBatches\(rows\)/, "upserts use parameter-safe batches");
assert.match(service, /errorCode: "ROW_CAP_TRUNCATED"/, "full capped imports persist an explicit truncated diagnostic");
assert.match(service, /status: "partial"/, "full capped imports cannot be recorded as successful");
assert.match(service, /averageSeoPosition\(totals\.positionWeighted, totals\.impressions\)/, "service returns unavailable position without impressions");
const ui = readFileSync("client/src/components/admin/AdminSeoIntelligenceTab.tsx", "utf8");
assert.match(ui, /d\.period\.position === null \? "—"/);
assert.match(ui, /sync\.data\.status === "partial"/);
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
console.log("seo-intelligence.test.ts: all assertions passed");
