/** Run: npx tsx tests/seo-intelligence.test.ts */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectSeoOpportunities } from "../server/seo/opportunities";
import { resolveSearchConsoleConfig, SeoConfigurationError, fetchSearchPerformance } from "../server/seo/searchConsole";

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
assert.match(service, /startRow < 500_000/, "pagination is bounded");
console.log("seo-intelligence.test.ts: all assertions passed");
