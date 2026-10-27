import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import pg from "pg";

test("merchant activation migration is installation-bound, unique and cascades on uninstall", async t => {
  const url = process.env.ECOMMERCE_TEST_DATABASE_URL;
  if (!url) { t.skip("Isolated PostgreSQL test database unavailable"); return; }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const schema = "merchant_activation_" + randomUUID().replace(/-/g, "");
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}", public`);
    await client.query("CREATE TABLE users (id VARCHAR PRIMARY KEY)");
    await client.query("CREATE TABLE integrations (id VARCHAR PRIMARY KEY, user_id VARCHAR REFERENCES users(id))");
    const migration = readFileSync("migrations/0117_ecommerce_merchant_workspace_activation.sql", "utf8");
    await client.query(migration);
    await client.query(migration); // Idempotent application.
    await client.query("INSERT INTO users (id) VALUES ('merchant-a'), ('merchant-b')");
    await client.query("INSERT INTO integrations (id, user_id) VALUES ('installation-a', 'merchant-a'), ('installation-b', 'merchant-b')");
    await client.query(`
      INSERT INTO ecommerce_shopify_workspace_activations (account_id, installation_id, shop)
      VALUES ('merchant-a', 'installation-a', 'fixture.myshopify.com')
    `);
    const first = await client.query("SELECT account_id, installation_id, shop FROM ecommerce_shopify_workspace_activations");
    assert.deepEqual(first.rows.map(r => [r.account_id, r.installation_id, r.shop]),
      [["merchant-a", "installation-a", "fixture.myshopify.com"]]);
    await assert.rejects(() => client.query(`
      INSERT INTO ecommerce_shopify_workspace_activations (account_id, installation_id, shop)
      VALUES ('merchant-b', 'installation-a', 'other.myshopify.com')`
    ));
    await assert.rejects(() => client.query(`
      INSERT INTO ecommerce_shopify_workspace_activations (account_id, installation_id, shop)
      VALUES ('merchant-b', 'installation-b', 'evil.example.com')`
    ));
    await client.query("DELETE FROM integrations WHERE id = 'installation-a'");
    const after = await client.query("SELECT COUNT(*)::int AS total FROM ecommerce_shopify_workspace_activations");
    assert.equal(after.rows[0].total, 0);
  } finally {
    try { await client.query("RESET search_path"); await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await client.end(); }
  }
});
