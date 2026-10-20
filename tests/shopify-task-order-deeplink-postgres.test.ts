import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { readOrderSupportTaskListQuery } from "../server/ecommerce/orderSupportMerchantControls";
import { readScheduledOrderSupportTaskListQuery } from "../server/ecommerce/orderTaskSchedule";
import { shopifyTaskContactHref } from "../shared/contactDetails";

const uuidA = "0dce2b31-1011-4455-8899-aaaabbbb1111";
const uuidB = "0dce2b31-1011-4455-8899-aaaabbbb2222";

test("task-to-order navigation is restricted to CRM contact order activity IDs", () => {
  assert.equal(shopifyTaskContactHref("customer-1", uuidA),
    `/app/contacts/customer-1?shopifyOrderEvent=${uuidA}`);
  assert.equal(shopifyTaskContactHref("customer-1", null), "/app/contacts/customer-1");
  assert.equal(shopifyTaskContactHref("customer-1", "https://outside.example"),"/app/contacts/customer-1");
  assert.equal(shopifyTaskContactHref("customer-1", "../other"),"/app/contacts/customer-1");

  const followups=readFileSync("client/src/components/followups/ShopifyOrderSupportTasks.tsx","utf8");
  const contacts=readFileSync("client/src/pages/ContactDetails.tsx","utf8");
  const preview=readFileSync("server/shopifyRoutes.ts","utf8");
  assert.match(followups,/shopifyTaskContactHref\(task.contactId, task.orderActivityId\)/);
  assert.match(followups,/task.orderActivityId \? "View order" : "View customer"/);
  assert.match(contacts,/shopifyOrderEvent/);
  assert.match(contacts,/order.id === selectedShopifyOrder/);
  assert.match(contacts,/shopify-order-/);
  assert.match(preview,/orderActivityId:row.order_activity_id/);
  assert.doesNotMatch(followups,/admin\.shopify\.com|orders\/edit/);
});

test("native PostgreSQL: exact matching delivery, account, shop and contact only; existing tasks unchanged",async()=>{
  const target=process.env.SHOPIFY_TEST_DATABASE_URL;
  assert.ok(target,"Requires local SHOPIFY_TEST_DATABASE_URL");
  const url=new URL(target);
  assert.ok(["localhost","127.0.0.1"].includes(url.hostname));
  assert.equal(url.pathname,"/whachat_shopify_test");
  const schema="shopify_task_order_link_test";
  const admin=new Pool({connectionString:target});
  let pool:Pool|undefined;
  try{
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`CREATE TABLE "${schema}".contacts(
      id VARCHAR PRIMARY KEY,user_id VARCHAR NOT NULL,name TEXT NOT NULL)`);
    await admin.query(`CREATE TABLE "${schema}".ecommerce_growth_event_inbox(
      id BIGINT PRIMARY KEY,account_id VARCHAR(128),shop VARCHAR(255),
      topic TEXT,delivery_id TEXT)`);
    await admin.query(`CREATE TABLE "${schema}".ecommerce_growth_order_support_tasks(
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,event_id BIGINT UNIQUE,
      account_id VARCHAR(128),shop VARCHAR(255),contact_id VARCHAR,
      state VARCHAR(16) DEFAULT 'open',created_at TIMESTAMPTZ DEFAULT NOW())`);
    await admin.query(`CREATE TABLE "${schema}".activity_events(
      id VARCHAR PRIMARY KEY,user_id VARCHAR NOT NULL,contact_id VARCHAR NOT NULL,
      event_type TEXT,event_data JSONB NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW())`);
    await admin.query(`CREATE TABLE "${schema}".ecommerce_growth_order_task_schedule(
      task_id BIGINT PRIMARY KEY,account_id VARCHAR(128),shop VARCHAR(255),
      assignee_user_id VARCHAR,due_at TIMESTAMPTZ,reminder_minutes INTEGER)`);
    url.searchParams.set("options",`-c search_path=${schema}`);
    pool=new Pool({connectionString:url.toString(),max:5});
    const db=drizzle(pool);
    const shop="store-one.myshopify.com";
    await pool.query(`INSERT INTO contacts(id,user_id,name) VALUES
      ('alice-c','alice','Alice'),('bob-c','bob','Bob'),('alice-other','alice','Other')`);
    await pool.query(`INSERT INTO ecommerce_growth_event_inbox(id,account_id,shop,topic,delivery_id) VALUES
      (1,'alice',$1,'orders/create','delivery-123'),
      (2,'alice',$1,'orders/create','delivery-456'),
      (3,'bob',$1,'orders/create','delivery-123'),
      (4,'alice','store-two.myshopify.com','orders/create','delivery-123')`,[shop]);
    await pool.query(`INSERT INTO ecommerce_growth_order_support_tasks(event_id,account_id,shop,contact_id,state) VALUES
      (1,'alice',$1,'alice-c','completed'),
      (2,'alice',$1,'alice-c','open'),
      (3,'bob',$1,'bob-c','open'),
      (4,'alice','store-two.myshopify.com','alice-other','open')`,[shop]);
    // Identical delivery IDs are not sufficient on their own. All four ownership
    // dimensions must match before any order reference is returned.
    await pool.query(`INSERT INTO activity_events(id,user_id,contact_id,event_type,event_data) VALUES
      ($1,'alice','alice-c','shopify_order_created',$2::jsonb),
      ($3,'bob','bob-c','shopify_order_created',$4::jsonb),
      ('activity-foreign-shop','alice','alice-c','shopify_order_created',$5::jsonb),
      ('activity-noise','alice','alice-c','shopify_customer_created',$6::jsonb)`,[
      uuidA,JSON.stringify({shop,shopifyEventId:"delivery-123",orderName:"#1004"}),
      uuidB,JSON.stringify({shop,shopifyEventId:"delivery-123",orderName:"#9999"}),
      JSON.stringify({shop:"store-two.myshopify.com",shopifyEventId:"delivery-456",orderName:"#WRONG"}),
      JSON.stringify({shop,shopifyEventId:"delivery-456",orderName:"#WRONG"})
    ]);
    const normal=(await db.execute(readOrderSupportTaskListQuery("alice",shop))).rows;
    const scheduled=(await db.execute(readScheduledOrderSupportTaskListQuery("alice",shop))).rows;
    assert.equal(normal.length,2);
    assert.equal(scheduled.length,2);
    for(const tasks of [normal,scheduled]){
      const open=tasks.find(t=>t.state==="open")!;
      const completed=tasks.find(t=>t.state==="completed")!;
      assert.equal(open.order_activity_id,null,"different delivery must not be linked");
      assert.equal(completed.order_activity_id,uuidA);
      assert.equal(completed.order_name,"#1004");
    }
    const bob=(await db.execute(readOrderSupportTaskListQuery("bob",shop))).rows;
    assert.equal(bob.length,1);
    assert.equal(bob[0].order_activity_id,uuidB);
    assert.equal(bob[0].order_name,"#9999");
    const other=(await db.execute(readOrderSupportTaskListQuery("alice","store-two.myshopify.com"))).rows;
    assert.equal(other.length,1);
    assert.equal(other[0].order_activity_id,null,"a different contact cannot be linked");
    const count=await pool.query("SELECT count(*)::int AS count FROM ecommerce_growth_order_support_tasks");
    assert.equal(count.rows[0].count,4,"viewing orders must not duplicate tasks");
  }finally{
    await pool?.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(()=>{});
    await admin.end();
  }
});
