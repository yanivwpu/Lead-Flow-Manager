import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Pool } from "pg";

const migrations = [
  "20261019_ecommerce_growth_event_inbox.sql",
  "20261019_ecommerce_growth_order_support_tasks.sql",
  "20261020_ecommerce_task_schedule_staging.sql",
  "20261020_ecommerce_abandoned_checkout_observations.sql",
  "20261020_ecommerce_checkout_recovery_intents.sql",
];
test("foundation migration is additive, replayable and rolls back; customer erasure cascades to task schedules", async () => {
  const target = process.env.ECOMMERCE_TEST_DATABASE_URL;
  assert.ok(target, "Requires isolated ECOMMERCE_TEST_DATABASE_URL");
  const url = new URL(target);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
  assert.equal(url.pathname, "/whachat_ecommerce_test");
  const pool = new Pool({ connectionString: target });
  const client = await pool.connect();
  const schema = "ecommerce_foundation_migration_test";
  const ddl = migrations.map(name => readFileSync(`migrations/${name}`, "utf8")).join("\n");
  try {
    await client.query(`CREATE SCHEMA ${schema}; SET search_path=${schema};
      CREATE TABLE users(id varchar PRIMARY KEY,subscription_plan text,subscription_status text);
      CREATE TABLE contacts(id varchar PRIMARY KEY,user_id varchar REFERENCES users(id),name text);
      INSERT INTO users VALUES ('pilot','pro','active'),('existing','agency','active');
      INSERT INTO contacts VALUES ('customer','pilot','Fixture'),('existing-contact','existing','Existing');`);
    const before = await client.query("SELECT * FROM users ORDER BY id");
    await client.query("BEGIN"); await client.query(ddl); await client.query("ROLLBACK");
    assert.equal((await client.query("SELECT to_regclass('ecommerce_growth_event_inbox')::text AS name")).rows[0].name, null);
    await client.query("BEGIN"); await client.query(ddl); await client.query("COMMIT");
    await client.query(ddl);
    assert.deepEqual((await client.query("SELECT * FROM users ORDER BY id")).rows, before.rows);
    assert.equal((await client.query("SELECT count(*)::int AS n FROM contacts")).rows[0].n, 2);
    await client.query(`INSERT INTO ecommerce_growth_event_inbox(account_id,shop,topic,delivery_id,journey)
      VALUES ('pilot','fixture.myshopify.com','orders/create','delivery','order_support');
      INSERT INTO ecommerce_growth_order_task_settings(account_id,shop) VALUES ('pilot','fixture.myshopify.com');
      INSERT INTO ecommerce_growth_order_support_tasks(event_id,account_id,shop,contact_id)
      SELECT id,account_id,shop,'customer' FROM ecommerce_growth_event_inbox;
      INSERT INTO ecommerce_growth_order_task_schedule(task_id,account_id,shop,assignee_user_id)
      SELECT id,account_id,shop,'pilot' FROM ecommerce_growth_order_support_tasks;`);
    assert.equal((await client.query("SELECT tasks_enabled FROM ecommerce_growth_order_task_settings")).rows[0].tasks_enabled, false);
    await client.query(ddl);
    assert.equal((await client.query("SELECT count(*)::int AS n FROM ecommerce_growth_order_support_tasks")).rows[0].n, 1);
    await client.query("DELETE FROM contacts WHERE id='customer'");
    assert.equal((await client.query("SELECT count(*)::int AS n FROM ecommerce_growth_order_task_schedule")).rows[0].n, 0);
    assert.equal((await client.query("SELECT count(*)::int AS n FROM ecommerce_growth_order_support_tasks")).rows[0].n, 0);
    assert.equal((await client.query("SELECT name FROM contacts WHERE id='existing-contact'")).rows[0].name, "Existing");
    assert.deepEqual((await client.query("SELECT * FROM users ORDER BY id")).rows, before.rows);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    client.release(); await pool.end();
  }
});
