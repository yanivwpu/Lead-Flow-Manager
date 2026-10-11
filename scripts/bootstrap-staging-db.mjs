import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import pg from "pg";

const STAGING = {
  project: "1d22ff35-a259-4977-9375-377dda1cdd2b",
  environment: "43e4c163-6da9-4be5-ad93-0a3534234613",
  service: "7663b193-b936-41cd-a810-a4940d9912fc",
};
const MARKER = "whachat_staging_schema_bootstrap";
const LOCK = 18643109;

export function validateStagingTarget(env) {
  if (env.STAGING_DATABASE_BOOTSTRAP !== "1") throw new Error("staging_bootstrap_not_enabled");
  let target;
  try { target = new URL(env.DATABASE_URL); } catch { throw new Error("database_url_invalid"); }
  if (!["postgres:", "postgresql:"].includes(target.protocol)) throw new Error("database_url_invalid");
  const disposable = env.STAGING_BOOTSTRAP_DISPOSABLE_TEST === "1" &&
    ["localhost", "127.0.0.1"].includes(target.hostname) &&
    target.pathname === "/whachat_staging_bootstrap_test" &&
    !env.RAILWAY_PROJECT_ID && !env.RAILWAY_ENVIRONMENT_ID && !env.RAILWAY_SERVICE_ID;
  const railway = env.RAILWAY_PROJECT_ID === STAGING.project &&
    env.RAILWAY_ENVIRONMENT_ID === STAGING.environment &&
    env.RAILWAY_SERVICE_ID === STAGING.service &&
    env.RAILWAY_ENVIRONMENT_NAME === "staging" &&
    target.hostname === "postgres.railway.internal" &&
    target.pathname === "/railway" &&
    !target.search && !target.hash;
  if (!disposable && !railway) throw new Error("staging_target_not_allowlisted");
  return { url: target.toString(), database: decodeURIComponent(target.pathname.slice(1)) };
}

async function verify(client, manifest) {
  const { rows } = await client.query(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`);
  const present = new Set(rows.map(row => row.table_name + "." + row.column_name));
  const missing = manifest.tables.flatMap(table => table.columns
    .filter(column => !present.has(table.name + "." + column)).map(column => table.name + "." + column));
  if (missing.length) throw new Error("staging_schema_incomplete");
}

export async function bootstrapStagingDatabase(env = process.env, artifactDirectory = new URL("../dist/", import.meta.url)) {
  // Validate before opening any connection or importing application startup modules.
  const target = validateStagingTarget(env);
  const ddl = await readFile(new URL("staging-schema.sql", artifactDirectory), "utf8");
  const manifest = JSON.parse(await readFile(new URL("staging-schema.json", artifactDirectory), "utf8"));
  if (manifest.version !== 1 || !Array.isArray(manifest.tables) ||
      !["users", "contacts", "integrations", "conversations", "messages"].every(name =>
        manifest.tables.some(table => table.name === name && Array.isArray(table.columns))) ||
      createHash("sha256").update(ddl).digest("hex") !== manifest.sha256)
    throw new Error("staging_schema_artifact_invalid");

  const pool = new pg.Pool({ connectionString: target.url, max: 1, connectionTimeoutMillis: 10000 });
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '30s'");
    await client.query("SET LOCAL statement_timeout = '120s'");
    await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK]);
    const { rows: context } = await client.query("SELECT current_database() AS database, current_schema() AS schema");
    if (context[0].database !== target.database || context[0].schema !== "public")
      throw new Error("staging_database_context_mismatch");
    const { rows: markers } = await client.query("SELECT to_regclass($1) AS marker", ["public." + MARKER]);
    if (markers[0].marker) {
      const { rows } = await client.query(`SELECT version, baseline_sha256 FROM public.${MARKER}`);
      if (rows.length !== 1 || rows[0].version !== manifest.version || rows[0].baseline_sha256 !== manifest.sha256)
        throw new Error("staging_baseline_changed_use_reviewed_migrations");
      await verify(client, manifest);
      await client.query("COMMIT");
      return { initialized: false, tables: manifest.tables.length };
    }
    const { rows: objects } = await client.query(`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
        AND n.nspname NOT LIKE 'pg_temp%' AND c.relkind IN ('r','p','v','m','S','f')
      UNION ALL
      SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND t.typtype = 'e'`);
    if (objects.length) throw new Error("staging_database_not_empty_no_bootstrap_marker");
    // Full generated schema, including defaults, indexes and FK constraints, is applied atomically.
    // Never infer a partial database is safe to repair; never DROP/TRUNCATE existing objects.
    // Drizzle breakpoints preserve DO blocks and keep a failed query from logging the full baseline.
    for (const statement of ddl.split("--> statement-breakpoint").map(part => part.trim()).filter(Boolean)) {
      await client.query(statement);
    }
    await verify(client, manifest);
    await client.query(`CREATE TABLE public.${MARKER} (
      version integer PRIMARY KEY, baseline_sha256 text NOT NULL, initialized_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query(`INSERT INTO public.${MARKER} (version, baseline_sha256) VALUES ($1, $2)`, [manifest.version, manifest.sha256]);
    await client.query("COMMIT");
    return { initialized: true, tables: manifest.tables.length };
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client?.release(); await pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await bootstrapStagingDatabase();
    console.log("[StagingBootstrap] Ready", result);
  } catch (error) {
    // Never print connection strings, SQL payloads, driver details, or an unbounded stack.
    const reason = typeof error?.message === "string" && /^staging_[a-z_]+$|^database_url_invalid$/.test(error.message)
      ? error.message : "staging_bootstrap_failed";
    const code = typeof error?.code === "string" && /^[A-Z0-9]{5}$/.test(error.code) ? error.code : undefined;
    console.error("[StagingBootstrap] Failed", { reason, ...(code ? { code } : {}) });
    process.exitCode = 1;
  }
}
