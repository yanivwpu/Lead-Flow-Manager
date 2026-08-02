/**
 * Workspace isolation, request-path cost, and log/response safety.
 *
 * Covers requirements 21 (no cross-workspace retrieval) and 22 (no LLM call on Inbox
 * render), plus the section 11 rules about what may leave the server.
 *
 * These are source-level assertions: a missing `userId` filter is a data-leak bug that a
 * behavioural test with one workspace would never catch.
 *
 * Run: npx tsx tests/knowledge-isolation.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

const REPO = process.cwd();
const read = (p: string) => readFileSync(join(REPO, p), "utf8");

const STORES = [
  "server/websiteKnowledge/factStore.ts",
  "server/websiteKnowledge/sourceStore.ts",
  "server/websiteKnowledge/scanJobService.ts",
  "server/websiteKnowledge/publishFacts.ts",
];

// --- 21. Cross-workspace isolation --------------------------------------------

/**
 * Functions allowed to touch the tables without a userId of their own. Each one either
 * operates on a job row that already carries its user, or acts on the worker's lease.
 */
const UNSCOPED_BY_DESIGN = new Set([
  "claimNextScanJob",
  "recoverStaleScanJobs",
  "failScanJob",
  "processScanJob",
  "publishKnowledgeFacts",
]);

function splitTopLevelFunctions(src: string): Array<{ name: string; body: string }> {
  const out: Array<{ name: string; body: string }> = [];
  const re = /export (?:async )?function (\w+)/g;
  let match: RegExpExecArray | null;
  const starts: Array<{ name: string; index: number }> = [];
  while ((match = re.exec(src)) !== null) {
    starts.push({ name: match[1], index: match.index });
  }
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].index : src.length;
    out.push({ name: starts[i].name, body: src.slice(starts[i].index, end) });
  }
  return out;
}

run("every fact and source query is scoped to one workspace", () => {
  for (const path of STORES) {
    const src = read(path);
    for (const fn of splitTopLevelFunctions(src)) {
      if (!/\b(?:db|tx)\s*\n?\s*\./.test(fn.body)) continue;
      if (UNSCOPED_BY_DESIGN.has(fn.name)) continue;

      assert.ok(
        /\buserId: string\b/.test(fn.body),
        `${path}:${fn.name} queries the database without taking a userId`,
      );
      const scoped =
        /eq\(\w+\.userId,\s*userId\)/.test(fn.body) ||
        /userId: string[\s\S]*?userId,/.test(fn.body);
      assert.ok(scoped, `${path}:${fn.name} does not filter on userId`);
    }
  }
});

run("every live-fact transaction scopes each statement to the acting user", () => {
  const src = read("server/websiteKnowledge/publishFacts.ts");

  // Both functions mutate the published set, so both must be audited — not just publish.
  for (const name of ["publishKnowledgeFacts", "removeKnowledgeFact", "rebuildLegacySummary"]) {
    const start = src.indexOf(`function ${name}(`);
    assert.ok(start > 0, `${name} not found`);
    const nextFn = src.indexOf("\nexport ", start + 10);
    const body = src.slice(start, nextFn === -1 ? undefined : nextFn);

    const statements = body.match(/\.where\(/g) ?? [];
    const scopedByUser = body.match(/eq\(\w+\.userId,\s*userId\)/g) ?? [];
    // A primary key is acceptable only for a row already loaded under the user filter.
    const byLoadedId = body.match(/eq\(businessKnowledgeFacts\.id, (?:current|draft)\.id\)/g) ?? [];
    assert.ok(statements.length > 0, `${name} issues no queries`);
    assert.equal(
      statements.length,
      scopedByUser.length + byLoadedId.length,
      `${name}: every statement must be scoped by userId or by an id loaded under that filter`,
    );
  }
});

run("the only unscoped queries are the worker's own job claim and lease recovery", () => {
  const src = read("server/websiteKnowledge/scanJobService.ts");
  // Claiming picks any workspace's job by design; it then processes only that job's user.
  assert.ok(/FOR UPDATE SKIP LOCKED/.test(src));
  assert.ok(/const userId = job\.userId/.test(src));
  assert.ok(
    /getKnowledgeSourcesByIds\(userId, \[sourceId\]\)/.test(src),
    "the worker must re-scope every read to the job's own user",
  );
  assert.ok(/listLiveFacts\(userId\)/.test(src));
});

run("every knowledge route resolves the user from the session, never the request body", () => {
  const src = read("server/websiteKnowledge/knowledgeRoutes.ts");
  const handlers = src.split(/app\.(?:get|post|delete|patch)\(/).slice(1);
  assert.ok(handlers.length >= 9, `expected the full route set, found ${handlers.length}`);
  for (const handler of handlers) {
    const head = handler.slice(0, 1200);
    assert.ok(/await guard\(req, res\)/.test(head), `route without the auth guard: ${head.slice(0, 60)}`);
    assert.ok(
      !/body\.(userId|workspaceId)/.test(head),
      "a route must never take the workspace from the request body",
    );
  }
  assert.ok(/if \(!req\.user\)/.test(src));
  assert.ok(/requireAiBrainPremium/.test(src));
});

run("the review payload exposes values and excerpts, never page bodies", () => {
  const src = read("shared/knowledgeReview.ts");
  assert.ok(!/rawHtml|pageText|\bbody\b/.test(src));
  assert.ok(/excerpt: fact\.excerpt/.test(src));

  const routes = read("server/websiteKnowledge/knowledgeRoutes.ts");
  assert.ok(!/rawHtml/.test(routes), "raw HTML must stay server-side");
});

run("added source URLs are validated against the scraper's public-URL policy", () => {
  const src = read("server/websiteKnowledge/knowledgeRoutes.ts");
  assert.ok(/assertSafePublicHttpUrl\(url\)/.test(src));
});

run("scan and extraction logs carry no scraped content", () => {
  for (const path of [
    "server/websiteKnowledge/extractFactsAi.ts",
    "server/websiteKnowledge/scanPipeline.ts",
    "server/websiteKnowledge/scanJobWorker.ts",
  ]) {
    const src = read(path);
    for (const line of src.split("\n")) {
      if (!/console\.(log|info|warn|error)/.test(line)) continue;
      assert.ok(
        !/page\.text|rawHtml|content\b|candidate\.data|\bexcerpt\b/.test(line),
        `log may leak scraped content in ${path}: ${line.trim()}`,
      );
    }
  }
});

run("the reply path logs violation kinds, not the draft or the facts", () => {
  const src = read("server/aiService.ts");
  const idx = src.indexOf("reply failed fact grounding");
  assert.ok(idx > 0);
  const statement = src.slice(idx, src.indexOf("});", idx));
  assert.ok(/violations: groundingCheck\.violations\.map\(\(v\) => v\.kind\)/.test(statement));
  assert.ok(
    !/\b(draft|suggestion|rawReply)\b/.test(statement),
    "the log must not carry the reply text",
  );
});

// --- 22. No model call on the Inbox render path -------------------------------

run("assembling Workspace Intelligence makes no model call", () => {
  const shared = read("shared/workspaceIntelligence.ts");
  assert.ok(!/aiProvider|openai|complete\(/i.test(shared));

  const service = read("server/workspaceIntelligenceService.ts");
  assert.ok(!/aiProvider|openai/i.test(service));
  assert.ok(/No LLM calls/.test(service), "the no-LLM contract should stay documented");
});

run("the snapshot path reads facts from the database, never from an extractor", () => {
  const service = read("server/workspaceIntelligenceService.ts");
  assert.ok(/listPublishedFacts\(userId\)/.test(service));
  assert.ok(!/extractFactsWithAi|scanSourceIntoDrafts/.test(service));
});

run("retrieval and grounding are pure shared modules with no I/O", () => {
  for (const path of ["shared/knowledgeRetrieval.ts", "shared/factGrounding.ts"]) {
    const src = read(path);
    assert.ok(!/aiProvider|fetch\(|drizzle|from "\.\.\/server/.test(src), `${path} must stay pure`);
  }
});

run("published facts are cached so a reply does not rescan the table each turn", () => {
  const src = read("server/websiteKnowledge/factContext.ts");
  assert.ok(/CACHE_TTL_MS/.test(src));
  assert.ok(/export function invalidatePublishedFactsCache/.test(src));
});

// --- Feature flag / rollback --------------------------------------------------

run("the V2 surface has a kill switch and a per-workspace flag", () => {
  // Detailed rollback behaviour lives in tests/knowledge-rollback-safety.test.ts.
  const flags = read("server/websiteKnowledge/knowledgeFlags.ts");
  assert.ok(/AI_BRAIN_FACTS_DISABLED/.test(flags));
  const routes = read("server/websiteKnowledge/knowledgeRoutes.ts");
  assert.ok(/knowledgeFactsDisabled\(\)/.test(routes), "the API must respect the kill switch");

  const schema = read("shared/schema.ts");
  assert.ok(/knowledgeV2Enabled/.test(schema));

  const migration = read("migrations/0073_ai_brain_structured_facts.sql");
  assert.ok(/IF NOT EXISTS/i.test(migration), "the migration must be re-runnable");
  assert.ok(!/DROP TABLE|DROP COLUMN/i.test(migration), "the migration must be additive only");
});

run("the migration is registered as a startup patch", () => {
  const patches = read("server/startupSchemaPatches.ts");
  assert.ok(/0073_ai_brain_structured_facts/.test(patches));
});

console.log("\nAll knowledge isolation tests passed.");
