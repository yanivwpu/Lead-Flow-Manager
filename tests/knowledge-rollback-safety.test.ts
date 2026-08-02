/**
 * Pre-deployment safety: rollback, scan durability, and audit-safe removal.
 *
 * The properties here are the ones that decide whether a bad day is recoverable. The flag
 * module is exercised directly; the wiring around it is asserted against source, because
 * "the reply path forgot to check the flag" is exactly the bug that a single-workspace
 * behavioural test cannot see.
 *
 * Run: npx tsx tests/knowledge-rollback-safety.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  knowledgeFactsActiveForWorkspace,
  knowledgeFactsDisabled,
} from "../server/websiteKnowledge/knowledgeFlags";

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

function withEnv(value: string | undefined, fn: () => void) {
  const previous = process.env.AI_BRAIN_FACTS_DISABLED;
  if (value === undefined) delete process.env.AI_BRAIN_FACTS_DISABLED;
  else process.env.AI_BRAIN_FACTS_DISABLED = value;
  try {
    fn();
  } finally {
    if (previous === undefined) delete process.env.AI_BRAIN_FACTS_DISABLED;
    else process.env.AI_BRAIN_FACTS_DISABLED = previous;
  }
}

// --- 2. Feature-flag rollback ---------------------------------------------------

run("the kill switch is read at the point of use, not cached at boot", () => {
  withEnv(undefined, () => assert.equal(knowledgeFactsDisabled(), false));
  withEnv("true", () => assert.equal(knowledgeFactsDisabled(), true));
  withEnv("TRUE", () => assert.equal(knowledgeFactsDisabled(), true));
  withEnv("false", () => assert.equal(knowledgeFactsDisabled(), false));
  withEnv("", () => assert.equal(knowledgeFactsDisabled(), false));
});

run("the kill switch overrides a workspace that has published", () => {
  const published = { knowledgeV2Enabled: true };
  withEnv(undefined, () => assert.equal(knowledgeFactsActiveForWorkspace(published), true));
  withEnv("true", () => assert.equal(knowledgeFactsActiveForWorkspace(published), false));
});

run("a workspace that never published consumes no facts", () => {
  withEnv(undefined, () => {
    assert.equal(knowledgeFactsActiveForWorkspace({ knowledgeV2Enabled: false }), false);
    assert.equal(knowledgeFactsActiveForWorkspace({}), false);
    assert.equal(knowledgeFactsActiveForWorkspace(null), false);
    assert.equal(knowledgeFactsActiveForWorkspace(undefined), false);
    // A truthy non-boolean must not be mistaken for consent.
    assert.equal(knowledgeFactsActiveForWorkspace({ knowledgeV2Enabled: "true" }), false);
    assert.equal(knowledgeFactsActiveForWorkspace({ knowledgeV2Enabled: 1 }), false);
  });
});

run("clearing the workspace flag reverts that workspace on its own", () => {
  withEnv(undefined, () => {
    assert.equal(knowledgeFactsActiveForWorkspace({ knowledgeV2Enabled: true }), true);
    assert.equal(knowledgeFactsActiveForWorkspace({ knowledgeV2Enabled: false }), false);
  });
});

run("the reply path gates fact retrieval on both switches", () => {
  const ctx = read("server/websiteKnowledge/factContext.ts");
  assert.ok(
    /knowledgeFactsActiveForWorkspace\(params\.knowledgeRow\)/.test(ctx),
    "buildTurnGrounding must consult the flags",
  );
  // The gate has to precede the query, or a rolled-back workspace still reads facts.
  const gateAt = ctx.indexOf("knowledgeFactsActiveForWorkspace");
  const queryAt = ctx.indexOf("getPublishedFactsCached(params.userId");
  assert.ok(gateAt > 0 && queryAt > gateAt, "the flag must be checked before facts are read");

  const ai = read("server/aiService.ts");
  assert.ok(
    /buildTurnGrounding\(\{[\s\S]{0,240}knowledgeRow: businessKnowledge/.test(ai),
    "suggestReply must pass the workspace row so the flag can be read",
  );
});

run("Workspace Intelligence honours both switches too", () => {
  const svc = read("server/workspaceIntelligenceService.ts");
  assert.ok(
    /knowledgeFactsDisabled\(\)[\s\S]{0,80}Promise\.resolve\(\[\]\)/.test(svc),
    "a disabled deployment must not query facts at all",
  );
  assert.ok(
    /publishedFacts: knowledgeFactsActiveForWorkspace\(knowledge\) \? publishedFacts : \[\]/.test(svc),
    "a rolled-back workspace must assemble from V1 inputs only",
  );
});

run("one flag module serves every consumer", () => {
  const routes = read("server/websiteKnowledge/knowledgeRoutes.ts");
  assert.ok(
    /import \{ knowledgeFactsDisabled \} from "\.\/knowledgeFlags"/.test(routes),
    "routes must share the flag definition rather than re-implement it",
  );
  assert.ok(
    !/AI_BRAIN_FACTS_DISABLED/.test(routes),
    "the env var must be read in exactly one place",
  );
  const flags = read("server/websiteKnowledge/knowledgeFlags.ts");
  assert.equal((flags.match(/process\.env\.AI_BRAIN_FACTS_DISABLED/g) ?? []).length, 1);
});

// --- 3. Scan safety -------------------------------------------------------------

run("a second scan for the same workspace joins the job already in flight", () => {
  const src = read("server/websiteKnowledge/scanJobService.ts");
  assert.ok(/export async function getActiveScanJob/.test(src));
  assert.ok(
    /const active = await getActiveScanJob\(userId\);\s*\n\s*if \(active\) return active;/.test(src),
    "createScanJob must return the in-flight job instead of enqueuing a rival",
  );
  const active = src.slice(src.indexOf("getActiveScanJob"), src.indexOf("createScanJob"));
  assert.ok(/eq\(aiKnowledgeScanJobs\.userId, userId\)/.test(active), "scoped to one workspace");
  assert.ok(/inArray\(aiKnowledgeScanJobs\.status, \["pending", "running"\]\)/.test(active));
});

run("a recovered job resumes instead of rescanning every source", () => {
  const src = read("server/websiteKnowledge/scanJobService.ts");
  assert.ok(
    /if \(items\[sourceId\]\?\.finishedAt\) \{\s*\n\s*processed \+= 1;\s*\n\s*continue;/.test(src),
    "sources with a recorded result must be skipped on a second pass",
  );
  assert.ok(
    /let factsProposed = job\.factsProposed \?\? 0;/.test(src),
    "the resumed job must continue its count rather than restart it",
  );
});

run("one failing source cannot take down the rest of the job", () => {
  const src = read("server/websiteKnowledge/scanJobService.ts");
  const loop = src.slice(src.indexOf("for (const sourceId of sourceIds)"));
  assert.ok(/\n    try \{/.test(loop), "each source is processed in its own try block");
  assert.ok(
    /\} catch \(err\) \{[\s\S]{0,600}status: "failed"/.test(loop),
    "a thrown source must be recorded as failed, not left scanning",
  );
  assert.ok(
    /processed \+= 1;\s*\n\s*\n\s*await db/.test(loop),
    "progress advances past a failed source so the job can finish",
  );
});

run("a scan writes drafts and never touches a published value", () => {
  const store = read("server/websiteKnowledge/factStore.ts");
  const applyStart = store.indexOf("export async function applyMergeOperations");
  const apply = store.slice(applyStart, store.indexOf("\nexport ", applyStart + 10));

  // Every insert a scan performs is a draft.
  for (const insert of apply.match(/\.insert\(businessKnowledgeFacts\)\.values\(\{[\s\S]*?\}\);/g) ?? []) {
    assert.ok(/state: "draft"/.test(insert), "a merge operation inserted a non-draft row");
  }
  // The only update touches verification metadata, never the value or the state.
  const touch = apply.slice(apply.indexOf('case "touch_verified"'), apply.indexOf('case "propose_retire"'));
  assert.ok(/lastVerifiedAt/.test(touch) && /provenance/.test(touch));
  assert.ok(!/\bdata:/.test(touch), "a scan must not rewrite a published value");
  assert.ok(!/state:/.test(touch), "a scan must not change a published state");

  // Retirement is proposed, not performed.
  const retire = apply.slice(apply.indexOf('case "propose_retire"'), apply.indexOf('case "discard_draft"'));
  assert.ok(/proposedAction: "retire"/.test(retire) && /state: "draft"/.test(retire));
  assert.ok(!/state: "retired"/.test(retire), "only publish may retire a live fact");
});

run("a failed source keeps its previous content hash and its published facts", () => {
  const src = read("server/websiteKnowledge/sourceStore.ts");
  const outcome = src.slice(src.indexOf("export async function recordSourceScanOutcome"));
  assert.ok(
    /if \(outcome\.contentHash !== undefined\) patch\.contentHash = outcome\.contentHash;/.test(outcome),
    "a failure must not blank the hash that proves what was last read",
  );
  // Nothing in the source store may delete a fact.
  assert.ok(!/businessKnowledgeFacts/.test(src), "the source store must not reach into facts");
});

// --- 4 & 7. Publish and removal stay in sync ------------------------------------

run("every published-set change rebuilds the prose summary in the same transaction", () => {
  const src = read("server/websiteKnowledge/publishFacts.ts");
  assert.ok(/async function rebuildLegacySummary\(/.test(src));
  // Both mutating paths call it, and both pass the transaction rather than the pool.
  const calls = src.match(/rebuildLegacySummary\(tx, userId, now/g) ?? [];
  assert.equal(calls.length, 2, "publish and removal must both rebuild the summary");
  assert.ok(
    /\.\.\.\(summary \? \{ websiteKnowledgeSummary: summary \} : \{\}\)/.test(src),
    "an empty fact set must leave the existing V1 summary in place",
  );
});

run("removing a published fact retires it rather than deleting the record", () => {
  const src = read("server/websiteKnowledge/publishFacts.ts");
  const remove = src.slice(src.indexOf("export async function removeKnowledgeFact"));
  assert.ok(/state: "retired"/.test(remove));
  assert.ok(
    /\.delete\(businessKnowledgeFacts\)[\s\S]{0,400}eq\(businessKnowledgeFacts\.state, "draft"\)/.test(remove),
    "only a draft may be hard-deleted",
  );
  // Both statements pin the user and the state, so an id alone can never reach a live row.
  const statements = remove.match(/eq\(businessKnowledgeFacts\.id, factId\)/g) ?? [];
  assert.ok(statements.length >= 3);
  assert.ok(
    !/\.delete\(businessKnowledgeFacts\)[\s\S]{0,400}state, "published"/.test(remove),
    "a published fact must never be deleted outright",
  );
});

run("caches are invalidated only after the removal commits", () => {
  const src = read("server/websiteKnowledge/publishFacts.ts");
  const remove = src.slice(src.indexOf("export async function removeKnowledgeFact"));
  const txEnd = remove.indexOf("return outcome;");
  const invalidateAt = remove.indexOf("invalidateWorkspaceIntelligenceCache");
  assert.ok(invalidateAt > 0 && invalidateAt < txEnd);
  assert.ok(
    /if \(outcome === "published_retired"\)/.test(remove),
    "discarding a draft changes nothing live, so it must not flush a cache",
  );
});

run("the delete route can no longer bypass the retire path", () => {
  const routes = read("server/websiteKnowledge/knowledgeRoutes.ts");
  assert.ok(/removeKnowledgeFact\(req\.user!\.id, req\.params\.id\)/.test(routes));
  assert.ok(!/\bdeleteFact\(/.test(routes), "the raw delete must not be reachable from the API");
});

// --- 8. Production diagnostics --------------------------------------------------

run("the temporary WK-DIAG instrumentation is gone", () => {
  for (const file of [
    "server/routes.ts",
    "server/aiService.ts",
    "server/websiteKnowledgeDraftCache.ts",
  ]) {
    const src = read(file);
    assert.ok(!/WK-DIAG/.test(src), `${file} still references the temporary tracer`);
    assert.ok(!/wkDiag\(/.test(src), `${file} still emits diagnostic stages`);
    assert.ok(!/priceSignals\(/.test(src), `${file} still logs extracted prices`);
  }
  assert.throws(
    () => read("server/websiteKnowledgeDiagnostics.ts"),
    "the diagnostics module should have been deleted",
  );
});

run("the remaining scan log records a condition, not content", () => {
  const src = read("server/routes.ts");
  const warn = src.slice(
    src.indexOf('console.warn("[WebsiteKnowledge] scan produced no summary"'),
  );
  const call = warn.slice(0, warn.indexOf("});") + 3);
  // Only the payload matters; the message itself is a fixed string.
  const payload = call.slice(call.indexOf("{"));
  assert.ok(/pages: pages\.length/.test(payload) && /combinedChars: combined\.length/.test(payload));
  for (const leak of ["summary", "combined,", "p.text", "url"]) {
    assert.ok(!payload.includes(leak), `the scan log must not carry ${leak}`);
  }
});

console.log("\nAll rollback and scan-safety tests passed.");
