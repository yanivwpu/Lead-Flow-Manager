import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { validatePrivacySmokeTarget, verifyPrivacySmokeDatabase, PRIVACY_SMOKE_TARGET as T } from "../server/shopifyPrivacySmokeSafety";

const valid = {
  SHOPIFY_PRIVACY_SMOKE_TEST: "1", RAILWAY_PROJECT_ID: T.project, RAILWAY_ENVIRONMENT_ID: T.environment,
  RAILWAY_SERVICE_ID: T.service, RAILWAY_ENVIRONMENT_NAME: "staging",
  DATABASE_URL: "postgresql://fixture:fixture@postgres.railway.internal:5432/railway",
  SHOPIFY_PRIVACY_SMOKE_DATABASE_SYSTEM_ID: "7654321098765432100",
  SHOPIFY_PRIVACY_ALERT_URL: T.receiver, SHOPIFY_PRIVACY_ALERT_EMAIL_ENABLED: "true",
  RESEND_API_KEY: "fixture-key", RESEND_FROM_EMAIL: "WhachatCRM <noreply@crm.whachatcrm.com>",
  SHOPIFY_PRIVACY_ALERT_TOKEN: "a".repeat(48),
};
test("documented database reference, service identity, endpoint and SSH target agree", () => {
  assert.equal(T.databaseService, "88d5aec0-1cf7-4fe1-9084-5745a97736bd");
  assert.equal(T.databaseServiceName, "Postgres-JSIn");
  assert.equal(T.databaseReference, "${{" + T.databaseServiceName + ".DATABASE_URL}}");
  const doc = readFileSync(new URL("../docs/shopify-privacy-staging-smoke.md", import.meta.url), "utf8");
  const setting = (name: string) => doc.split("\n").find(line => line.startsWith("| " + name + " |"))?.split("|")[2].trim().replaceAll("`", "");
  assert.equal(setting("Database service"), T.databaseServiceName);
  assert.equal(setting("Database service ID"), T.databaseService);
  assert.equal(setting("App DATABASE_URL reference"), T.databaseReference);
  assert.equal(setting("Database private endpoint"), T.host);
  const databaseCommands = doc.split("\n").filter(line => line.includes("railway ssh") && line.includes("pg_control_system()"));
  assert.equal(databaseCommands.length, 1);
  assert.ok(databaseCommands[0].includes("--project " + T.project));
  assert.ok(databaseCommands[0].includes("--environment " + T.environment));
  assert.ok(databaseCommands[0].includes("--service " + T.databaseService + " -- "));
  assert.ok(!doc.includes("303eefe1-6964-40ac-822e-cf47e5e51752"));
});
test("smoke gate requires explicit invocation and exact Railway identities, never a disposable bypass", () => {
  assert.equal(validatePrivacySmokeTarget(valid), valid.DATABASE_URL);
  for (const key of Object.keys(valid)) assert.throws(() => validatePrivacySmokeTarget({ ...valid, [key]: "" }), key);
  for (const patch of [
    { RAILWAY_PROJECT_ID: "production" }, { RAILWAY_ENVIRONMENT_ID: "production" },
    { RAILWAY_SERVICE_ID: T.databaseService }, { RAILWAY_ENVIRONMENT_NAME: "production" },
    { SHOPIFY_PRIVACY_ALERT_EMAIL_ENABLED: "false" }, { SHOPIFY_PRIVACY_ALERT_EMAIL_ENABLED: "TRUE" },
    { SHOPIFY_PRIVACY_ALERT_URL: T.receiver.replace("https:", "http:") },
    { SHOPIFY_PRIVACY_ALERT_URL: T.receiver + "?debug=1" },
    { SHOPIFY_PRIVACY_SMOKE_DATABASE_SYSTEM_ID: "0" },
    { SHOPIFY_PRIVACY_ALERT_TOKEN: "short" },
    { RESEND_FROM_EMAIL: "Personal Name <fixture@example.invalid>" },
    { RESEND_FROM_EMAIL: "noreply@crm.whachatcrm.com\r\nBcc: fixture@example.invalid" },
  ]) assert.throws(() => validatePrivacySmokeTarget({ ...valid, ...patch }));
  for (const database of [
    "postgres://fixture:fixture@localhost/railway", "postgres://fixture:fixture@127.0.0.1/railway",
    "postgres://fixture:fixture@[::1]/railway", "postgres://fixture:fixture@production.railway.internal/railway",
    "postgres://fixture:fixture@postgres.railway.internal/production",
    "postgres://fixture:fixture@postgres.railway.internal:6543/railway",
    valid.DATABASE_URL + "?options=-c%20search_path=production", valid.DATABASE_URL + "#staging",
  ]) assert.throws(() => validatePrivacySmokeTarget({ ...valid, DATABASE_URL: database,
    STAGING_BOOTSTRAP_DISPOSABLE_TEST: "1", NODE_ENV: "staging" }));
});

test("database control identity, server address, bootstrap marker and migration are verified read-only", async () => {
  const context = { database: "railway", schema: "public", address: "10.1.2.3", system_id: valid.SHOPIFY_PRIVACY_SMOKE_DATABASE_SYSTEM_ID };
  const marker = [{ version: 1, baseline_sha256: "a".repeat(64) }];
  const ready = { ready: true, columns: 5 };
  const client = (rows: any[]) => ({ query: async (sql: string) => {
    assert.ok(sql.startsWith("SELECT"), "Gate must not write to an unverified database");
    return { rows: rows.shift() };
  } }) as any;
  await verifyPrivacySmokeDatabase(client([[context], marker, [ready]]), valid);
  for (const patch of [
    { database: "production" }, { schema: "other" }, { system_id: "7654321098765432101" },
    { address: "127.0.0.1" }, { address: "::1" }, { address: null },
    { address: "::ffff:127.0.0.1" }, { address: "0.0.0.0" }, { address: "::" },
  ]) await assert.rejects(verifyPrivacySmokeDatabase(client([[{ ...context, ...patch }]]), valid), /database_identity_rejected/);
  for (const bad of [[], [{ version: 2, baseline_sha256: "a".repeat(64) }], [{ version: 1, baseline_sha256: "unknown" }]])
    await assert.rejects(verifyPrivacySmokeDatabase(client([[context], bad]), valid), /staging_bootstrap_marker_rejected/);
  await assert.rejects(verifyPrivacySmokeDatabase(client([[context], marker, [{ ready: true, columns: 4 }]]), valid), /privacy_schema_not_ready/);
  await assert.rejects(verifyPrivacySmokeDatabase(client([[context], marker, [{ ready: false, columns: 5 }]]), valid), /privacy_schema_not_ready/);
});
