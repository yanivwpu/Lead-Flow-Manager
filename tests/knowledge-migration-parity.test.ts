/**
 * Migration 0073 and its startup patch must stay identical in effect.
 *
 * Railway boots from the startup patch, while a fresh database is built from the .sql file.
 * If the two drift, production and a new environment end up with different tables — the
 * kind of difference that only shows up as a runtime error weeks later.
 *
 * Run: npx tsx tests/knowledge-migration-parity.test.ts
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
const TAG = "0073_ai_brain_structured_facts";

const migrationSql = readFileSync(join(REPO, `migrations/${TAG}.sql`), "utf8");
const patchesSrc = readFileSync(join(REPO, "server/startupSchemaPatches.ts"), "utf8");

/** Strip comments, collapse whitespace, drop trailing semicolons. */
function normalizeStatements(sql: string): string[] {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim().toLowerCase())
    .filter(Boolean);
}

function startupPatchSql(tag: string): string {
  const start = patchesSrc.indexOf(`tag: "${tag}"`);
  assert.ok(start > 0, `startup patch ${tag} not found`);
  const end = patchesSrc.indexOf('].join(";\\n"),', start);
  assert.ok(end > start, `startup patch ${tag} is not the expected array form`);
  const body = patchesSrc.slice(start, end);
  // Statements are backtick template literals in an array.
  const statements = body.match(/`[^`]+`/g) ?? [];
  return statements.map((s) => s.slice(1, -1)).join(";\n");
}

run("the startup patch is registered under the migration's tag", () => {
  assert.ok(patchesSrc.includes(`tag: "${TAG}"`));
});

run("migration 0073 and the startup patch issue the same statements", () => {
  const fromFile = normalizeStatements(migrationSql);
  const fromPatch = normalizeStatements(startupPatchSql(TAG));
  assert.deepEqual(
    fromPatch,
    fromFile,
    "the startup patch and the migration file have drifted apart",
  );
});

run("every statement is re-runnable", () => {
  for (const statement of normalizeStatements(migrationSql)) {
    const idempotent =
      statement.includes("if not exists") || statement.startsWith("create or replace");
    assert.ok(idempotent, `statement is not re-runnable: ${statement.slice(0, 90)}`);
  }
});

run("the migration is additive: nothing is dropped, renamed, or retyped", () => {
  const forbidden = [
    /\bdrop\s+table\b/i,
    /\bdrop\s+column\b/i,
    /\bdrop\s+index\b/i,
    /\bdrop\s+constraint\b/i,
    /\brename\s+to\b/i,
    /\brename\s+column\b/i,
    /\balter\s+column\b/i,
    /\btruncate\b/i,
    /\bdelete\s+from\b/i,
    /\bupdate\s+\w+\s+set\b/i,
  ];
  for (const pattern of forbidden) {
    assert.ok(!pattern.test(migrationSql), `migration contains a destructive statement: ${pattern}`);
    assert.ok(
      !pattern.test(startupPatchSql(TAG)),
      `startup patch contains a destructive statement: ${pattern}`,
    );
  }
});

run("only the two new columns touch the existing ai_business_knowledge table", () => {
  const alters = normalizeStatements(migrationSql).filter((s) => s.startsWith("alter table"));
  assert.equal(alters.length, 2);
  for (const alter of alters) {
    assert.ok(alter.startsWith("alter table ai_business_knowledge add column if not exists"));
  }
  // Both are defaulted, so existing rows are backfilled by Postgres rather than left null.
  assert.ok(alters.every((a) => a.includes("default")));
});

run("every new table is workspace-scoped with a cascading user reference", () => {
  const tables = ["ai_website_knowledge_sources", "business_knowledge_facts", "ai_knowledge_scan_jobs"];
  for (const table of tables) {
    const create = normalizeStatements(migrationSql).find((s) =>
      s.startsWith(`create table if not exists ${table}`),
    );
    assert.ok(create, `missing create statement for ${table}`);
    assert.ok(
      create!.includes("user_id varchar not null references users(id) on delete cascade"),
      `${table} is not scoped to a cascading user_id`,
    );
  }
});

run("every index on the new tables leads with user_id, except the worker's claim index", () => {
  const indexes = normalizeStatements(migrationSql).filter((s) => s.includes("create") && s.includes("index"));
  assert.ok(indexes.length >= 7);
  for (const index of indexes) {
    if (index.includes("ai_knowledge_scan_jobs_claim_idx")) continue; // worker scans all workspaces
    assert.ok(
      /\(\s*user_id/.test(index),
      `index does not lead with user_id: ${index.slice(0, 90)}`,
    );
  }
});

run("a fact key can hold at most one live draft and one live published row", () => {
  const unique = normalizeStatements(migrationSql).find((s) =>
    s.includes("business_knowledge_facts_user_key_state_live_idx"),
  );
  assert.ok(unique, "the live-state unique index is missing");
  assert.ok(unique!.includes("unique index"));
  assert.ok(unique!.includes("(user_id, fact_key, state)"));
  assert.ok(unique!.includes("where state in ('draft', 'published')"));
});

run("facts survive their source being deleted", () => {
  const facts = normalizeStatements(migrationSql).find((s) =>
    s.startsWith("create table if not exists business_knowledge_facts"),
  );
  assert.ok(
    facts!.includes("source_id varchar references ai_website_knowledge_sources(id) on delete set null"),
    "deleting a source must null the link, never cascade the fact away",
  );
});

console.log("\nAll migration parity tests passed.");
