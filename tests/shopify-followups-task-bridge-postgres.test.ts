import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  readOrderSupportTaskListQuery,
  markOrderSupportTaskCompleteQuery,
} from "../server/ecommerce/orderSupportMerchantControls";

test("Shopify follow-up bridge uses original task records, pilot-only read, shared completion endpoint", () => {
  const followUps = readFileSync("client/src/pages/FollowUps.tsx", "utf8");
  const component = readFileSync("client/src/components/followups/ShopifyOrderSupportTasks.tsx", "utf8");
  const sql = readFileSync("server/ecommerce/orderSupportMerchantControls.ts", "utf8");
  const routes = readFileSync("server/ecommercePilotRoutes.ts", "utf8");
  assert.match(followUps, /<ShopifyOrderSupportTasks\s*\/>/);
  assert.match(component, /useEcommercePilot\(\)/);
  assert.match(component, /withUserQueryScope/);
  assert.match(component, /response.status === 403 \|\| response.status === 404/);
  assert.match(component, /\/api\/shopify\/ecommerce\/event-inbox-preview/);
  assert.match(component, /\/api\/shopify\/ecommerce\/order-support-task-complete/);
  assert.match(component, /shopifyTaskContactHref\(task.contactId, task.orderActivityId\)/);
  assert.doesNotMatch(component, /\/api\/contacts\/.*PATCH|sendMessage|cartCreate\(/);
  assert.match(sql, /c.id = t.contact_id AND c.user_id = t.account_id/);
  assert.match(sql, /t.account_id = \$\{accountId\} AND t.shop = \$\{shop\}/);
  assert.match(sql, /CASE WHEN t.state = 'open' THEN 0 ELSE 1 END/);
  assert.match(routes, /contactName:String\(row.contact_name\)/);
});
test("native PG: ownership-filtered Shopify task list links only to owned contacts and completion is one-time", async () => {
  const target = process.env.SHOPIFY_TEST_DATABASE_URL;
  assert.ok(target, "Requires isolated SHOPIFY_TEST_DATABASE_URL");
  const url = new URL(target);
  assert.ok(["localhost","127.0.0.1"].includes(url.hostname));
  assert.equal(url.pathname, "/whachat_shopify_test");
  const schema = "shopify_followups_task_bridge_test";
  const admin = new Pool({ connectionString: target });
  let pool: Pool | undefined;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`CREATE TABLE "${schema}".contacts (id VARCHAR PRIMARY KEY,user_id VARCHAR NOT NULL,name TEXT NOT NULL)`);
    await admin.query(`CREATE TABLE "${schema}".ecommerce_growth_order_support_tasks (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      event_id BIGINT NOT NULL UNIQUE, account_id VARCHAR(128) NOT NULL,
      shop VARCHAR(255) NOT NULL, contact_id VARCHAR NOT NULL,
      state VARCHAR(16) NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await admin.query(`CREATE TABLE "${schema}".ecommerce_growth_event_inbox (
      id BIGINT PRIMARY KEY, account_id VARCHAR(128), shop VARCHAR(255),
      topic TEXT, delivery_id TEXT)`);
    await admin.query(`CREATE TABLE "${schema}".activity_events (
      id VARCHAR PRIMARY KEY, user_id VARCHAR NOT NULL, contact_id VARCHAR NOT NULL,
      event_type TEXT NOT NULL, event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW())`);
    url.searchParams.set("options", `-c search_path=${schema}`);
    pool = new Pool({ connectionString: url.toString(), max: 12 });
    const db = drizzle(pool);
    const shop = "whachatcrm.myshopify.com", otherShop="other.myshopify.com";
    await pool.query(`INSERT INTO contacts(id,user_id,name) VALUES
      ('c-a','alice','Alice Customer'),('c-b','bob','Bob Customer'),('c-a-2','alice','Alice Other Shop')`);
    await pool.query(`INSERT INTO ecommerce_growth_order_support_tasks
      (event_id,account_id,shop,contact_id,state,created_at) VALUES
      (1,'alice',$1,'c-a','completed',NOW() + interval '2 days'),
      (2,'alice',$1,'c-a','open',NOW()),
      (3,'bob',$1,'c-b','open',NOW()),
      (4,'alice',$2,'c-a-2','open',NOW())`, [shop,otherShop]);
    const tasks = (await db.execute(readOrderSupportTaskListQuery("alice",shop))).rows as Array<Record<string,unknown>>;
    assert.equal(tasks.length,2);
    assert.equal(tasks[0].state,"open","open tasks must come before completed even if older");
    assert.deepEqual(tasks.map(t=>t.contact_name), ["Alice Customer","Alice Customer"]);
    assert.deepEqual(tasks.map(t=>t.contact_id), ["c-a","c-a"]);
    const openId = String(tasks[0].id);
    assert.equal((await db.execute(markOrderSupportTaskCompleteQuery(openId,"bob",shop))).rows.length,0);
    assert.equal((await db.execute(markOrderSupportTaskCompleteQuery(openId,"alice",otherShop))).rows.length,0);
    const results = await Promise.all(Array.from({length:7},() => db.execute(markOrderSupportTaskCompleteQuery(openId,"alice",shop))));
    assert.equal(results.reduce((n,v)=>n+v.rows.length,0),1);
    const repeated=await db.execute(markOrderSupportTaskCompleteQuery(openId,"alice",shop));
    assert.equal(repeated.rows.length,0);
    const other = (await db.execute(readOrderSupportTaskListQuery("bob",shop))).rows;
    assert.equal(other.length,1);
    assert.equal(other[0].contact_name,"Bob Customer");
    // Foreign-contact task intentionally inserted to prove no PII leaked:
    await pool.query(`INSERT INTO ecommerce_growth_order_support_tasks
      (event_id,account_id,shop,contact_id) VALUES(5,'alice',$1,'c-b')`,[shop]);
    const owned=(await db.execute(readOrderSupportTaskListQuery("alice",shop))).rows;
    assert.equal(owned.length,2,"contact ownership join excludes any malformed foreign-contact task");
  } finally {
    await pool?.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(()=>{});
    await admin.end();
  }
});
