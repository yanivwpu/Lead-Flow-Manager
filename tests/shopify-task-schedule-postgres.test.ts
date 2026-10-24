import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  parseTaskScheduleChange, saveTaskScheduleQuery, readScheduledOrderSupportTaskListQuery,
} from "../server/ecommerce/orderTaskSchedule";

const t0=Date.parse("2026-10-20T00:00:00Z");
const change=(args:Record<string,unknown>={}) => ({
  action:"schedule_internal_order_task",taskId:"1",
  assigneeUserId:"alice",dueAt:"2026-10-20T12:00:00Z",reminderMinutes:60,...args,
});
test("schedule API parser rejects malformed payloads and unreasonable dates",()=>{
  assert.ok(parseTaskScheduleChange(change(),t0));
  assert.equal(parseTaskScheduleChange(change({dueAt:null,reminderMinutes:null}),t0)?.dueAt,null);
  for(const invalid of [
    change({taskId:"0"}), change({assigneeUserId:"bob@example.com"}),
    change({dueAt:"2027-11-20T12:00:00Z"}),
    change({dueAt:"2026-10-20T12:00:00"}),
    change({reminderMinutes:1}),change({reminderMinutes:60,dueAt:null}),
    change({shop:"foreign"}),change({accountId:"bob"}),
    change({action:"send_message"}),change({assigneeUserId:42})
  ]) assert.equal(parseTaskScheduleChange(invalid,t0),null);
  const source=readFileSync("server/ecommercePilotRoutes.ts","utf8");
  const start=source.indexOf("router.post('/order-support-task-schedule'");
  const end=source.indexOf("export default router",start);
  assert.ok(start>=0&&end>start);
  const code=source.slice(start,end);
  for(const snippet of [
    "parseTaskScheduleChange(req.body)","taskScheduleReady(ready.rows[0])",
    "saveTaskScheduleQuery(change,accountId,shop)",
    "isShopifyContactInstallationActive(owner)"
  ]) assert.ok(code.includes(snippet),snippet);
  for(const forbidden of ["sendMessage","triggerCommerceEventWorkflows","cartCreate(",
    "req.body.accountId","req.body.shop","followUpDate","sendWhatsApp"]) assert.equal(code.includes(forbidden),false,forbidden);
});
test("native PG schedule: tenant-safe active-member assignment, reminder due, unchanged source task",async()=>{
  const target=process.env.SHOPIFY_TEST_DATABASE_URL;
  assert.ok(target,"Need isolated SHOPIFY_TEST_DATABASE_URL");
  const url=new URL(target);
  assert.ok(["localhost","127.0.0.1"].includes(url.hostname));
  assert.equal(url.pathname,"/whachat_shopify_test");
  const schema="shopify_task_schedule_postgres_test";
  const admin=new Pool({connectionString:target});
  let pool:Pool|undefined;
  try{
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`CREATE TABLE "${schema}".users(id VARCHAR PRIMARY KEY)`);
    await admin.query(`CREATE TABLE "${schema}".team_members (
      id VARCHAR PRIMARY KEY,owner_id VARCHAR,member_id VARCHAR,status TEXT)`);
    await admin.query(`CREATE TABLE "${schema}".contacts(id VARCHAR PRIMARY KEY,user_id VARCHAR,name TEXT)`);
    await admin.query(`CREATE TABLE "${schema}".ecommerce_growth_order_support_tasks(
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      event_id BIGINT UNIQUE,account_id VARCHAR(128),shop VARCHAR(255),
      contact_id VARCHAR,state VARCHAR(16) DEFAULT 'open',
      created_at TIMESTAMPTZ DEFAULT NOW())`);
    await admin.query(`CREATE TABLE "${schema}".ecommerce_growth_event_inbox (
      id BIGINT PRIMARY KEY, account_id VARCHAR(128), shop VARCHAR(255),
      topic TEXT, delivery_id TEXT)`);
    await admin.query(`CREATE TABLE "${schema}".activity_events (
      id VARCHAR PRIMARY KEY, user_id VARCHAR NOT NULL, contact_id VARCHAR NOT NULL,
      event_type TEXT NOT NULL, event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW())`);
    url.searchParams.set("options",`-c search_path=${schema}`);
    pool=new Pool({connectionString:url.toString(),max:9});
    const db=drizzle(pool);
    await pool.query("INSERT INTO users(id) VALUES ('alice'),('member'),('inactive'),('bob')");
    await pool.query(`INSERT INTO team_members(id,owner_id,member_id,status) VALUES
      ('1','alice','member','active'),('2','alice','inactive','inactive'),('3','bob','bob','active')`);
    await pool.query(`INSERT INTO contacts(id,user_id,name) VALUES
      ('contact-alice','alice','Owned'),('contact-bob','bob','Other')`);
    await pool.query(`INSERT INTO ecommerce_growth_order_support_tasks(event_id,account_id,shop,contact_id,state) VALUES
      (101,'alice','whachatcrm.myshopify.com','contact-alice','open'),
      (102,'alice','whachatcrm.myshopify.com','contact-alice','completed'),
      (103,'bob','whachatcrm.myshopify.com','contact-bob','open'),
      (104,'alice','other.myshopify.com','contact-alice','open')`);
    const ddl=readFileSync("migrations/20261020_ecommerce_task_schedule_staging.sql","utf8");
    await pool.query(ddl);
    await pool.query(ddl);
    const shop="whachatcrm.myshopify.com";
    const build=(input:Record<string,unknown>)=>{
      const q=parseTaskScheduleChange(change(input),t0);
      assert.ok(q);return q;
    };
    const save=async(input:Record<string,unknown>,account="alice",site=shop)=>
      (await db.execute(saveTaskScheduleQuery(build(input),account,site))).rows.length;
    assert.equal(await save({assigneeUserId:"inactive"}),0);
    assert.equal(await save({assigneeUserId:"bob"}),0);
    assert.equal(await save({},"bob"),0);
    assert.equal(await save({},"alice","other.myshopify.com"),0);
    assert.equal(await save({taskId:"2"}),0,"completed tasks immutable");
    assert.equal(await save({assigneeUserId:"member"}),1);
    assert.equal(await save({assigneeUserId:"member",reminderMinutes:15}),1);
    const rows=(await db.execute(readScheduledOrderSupportTaskListQuery("alice",shop))).rows;
    assert.equal(rows.length,2);
    assert.equal(rows[0].assignee_user_id,"member");
    assert.equal(rows[0].reminder_minutes,15);
    assert.equal(rows[1].due_at,null,"existing completed task untouched");
    assert.equal((await db.execute(readScheduledOrderSupportTaskListQuery("bob",shop))).rows.length,1);
    const base=await pool.query("SELECT count(*) AS cnt FROM ecommerce_growth_order_support_tasks");
    assert.equal(Number(base.rows[0].cnt),4,"no duplicate tasks created");
    assert.equal(await save({assigneeUserId:null,dueAt:null,reminderMinutes:null}),1);
    const cleared=(await db.execute(readScheduledOrderSupportTaskListQuery("alice",shop))).rows[0];
    assert.equal(cleared.assignee_user_id,null);
    assert.equal(cleared.due_at,null);
    const count=(await pool.query("SELECT count(*) AS count FROM ecommerce_growth_order_task_schedule")).rows[0].count;
    assert.equal(Number(count),1,"upserts update one metadata row");
  }finally{
    await pool?.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(()=>{});
    await admin.end();
  }
});
