import test from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { savePostPurchasePlanQuery } from '../server/ecommerce/postPurchasePlans';
import { readPostPurchasePlans } from '../shared/postPurchase';

test('real PostgreSQL: post-purchase plans preserve drafts/tokens and serialize concurrent journey edits',async()=>{
  const target=process.env.SHOPIFY_TEST_DATABASE_URL;
  assert.ok(target,'isolated test database required');const url=new URL(target);
  assert.ok(['localhost','127.0.0.1'].includes(url.hostname));assert.equal(url.pathname,'/whachat_shopify_test');
  const schema='post_purchase_plans_test';const admin=new Pool({connectionString:target});let pool:Pool|undefined;
  try{
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(`CREATE TABLE ${schema}.integrations(id text PRIMARY KEY,user_id text,type text,is_active boolean,config jsonb)`);
    url.searchParams.set('options',`-c search_path=${schema}`);pool=new Pool({connectionString:url.toString(),max:8});
    const db=drizzle(pool);
    await pool.query(`INSERT INTO integrations VALUES ('owned','a','shopify',true,$1),('foreign','b','shopify',true,$2)`,[
      JSON.stringify({shop:'one.myshopify.com',token:'fixture',ecommerceGrowthEngineDrafts:{fulfillmentSupport:true}}),
      JSON.stringify({shop:'two.myshopify.com'}),
    ]);
    const save=(journey:'orderConfirmation'|'winBack',accountId='a',shop='one.myshopify.com')=>db.execute(savePostPurchasePlanQuery({integrationId:'owned',accountId,shop,journey,plan:{selected:true,delayMinutes:10}}));
    assert.equal((await save('winBack','b')).rows.length,0);
    assert.equal((await save('winBack','a','two.myshopify.com')).rows.length,0);
    await Promise.all([save('orderConfirmation'),save('winBack')]);
    const {rows}=await pool.query("SELECT config FROM integrations WHERE id='owned'");
    const plans=readPostPurchasePlans(rows[0].config);
    assert.ok(plans.orderConfirmation.selected && plans.winBack.selected);
    assert.equal(plans.reviewRequest.selected,false);assert.equal(rows[0].config.token,'fixture');
    assert.deepEqual(rows[0].config.ecommerceGrowthEngineDrafts,{fulfillmentSupport:true});
    const foreign=await pool.query("SELECT config FROM integrations WHERE id='foreign'");
    assert.ok(Object.values(readPostPurchasePlans(foreign.rows[0].config)).every(p=>!p.selected));
    await pool.query("UPDATE integrations SET is_active=false WHERE id='owned'");
    assert.equal((await save('winBack')).rows.length,0);
  }finally{await pool?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
});
