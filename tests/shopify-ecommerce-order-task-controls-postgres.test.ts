import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  saveOrderTaskMerchantOptInQuery,readOrderTaskMerchantSettingsQuery,
  readOrderSupportTaskListQuery,markOrderSupportTaskCompleteQuery,
} from "../server/ecommerce/orderSupportMerchantControls";

test("native PostgreSQL merchant tasks: isolated opt-ins, tenant list and atomic completion", async () => {
  const target=process.env.SHOPIFY_TEST_DATABASE_URL;
  assert.ok(target, "Requires isolated local SHOPIFY_TEST_DATABASE_URL");
  const url=new URL(target);
  assert.ok(["localhost","127.0.0.1"].includes(url.hostname));
  assert.equal(url.pathname,"/whachat_shopify_test");
  const schema="shopify_internal_task_controls_test";
  const admin=new Pool({connectionString:target});
  let pool:Pool|undefined;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`CREATE TABLE "${schema}".contacts (
      id VARCHAR PRIMARY KEY, user_id VARCHAR NOT NULL, name TEXT NOT NULL)`);
    await admin.query(`CREATE TABLE "${schema}".ecommerce_growth_order_task_settings (
      account_id VARCHAR(128) NOT NULL, shop VARCHAR(255) NOT NULL,
      tasks_enabled BOOLEAN NOT NULL DEFAULT FALSE, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(account_id,shop))`);
    await admin.query(`CREATE TABLE "${schema}".ecommerce_growth_order_support_tasks (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, event_id BIGINT NOT NULL UNIQUE,
      account_id VARCHAR(128) NOT NULL, shop VARCHAR(255) NOT NULL,
      contact_id VARCHAR NOT NULL, state VARCHAR(16) NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    url.searchParams.set("options",`-c search_path=${schema}`);
    pool=new Pool({connectionString:url.toString(),max:12});
    const db=drizzle(pool);
    const shop="one.myshopify.com", second="other.myshopify.com";
    await pool.query(`INSERT INTO contacts (id,user_id,name) VALUES
      ('alice-contact','alice','Alice Customer'),
      ('bob-contact','bob','Bob Customer'),
      ('another-contact','alice','Other Customer')`);
    await pool.query(`INSERT INTO ecommerce_growth_order_support_tasks
      (event_id,account_id,shop,contact_id) VALUES
      (1,'alice',$1,'alice-contact'),(2,'bob',$1,'bob-contact'),(3,'alice',$2,'another-contact')`,[shop,second]);
    const read = async(account:string,site:string) => (await db.execute(readOrderTaskMerchantSettingsQuery(account,site))).rows[0] as any;
    assert.equal((await read("alice",shop)).enabled,false);
    await db.execute(saveOrderTaskMerchantOptInQuery("alice",shop,true));
    assert.equal((await read("alice",shop)).enabled,true);
    assert.equal((await read("bob",shop)).enabled,false);
    assert.equal((await read("alice",second)).enabled,false);
    const merchantRows=await db.execute(readOrderSupportTaskListQuery("alice",shop));
    assert.equal(merchantRows.rows.length,1);
    const ownedTaskId=String(merchantRows.rows[0].id);
    assert.equal((await db.execute(markOrderSupportTaskCompleteQuery(ownedTaskId,"bob",shop))).rows.length,0);
    assert.equal((await db.execute(markOrderSupportTaskCompleteQuery(ownedTaskId,"alice",second))).rows.length,0);
    const results=await Promise.all(Array.from({length:8},()=>db.execute(markOrderSupportTaskCompleteQuery(ownedTaskId,"alice",shop))));
    assert.equal(results.reduce((sum,result)=>sum+result.rows.length,0),1);
    assert.equal((await read("alice",shop)).completed_count,1);
    assert.equal((await read("bob",shop)).open_count,1);
    assert.equal((await read("alice",second)).open_count,1);
    await db.execute(saveOrderTaskMerchantOptInQuery("alice",shop,false));
    assert.equal((await read("alice",shop)).enabled,false);
    assert.equal((await read("bob",shop)).enabled,false);
  } finally {
    await pool?.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(()=>{});
    await admin.end();
  }
});
