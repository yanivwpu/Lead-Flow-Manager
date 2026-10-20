import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { saveWorkflowDraftQuery, readWorkflowDraftSettings } from "../server/ecommerce/workflowDraftSettings";
import { readOrderTaskMerchantSettingsQuery, saveOrderTaskMerchantOptInQuery } from "../server/ecommerce/orderSupportMerchantControls";

test("native PostgreSQL: Shopify start is atomic, tenant-bound, idempotent and rollback safe", async() => {
  const urlText=process.env.SHOPIFY_TEST_DATABASE_URL;
  assert.ok(urlText,"Needs isolated SHOPIFY_TEST_DATABASE_URL");
  const url=new URL(urlText);
  assert.ok(["localhost","127.0.0.1"].includes(url.hostname));
  assert.equal(url.pathname,"/whachat_shopify_test");
  const schema="shopify_quick_start_test";
  const admin=new Pool({connectionString:urlText});
  let pool:Pool|undefined;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`CREATE TABLE "${schema}".integrations (
      id text PRIMARY KEY, user_id text NOT NULL, type text NOT NULL,
      is_active boolean NOT NULL, config jsonb NOT NULL DEFAULT '{}'::jsonb)`);
    await admin.query(`CREATE TABLE "${schema}".ecommerce_growth_order_task_settings (
      account_id varchar(128) NOT NULL, shop varchar(255) NOT NULL,
      tasks_enabled boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(account_id,shop))`);
    await admin.query(`CREATE TABLE "${schema}".ecommerce_growth_order_support_tasks (
      id bigint generated always as identity PRIMARY KEY, event_id bigint NOT NULL UNIQUE,
      account_id varchar(128) NOT NULL, shop varchar(255) NOT NULL,
      contact_id varchar NOT NULL, state varchar(16) NOT NULL DEFAULT 'open')`);
    url.searchParams.set("options",`-c search_path=${schema}`);
    pool=new Pool({connectionString:url.toString(),max:5});
    const db=drizzle(pool);
    const shop="one.myshopify.com";
    await pool.query(`INSERT INTO integrations(id,user_id,type,is_active,config) VALUES
      ('own','alice','shopify',true,$1::jsonb),('other','bob','shopify',true,$2::jsonb)`,
      [JSON.stringify({shop,syncOptions:["new_orders"],secretFixture:"unchanged"}),
       JSON.stringify({shop:"two.myshopify.com",syncOptions:["new_orders"]})]);
    const readDraft=async(id:string) => {
      const result=await pool!.query("SELECT config FROM integrations WHERE id=$1",[id]);
      return result.rows[0].config;
    };
    const readEnabled=async()=> (await db.execute(readOrderTaskMerchantSettingsQuery("alice",shop))).rows[0].enabled;
    const start=async (accountId="alice",targetShop=shop,integrationId="own",failAfterDraft=false) =>
      db.transaction(async tx=>{
        const draft=await tx.execute(saveWorkflowDraftQuery({
          integrationId,accountId,shop:targetShop,journey:"orderSupport",prepared:true
        }));
        if(draft.rows.length!==1)throw new Error("not-owned");
        if(failAfterDraft)throw new Error("simulate-crash-before-opt-in");
        const enabled=await tx.execute(saveOrderTaskMerchantOptInQuery(accountId,targetShop,true));
        if(enabled.rows.length!==1)throw new Error("opt-in failed");
      });
    assert.equal(await readEnabled(),false);
    await assert.rejects(start("alice",shop,"own",true));
    assert.equal(readWorkflowDraftSettings(await readDraft("own")).orderSupport,false,
      "crash before opt-in must not leave draft prepared");
    assert.equal(await readEnabled(),false);
    await assert.rejects(start("bob",shop,"own"));
    assert.equal(await readEnabled(),false);
    await start();
    await start();
    assert.equal(readWorkflowDraftSettings(await readDraft("own")).orderSupport,true);
    assert.equal((await readDraft("own")).secretFixture,"unchanged");
    assert.equal(await readEnabled(),true);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM ecommerce_growth_order_task_settings")).rows[0].count,1);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM ecommerce_growth_order_support_tasks")).rows[0].count,0,
      "starting setup may not replay old events or create tasks");
    assert.equal(readWorkflowDraftSettings(await readDraft("other")).orderSupport,false);
  } finally {
    await pool?.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(()=>{});
    await admin.end();
  }
});
