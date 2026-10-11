import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";
// Runtime is plain JS so pre-deploy needs no tsx or drizzle-kit installation.
// @ts-ignore standalone runtime module has no declaration file
import { bootstrapStagingDatabase, validateStagingTarget } from "../scripts/bootstrap-staging-db.mjs";

const url = process.env.STAGING_TEST_DATABASE_URL!;
const env = { DATABASE_URL: url, STAGING_DATABASE_BOOTSTRAP: "1", STAGING_BOOTSTRAP_DISPOSABLE_TEST: "1" };
test("target guards reject missing opt-in, production, wrong Railway context and remote test URLs before connecting", () => {
  assert.throws(() => validateStagingTarget({ DATABASE_URL: url }));
  assert.throws(() => validateStagingTarget({ ...env, DATABASE_URL: "postgres://unused:unused@remote.example.invalid/whachat_staging_bootstrap_test" }));
  assert.throws(() => validateStagingTarget({ ...env, RAILWAY_PROJECT_ID: "production" }));
  assert.throws(() => validateStagingTarget({ ...env, DATABASE_URL: "postgres://unused:unused@localhost/production" }));
  const pinned = { STAGING_DATABASE_BOOTSTRAP: "1", DATABASE_URL: "postgres://unused:unused@postgres.railway.internal/railway",
    RAILWAY_PROJECT_ID: "1d22ff35-a259-4977-9375-377dda1cdd2b", RAILWAY_ENVIRONMENT_ID: "43e4c163-6da9-4be5-ad93-0a3534234613",
    RAILWAY_SERVICE_ID: "7663b193-b936-41cd-a810-a4940d9912fc", RAILWAY_ENVIRONMENT_NAME: "staging" };
  assert.equal(validateStagingTarget(pinned).database, "railway");
  assert.throws(() => validateStagingTarget({ ...pinned, RAILWAY_ENVIRONMENT_NAME: "production" }));
  assert.throws(() => validateStagingTarget({ ...pinned, RAILWAY_SERVICE_ID: "another-service" }));
});

test("empty PostgreSQL baseline is transactional, concurrent/repeat safe and compatible with actual startup patches", async () => {
  assert.ok(url, "named disposable PostgreSQL URL is required");
  const target = new URL(url);
  assert.ok(["127.0.0.1", "localhost"].includes(target.hostname));
  assert.equal(target.pathname, "/whachat_staging_bootstrap_test");
  // Never load application db modules until this check and schema initialization succeed.
  const pool = new Pool({ connectionString: url });
  const artifacts = await mkdtemp(path.join(tmpdir(), "whachat-bootstrap-test-"));
  try {
    const count = async () => (await pool.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n;
    assert.equal(await count(), 0);
    const ddl = await readFile("dist/staging-schema.sql", "utf8");
    const manifest = JSON.parse(await readFile("dist/staging-schema.json", "utf8"));
    const failing = ddl + "\nSELECT * FROM bootstrap_intentional_missing_relation;";
    await writeFile(path.join(artifacts, "staging-schema.sql"), failing);
    await writeFile(path.join(artifacts, "staging-schema.json"), JSON.stringify({
      ...manifest, sha256: createHash("sha256").update(failing).digest("hex"),
    }));
    await assert.rejects(bootstrapStagingDatabase(env, pathToFileURL(artifacts + "/")));
    assert.equal(await count(), 0, "a failed baseline must roll back all objects");
    await pool.query("CREATE TABLE preexisting_staging_record (id integer PRIMARY KEY)");
    await assert.rejects(bootstrapStagingDatabase(env), /staging_database_not_empty_no_bootstrap_marker/);
    assert.equal(await count(), 1, "never reset or repair unknown existing tables");
    await pool.query("DROP TABLE preexisting_staging_record");
    const initialized = await Promise.all([bootstrapStagingDatabase(env), bootstrapStagingDatabase(env)]);
    assert.equal(initialized.filter(result => result.initialized).length, 1);
    assert.ok(manifest.tables.length > 100);
    assert.equal(await count(), manifest.tables.length + 1);
    const [merchant] = (await pool.query(`INSERT INTO users (name, email, password) VALUES ($1,$2,$3) RETURNING id`,
      ["Fixture", ["fixture", "example.invalid"].join("@"), "fixture-only"])).rows;
    assert.ok(merchant.id, "generated defaults must work");
    await assert.rejects(pool.query("INSERT INTO integrations (user_id,type,name) VALUES ($1,$2,$3)", ["missing-user","shopify","Fixture"]),
      (error: any) => error.code === "23503", "generated foreign keys must be enforced");
    assert.equal((await bootstrapStagingDatabase(env)).initialized, false);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM users")).rows[0].n, 1);
    const updatedManifest = { ...manifest, sha256: "changed-baseline" };
    await writeFile(path.join(artifacts, "staging-schema.sql"), ddl);
    await writeFile(path.join(artifacts, "staging-schema.json"), JSON.stringify(updatedManifest));
    await assert.rejects(bootstrapStagingDatabase(env, pathToFileURL(artifacts + "/")), /staging_schema_artifact_invalid/);
    const changedDdl = ddl + "\n-- reviewed baseline change required\n";
    await writeFile(path.join(artifacts, "staging-schema.sql"), changedDdl);
    await writeFile(path.join(artifacts, "staging-schema.json"), JSON.stringify({
      ...manifest, sha256: createHash("sha256").update(changedDdl).digest("hex"),
    }));
    await assert.rejects(bootstrapStagingDatabase(env, pathToFileURL(artifacts + "/")), /staging_baseline_changed_use_reviewed_migrations/);
    // A staging start command uses the bootstrap gate, before importing the entire app.
    const denied = spawnSync(process.execPath, ["scripts/bootstrap-staging-db.mjs"], {
      env: { ...process.env, ...env, STAGING_DATABASE_BOOTSTRAP: "0" }, encoding: "utf8",
    });
    assert.equal(denied.status, 1);
    assert.ok(denied.stderr.includes("staging_bootstrap_not_enabled"));
    assert.ok(denied.stderr.split("\n").length < 6);
    assert.ok(!denied.stderr.includes(url));

    process.env.DATABASE_URL = url;
    const { applyStartupSchemaPatches } = await import("../server/startupSchemaPatches");
    const { db } = await import("../drizzle/db");
    const originalLog = console.log, originalError = console.error;
    const errors: string[] = [];
    console.log = () => {};
    console.error = (...args: unknown[]) => { errors.push(String(args[0])); };
    try {
      const ready = await applyStartupSchemaPatches();
      assert.deepEqual(Object.values(ready), Object.values(ready).map(() => true));
      assert.equal(errors.length, 0, "full baseline must avoid cascading startup patch failures");
      const repeated = await applyStartupSchemaPatches();
      assert.deepEqual(repeated, ready);
      assert.equal(errors.length, 0);
    } finally {
      console.log = originalLog; console.error = originalError;
      await db.$client.end();
    }
    assert.equal((await bootstrapStagingDatabase(env)).initialized, false);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM users")).rows[0].n, 1);
    await pool.query("ALTER TABLE contacts DROP COLUMN notes");
    await assert.rejects(bootstrapStagingDatabase(env), /staging_schema_incomplete/);
  } finally {
    await pool.end();
    await rm(artifacts, { recursive: true, force: true });
  }
});
