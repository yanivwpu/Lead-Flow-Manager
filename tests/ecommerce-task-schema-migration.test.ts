import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { parseMigrationMode, checkMigrationTarget, MIGRATION } from "../scripts/migrate-ecommerce-order-support-tasks.mjs";

const stage = {
  STAGING_DATABASE_BOOTSTRAP: "1",
  RAILWAY_PROJECT_ID: "1d22ff35-a259-4977-9375-377dda1cdd2b",
  RAILWAY_ENVIRONMENT_ID: "43e4c163-6da9-4be5-ad93-0a3534234613",
  RAILWAY_SERVICE_ID: "7663b193-b936-41cd-a810-a4940d9912fc",
  RAILWAY_ENVIRONMENT_NAME: "staging",
  APP_URL: "https://whachatcrm-staging-app-staging.up.railway.app",
  DATABASE_URL: "postgres://fake:fake@postgres.railway.internal/railway",
};
test("migration rejects all unexpected targets and requires a verified-backup acknowledgment", () => {
  assert.equal(MIGRATION, "20261019_ecommerce_growth_order_support_tasks");
  assert.equal(parseMigrationMode(["--preflight"]), "preflight");
  assert.equal(parseMigrationMode(["--apply"]), "apply");
  for (const args of [[], ["--apply","--preflight"], ["--run"], ["--apply","production"]])
    assert.throws(() => parseMigrationMode(args));
  assert.ok(checkMigrationTarget(stage,"preflight"));
  for (const key of ["RAILWAY_PROJECT_ID","RAILWAY_ENVIRONMENT_ID","RAILWAY_SERVICE_ID",
    "RAILWAY_ENVIRONMENT_NAME","APP_URL","STAGING_DATABASE_BOOTSTRAP","DATABASE_URL"])
    assert.throws(() => checkMigrationTarget({...stage,[key]:""},"preflight"),key);
  for (const db of [
    "postgres://fake:fake@c-6.us-east-1.aws.neon.tech/railway",
    "postgres://fake:fake@postgres.railway.internal/production",
    "postgres://fake:fake@production.railway.internal/railway"
  ]) assert.throws(() => checkMigrationTarget({...stage,DATABASE_URL:db},"preflight"));
  assert.throws(() => checkMigrationTarget(stage,"apply"));
  assert.throws(() => checkMigrationTarget({...stage,
    ECOMMERCE_STAGING_TASK_MIGRATION_APPROVAL:"apply-after-verified-railway-backup"
  },"apply"));
  assert.ok(checkMigrationTarget({...stage,
    ECOMMERCE_STAGING_TASK_MIGRATION_APPROVAL:"apply-after-verified-railway-backup",
    ECOMMERCE_STAGING_TASK_BACKUP_REF:"railway-backup-20261019"
  },"apply"));
});
test("actual migration is additive, idempotent and preserves historical order events",async()=>{
  const target=process.env.SHOPIFY_TEST_DATABASE_URL;
  assert.ok(target,"Require isolated SHOPIFY_TEST_DATABASE_URL");
  const url=new URL(target);
  assert.ok(["localhost","127.0.0.1"].includes(url.hostname));
  assert.equal(url.pathname,"/whachat_shopify_test");
  const schema="ecommerce_task_migration_sql_test";
  const c=new pg.Client({connectionString:target});
  await c.connect();
  try {
    await c.query('CREATE SCHEMA "'+schema+'"');
    await c.query("SET search_path TO "+schema);
    await c.query("CREATE TABLE contacts (id VARCHAR PRIMARY KEY, user_id VARCHAR NOT NULL)");
    await c.query("CREATE TABLE ecommerce_growth_event_inbox ("+
      "id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,"+
      "account_id VARCHAR(128) NOT NULL, shop VARCHAR(255) NOT NULL,"+
      "topic VARCHAR(64) NOT NULL, delivery_id VARCHAR(256) NOT NULL,"+
      "journey VARCHAR(32) NOT NULL, state VARCHAR(16) NOT NULL DEFAULT 'pending',"+
      "received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),"+
      "UNIQUE(account_id,shop,topic,delivery_id))");
    await c.query("INSERT INTO contacts (id,user_id) VALUES ('contact-1','merchant-1')");
    const shop="merchant.myshopify.com";
    const original=(await c.query("INSERT INTO ecommerce_growth_event_inbox "+
      "(account_id,shop,topic,delivery_id,journey) VALUES "+
      "('merchant-1',$1,'orders/create','recorded-order','order_support') RETURNING id",[shop])).rows[0].id;
    const migration=await readFile("migrations/20261019_ecommerce_growth_order_support_tasks.sql","utf8");
    await c.query("BEGIN");
    await c.query(migration);
    await c.query("COMMIT");
    await c.query(migration);
    assert.equal((await c.query("SELECT id FROM ecommerce_growth_order_support_tasks")).rowCount,0,
      "no history backfill");
    assert.equal((await c.query("SELECT tasks_enabled FROM ecommerce_growth_order_task_settings")).rowCount,0,
      "merchant opt-in absent by default");
    await c.query("INSERT INTO ecommerce_growth_order_task_settings(account_id,shop) VALUES ('merchant-1',$1)",[shop]);
    assert.equal((await c.query("SELECT tasks_enabled FROM ecommerce_growth_order_task_settings")).rows[0].tasks_enabled,false);
    await c.query("INSERT INTO ecommerce_growth_order_support_tasks "+
      "(event_id,account_id,shop,contact_id) VALUES($1,'merchant-1',$2,'contact-1')",[original,shop]);
    await assert.rejects(c.query("INSERT INTO ecommerce_growth_order_support_tasks "+
      "(event_id,account_id,shop,contact_id) VALUES($1,'merchant-1',$2,'contact-1')",[original,shop]));
    assert.equal((await c.query("SELECT state FROM ecommerce_growth_event_inbox WHERE id=$1",[original])).rows[0].state,"pending");
    await c.query("DELETE FROM contacts WHERE id='contact-1'");
    assert.equal((await c.query("SELECT id FROM ecommerce_growth_order_support_tasks")).rowCount,0,
      "contact erasure cascades into internal tasks");
  } finally {
    await c.query("RESET search_path").catch(()=>{});
    await c.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE').catch(()=>{});
    await c.end();
  }
});
