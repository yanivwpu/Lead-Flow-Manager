import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { saveWorkflowDraftQuery, readWorkflowDraftSettings } from "../server/ecommerce/workflowDraftSettings";

test("real PostgreSQL: draft preferences are per-merchant, atomic, non-destructive and reject other shops", async()=>{
  const target=process.env.SHOPIFY_TEST_DATABASE_URL;
  assert.ok(target, "isolated SHOPIFY_TEST_DATABASE_URL required; never a live DATABASE_URL");
  const url=new URL(target);
  assert.ok(["localhost","127.0.0.1"].includes(url.hostname),"loopback only");
  assert.equal(url.pathname,"/whachat_shopify_test");
  const schema="ecommerce_workflow_draft_test";
  const admin=new Pool({connectionString:target});
  let pool:Pool|undefined;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`CREATE TABLE "${schema}".integrations (
      id text PRIMARY KEY, user_id text NOT NULL, type text NOT NULL,
      is_active boolean NOT NULL, config jsonb NOT NULL DEFAULT '{}'::jsonb
    )`);
    url.searchParams.set("options",`-c search_path=${schema}`);
    pool=new Pool({connectionString:url.toString(),max:12});
    const database=drizzle(pool);
    const insert=async(id:string,user:string,shop:string)=>{
      await pool!.query("INSERT INTO integrations(id,user_id,type,is_active,config) VALUES($1,$2,'shopify',true,$3::jsonb)",
        [id,user,JSON.stringify({shop,syncOptions:["new_orders","new_customers"],secretFixture:"preserve-only"})]);
    };
    await insert("owned","account-a","one.myshopify.com");
    await insert("foreign","account-b","two.myshopify.com");
    const change=(journey:"orderSupport"|"fulfillmentSupport"|"abandonedCart",prepared:boolean,accountId="account-a",shop="one.myshopify.com",integrationId="owned") =>
      database.execute(saveWorkflowDraftQuery({integrationId,accountId,shop,journey,prepared})).catch((error: unknown) => { throw (error as { cause?: unknown }).cause ?? error; });
    assert.equal((await change("orderSupport",true,"account-b")).rows.length,0);
    assert.equal((await change("orderSupport",true,"account-a","two.myshopify.com")).rows.length,0);
    assert.equal((await change("orderSupport",true,"account-a","one.myshopify.com","foreign")).rows.length,0);
    assert.equal((await change("orderSupport",true)).rows.length,1);
    const parallel=await Promise.all([change("fulfillmentSupport",true),change("abandonedCart",true)]);
    assert.ok(parallel.every(x=>x.rows.length===1));
    let res=await pool.query("SELECT config FROM integrations WHERE id='owned'");
    assert.deepEqual(readWorkflowDraftSettings(res.rows[0].config),{
      orderSupport:true,fulfillmentSupport:true,orderCancelled:false,abandonedCart:true});
    assert.deepEqual(res.rows[0].config.syncOptions,["new_orders","new_customers"]);
    assert.equal(res.rows[0].config.secretFixture,"preserve-only");
    assert.equal((await change("orderSupport",false)).rows.length,1);
    res=await pool.query("SELECT config FROM integrations WHERE id='owned'");
    assert.deepEqual(readWorkflowDraftSettings(res.rows[0].config),{
      orderSupport:false,fulfillmentSupport:true,orderCancelled:false,abandonedCart:true});
    const other=await pool.query("SELECT config FROM integrations WHERE id='foreign'");
    assert.deepEqual(readWorkflowDraftSettings(other.rows[0].config),{
      orderSupport:false,fulfillmentSupport:false,orderCancelled:false,abandonedCart:false});
    await pool.query("UPDATE integrations SET is_active = false WHERE id = 'owned'");
    assert.equal((await change("orderSupport",true)).rows.length,0);
  } finally {
    await pool?.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(()=>{});
    await admin.end();
  }
});
