import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {classifyCommerceWebhook} from '../server/ecommerce/eventIntake';
import {recordCommerceEvent} from '../server/ecommerce/durableEventInbox';

const createTable=`
CREATE TABLE ecommerce_growth_event_inbox (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 account_id VARCHAR(128) NOT NULL, shop VARCHAR(255) NOT NULL,
 topic VARCHAR(64) NOT NULL, delivery_id VARCHAR(256) NOT NULL,
 journey VARCHAR(32) NOT NULL, state VARCHAR(16) NOT NULL DEFAULT 'pending',
 received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(account_id,shop,topic,delivery_id)
);`;
test('deduplicates delivery and keeps tenants isolated without storing webhook payload',async()=>{
 const db=new PGlite();
 try {
  await db.exec(createTable);
  const query={query:async(text:string,values?:readonly unknown[])=>{
    const r=await db.query(text,values ? [...values] : []);
    return {rows:r.rows as Array<{id:string;state:string}>};
  }};
  const evt=(accountId:string,webhookId:string)=>classifyCommerceWebhook({
    verified:true,accountId,webhookId,shopDomain:'demo.myshopify.com',topic:'orders/create'});
  assert.equal((await recordCommerceEvent(query,evt('a','same'))).status,'inserted');
  assert.deepEqual(await recordCommerceEvent(query,evt('a','same')),{status:'duplicate'});
  assert.equal((await recordCommerceEvent(query,evt('b','same'))).status,'inserted');
  const count=await db.query('SELECT count(*)::int AS count FROM ecommerce_growth_event_inbox');
  assert.equal((count.rows[0] as any).count,2);
  const raw=await db.query('SELECT * FROM ecommerce_growth_event_inbox');
  assert.equal(JSON.stringify(raw.rows).includes('email'),false);
 } finally {await db.close();}
});
test('unsupported or unverified deliveries never persist',async()=>{
 const db=new PGlite();
 try {
  await db.exec(createTable);
  const query={query:async(text:string,values?:readonly unknown[])=>{
    const r=await db.query(text,values ? [...values] : []);
    return {rows:r.rows as Array<{id:string;state:string}>};
  }};
  const event=classifyCommerceWebhook({verified:false,accountId:'a',webhookId:'b',shopDomain:'demo.myshopify.com',topic:'orders/create'});
  assert.deepEqual(await recordCommerceEvent(query,event),{status:'ignored'});
  const count=await db.query('SELECT count(*)::int AS count FROM ecommerce_growth_event_inbox');
  assert.equal((count.rows[0] as any).count,0);
 } finally {await db.close();}
});
