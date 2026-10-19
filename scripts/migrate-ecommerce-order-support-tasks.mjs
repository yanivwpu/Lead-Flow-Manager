import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { validateStagingTarget } from "./bootstrap-staging-db.mjs";

/**
 * Explicit one-time staging ONLY migration. Default is READ-ONLY preflight.
 * Nothing invokes --apply at startup, by build, or by a normal deployment.
 * Railway OAuth cannot inspect volume backups: --apply requires an independently
 * verified Railway backup reference entered by the operator.
 */
const REQUIRED_ORIGIN = "https://whachatcrm-staging-app-staging.up.railway.app";
const LOCK = 24801924;
export const MIGRATION = "20261019_ecommerce_growth_order_support_tasks";
export const REQUIRED_TABLES = Object.freeze({
  ecommerce_growth_event_inbox: ["id","account_id","shop","topic","delivery_id","journey","state"],
  contacts: ["id","user_id"],
  users: ["id"],
  integrations: ["id","user_id","type","is_active"],
});
const EXPECTED = Object.freeze({
  ecommerce_growth_order_task_settings: ["account_id","shop","tasks_enabled","updated_at"],
  ecommerce_growth_order_support_tasks: ["id","event_id","account_id","shop","contact_id","state","created_at"],
});
function safeCode(error) {
  const reason = error?.message;
  return typeof reason === "string" && /^(staging_|ecommerce_task_|database_url_invalid$)/.test(reason)
    ? reason : "ecommerce_task_migration_failed";
}
export function parseMigrationMode(argv) {
  if (argv.length !== 1 || !["--preflight","--apply"].includes(argv[0]))
    throw new Error("ecommerce_task_invalid_mode");
  return argv[0] === "--apply" ? "apply" : "preflight";
}
export function checkMigrationTarget(env, mode) {
  // Existing bootstrap allowlist checks exact private URL, database and
  // pinned Railway project/environment/service IDs before any DB connection.
  const target = validateStagingTarget(env);
  if (env.RAILWAY_ENVIRONMENT_NAME !== "staging" ||
      env.APP_URL?.replace(/\/$/, "") !== REQUIRED_ORIGIN ||
      env.STAGING_BOOTSTRAP_DISPOSABLE_TEST === "1")
    throw new Error("ecommerce_task_staging_identity_mismatch");
  if (mode === "apply") {
    if (env.ECOMMERCE_STAGING_TASK_MIGRATION_APPROVAL !== "apply-after-verified-railway-backup" ||
        !/^[A-Za-z0-9_.:-]{8,128}$/.test(env.ECOMMERCE_STAGING_TASK_BACKUP_REF || ""))
      throw new Error("ecommerce_task_backup_approval_missing");
  }
  return target;
}
async function tableColumns(client, table) {
  const { rows } = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",
    [table]);
  return new Set(rows.map(row => row.column_name));
}
async function ensureColumns(client, required) {
  for (const [table, columns] of Object.entries(required)) {
    const present = await tableColumns(client, table);
    if (columns.some(column => !present.has(column)))
      throw new Error("ecommerce_task_schema_mismatch");
  }
}
async function taskTableState(client) {
  const { rows } = await client.query(
    "SELECT to_regclass('public.ecommerce_growth_order_task_settings')::text AS settings, " +
    "to_regclass('public.ecommerce_growth_order_support_tasks')::text AS tasks");
  if (!rows[0].settings && !rows[0].tasks) return "not_applied";
  if (!rows[0].settings || !rows[0].tasks) throw new Error("ecommerce_task_partial_schema");
  await ensureColumns(client, EXPECTED);
  const { rows: constraints } = await client.query(
    "SELECT conname, contype, conrelid::regclass::text AS tab FROM pg_constraint " +
    "WHERE conrelid IN ('public.ecommerce_growth_order_task_settings'::regclass," +
    "'public.ecommerce_growth_order_support_tasks'::regclass)");
  const settingsPk = constraints.some(c => c.tab.endsWith("ecommerce_growth_order_task_settings") && c.contype === "p");
  const tasksPk = constraints.some(c => c.tab.endsWith("ecommerce_growth_order_support_tasks") && c.contype === "p");
  const taskFk = constraints.filter(c => c.tab.endsWith("ecommerce_growth_order_support_tasks") && c.contype === "f").length;
  const taskUnique = constraints.some(c => c.tab.endsWith("ecommerce_growth_order_support_tasks") && c.contype === "u");
  if (!settingsPk || !tasksPk || taskFk < 2 || !taskUnique)
    throw new Error("ecommerce_task_constraints_missing");
  return "applied";
}
async function verifyContext(client, database) {
  const { rows } = await client.query("SELECT current_database() AS db, current_schema() AS schema");
  if (rows[0]?.db !== database || rows[0]?.schema !== "public")
    throw new Error("ecommerce_task_database_context_mismatch");
  const { rows: marker } = await client.query(
    "SELECT to_regclass('public.whachat_staging_schema_bootstrap')::text AS marker");
  if (!marker[0]?.marker) throw new Error("ecommerce_task_baseline_marker_missing");
  await ensureColumns(client, REQUIRED_TABLES);
}
/**
 * Uses SQL file committed to this repository, transaction lock + schema
 * compatibility checks. It never updates customer/order/event records.
 * No pending event is acknowledged and no historical task is backfilled.
 */
export async function migrateEcommerceOrderTasks({ env = process.env, mode = "preflight", driver = pg } = {}) {
  const { url, database } = checkMigrationTarget(env, mode);
  const pool = new driver.Pool({ connectionString:url, max:1, connectionTimeoutMillis:10000 });
  let client;
  try {
    client = await pool.connect();
    await client.query(mode === "apply" ? "BEGIN ISOLATION LEVEL REPEATABLE READ" : "BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '30000'");
    await client.query("SET LOCAL lock_timeout = '5000'");
    if (mode === "apply")
      await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK]);
    await verifyContext(client, database);
    const before = await taskTableState(client);
    if (mode === "apply" && before === "not_applied") {
      const ddl = await readFile(new URL("../migrations/20261019_ecommerce_growth_order_support_tasks.sql", import.meta.url), "utf8");
      if (!ddl.includes("CREATE TABLE IF NOT EXISTS ecommerce_growth_order_task_settings") ||
          !ddl.includes("CREATE TABLE IF NOT EXISTS ecommerce_growth_order_support_tasks"))
        throw new Error("ecommerce_task_migration_artifact_invalid");
      await client.query(ddl);
      const after = await taskTableState(client);
      if (after !== "applied") throw new Error("ecommerce_task_postcheck_failed");
    }
    await client.query("COMMIT");
    return { mode, state: mode === "apply" ? "applied" : before };
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const mode = parseMigrationMode(process.argv.slice(2));
    const status = await migrateEcommerceOrderTasks({ mode });
    // Intentionally no URLs, credentials, event IDs, customer data or raw SQL.
    console.info("[EcommerceTaskMigration]", status);
  } catch (error) {
    console.error("[EcommerceTaskMigration]", { reason: safeCode(error) });
    process.exitCode = 1;
  }
}
