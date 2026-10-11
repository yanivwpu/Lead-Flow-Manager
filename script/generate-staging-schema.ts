import { mkdtemp, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../shared/schema";

// Build-time only: no database connection and no change to migrations/_journal.json.
const root = process.cwd();
const temporary = await mkdtemp(path.join(tmpdir(), "whachat-staging-schema-"));
try {
  const config = path.join(temporary, "drizzle.config.ts");
  const output = path.join(temporary, "generated");
  await writeFile(config, `export default { dialect: "postgresql", schema: ${JSON.stringify(path.join(root, "shared/schema.ts"))}, out: ${JSON.stringify(output)} };\n`);
  const child = spawnSync(process.execPath, [path.join(root, "node_modules/drizzle-kit/bin.cjs"), "generate", "--config", config], {
    cwd: root, encoding: "utf8",
    // Generation needs no credential; do not let it inherit a deployment database URL.
    env: { ...process.env, DATABASE_URL: "" },
  });
  if (child.status !== 0) throw new Error("staging_schema_generation_failed");
  const files = (await readdir(output)).filter(name => name.endsWith(".sql"));
  if (files.length !== 1) throw new Error("staging_schema_generation_ambiguous");
  const ddl = await readFile(path.join(output, files[0]), "utf8");
  const tables = Object.values(schema).filter(value => is(value, PgTable)).map(value => {
    const config = getTableConfig(value as PgTable);
    if (config.schema && config.schema !== "public") throw new Error("unexpected_schema");
    return { name: config.name, columns: config.columns.map(column => column.name).sort() };
  }).sort((a, b) => a.name.localeCompare(b.name));
  if (!["users", "contacts", "integrations", "conversations", "messages"].every(name => tables.some(table => table.name === name)))
    throw new Error("staging_schema_missing_core_tables");
  await writeFile("dist/staging-schema.sql", ddl);
  await writeFile("dist/staging-schema.json", JSON.stringify({
    version: 1, sha256: createHash("sha256").update(ddl).digest("hex"), tables,
  }, null, 2) + "\n");
  console.log("[StagingBootstrap] Build artifact ready", { tables: tables.length });
} finally { await rm(temporary, { recursive: true, force: true }); }
