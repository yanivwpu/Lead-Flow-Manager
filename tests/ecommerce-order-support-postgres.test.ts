import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { orderSupportTaskInsertQuery } from "../server/ecommerce/orderSupportTaskQueue";

test("native PostgreSQL: internal order support tasks are owned, opt-in, and unique under concurrent delivery", async () => {
  const target = process.env.SHOPIFY_TEST_DATABASE_URL;
  assert.ok(target, "Requires isolated SHOPIFY_TEST_DATABASE_URL, not production DATABASE_URL");
  const url = new URL(target);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
  assert.equal(url.pathname, "/whachat_shopify_test");
  const schema = "ecommerce_order_support_test";
  const admin = new Pool({ connectionString: target });
  let pool: Pool | undefined;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`CREATE TABLE "${schema}".contacts (
      id VARCHAR PRIMARY KEY, user_id VARCHAR NOT NULL
    )`);
    await admin.query(`CREATE TABLE "${schema}".ecommerce_growth_event_inbox (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      account_id VARCHAR(128) NOT NULL, shop VARCHAR(255) NOT NULL,
      topic VARCHAR(64) NOT NULL, delivery_id VARCHAR(256) NOT NULL,
      journey VARCHAR(32) NOT NULL, state VARCHAR(16) NOT NULL DEFAULT 'pending',
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(account_id,shop,topic,delivery_id)
    )`);
    await admin.query(`CREATE TABLE "${schema}".ecommerce_growth_order_task_settings (
      account_id VARCHAR(128) NOT NULL, shop VARCHAR(255) NOT NULL,
      tasks_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(account_id,shop)
    )`);
    await admin.query(`CREATE TABLE "${schema}".ecommerce_growth_order_support_tasks (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      event_id BIGINT NOT NULL REFERENCES "${schema}".ecommerce_growth_event_inbox(id) ON DELETE CASCADE,
      account_id VARCHAR(128) NOT NULL, shop VARCHAR(255) NOT NULL,
      contact_id VARCHAR NOT NULL REFERENCES "${schema}".contacts(id) ON DELETE CASCADE,
      state VARCHAR(16) NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(event_id)
    )`);
    url.searchParams.set("options", `-c search_path=${schema}`);
    pool = new Pool({ connectionString: url.toString(), max: 12 });
    const db = drizzle(pool);
    const one = "one.myshopify.com", two = "two.myshopify.com";
    await pool.query("INSERT INTO contacts(id,user_id) VALUES ('a-contact','alice'),('b-contact','bob')");
    await pool.query(`INSERT INTO ecommerce_growth_order_task_settings (account_id,shop)
      VALUES ('alice',$1),('alice',$2),('bob',$1)`, [one,two]);
    const add = async (account: string, shop: string, delivery: string,
      topic = "orders/create", journey = "order_support", state = "pending") => {
      const row = await pool!.query(`INSERT INTO ecommerce_growth_event_inbox
        (account_id,shop,topic,delivery_id,journey,state)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING id::text AS id`,
        [account,shop,topic,delivery,journey,state]);
      return row.rows[0].id as string;
    };
    const originalEventId = await add("alice", one, "existing-verified-order");
    const good = {
      accountId: "alice", canonicalShop: one, deliveryId: "existing-verified-order",
      contactId: "a-contact",
    };
    const attempt = async (params = good) => {
      const query = orderSupportTaskInsertQuery(params);
      assert.ok(query);
      return (await db.execute(query)).rows.length;
    };
    // A recorded event by itself never causes a task without explicit opt-in.
    assert.equal(await attempt(), 0);
    await pool.query(`UPDATE ecommerce_growth_order_task_settings
      SET tasks_enabled=TRUE WHERE account_id='alice' AND shop=$1`, [one]);
    // Even with a store opted in, ownership is rechecked in the insert.
    assert.equal(await attempt({...good, contactId:"b-contact"}), 0);
    assert.equal(await attempt({...good, accountId:"bob"}), 0);
    assert.equal(await attempt({...good, canonicalShop:two}), 0);
    const parallel = await Promise.all(Array.from({length:10}, () => attempt()));
    assert.equal(parallel.reduce((a,b)=>a+b,0), 1);
    assert.equal(await attempt(), 0, "replayed delivery must not duplicate");
    await add("alice", one, "fulfilled", "orders/fulfilled", "fulfillment_support");
    await add("alice", one, "already-reviewed", "orders/create", "order_support", "reviewed");
    assert.equal(await attempt({...good,deliveryId:"fulfilled"}), 0);
    assert.equal(await attempt({...good,deliveryId:"already-reviewed"}), 0);
    await add("alice", two, "no-opt-in");
    assert.equal(await attempt({...good,canonicalShop:two,deliveryId:"no-opt-in"}), 0);
    await pool.query(`UPDATE ecommerce_growth_order_task_settings
      SET tasks_enabled=FALSE WHERE account_id='alice' AND shop=$1`, [one]);
    await add("alice", one, "after-pause");
    assert.equal(await attempt({...good,deliveryId:"after-pause"}), 0);
    const tasks = await pool.query("SELECT event_id::text AS event_id,account_id,shop,contact_id FROM ecommerce_growth_order_support_tasks");
    assert.deepEqual(tasks.rows, [{event_id:originalEventId,account_id:"alice",shop:one,contact_id:"a-contact"}]);
    const reviewItem = await pool.query("SELECT state FROM ecommerce_growth_event_inbox WHERE id=$1", [originalEventId]);
    assert.equal(reviewItem.rows[0].state,"pending","task insertion must not mark the owner's event reviewed");
    // Privacy deletion removes tasks through FK cascade, never sends anything.
    await pool.query("DELETE FROM contacts WHERE id='a-contact'");
    assert.equal((await pool.query("SELECT id FROM ecommerce_growth_order_support_tasks")).rows.length,0);
  } finally {
    await pool?.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(()=>{});
    await admin.end();
  }
});
