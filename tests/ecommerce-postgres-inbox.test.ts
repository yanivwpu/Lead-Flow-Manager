import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {classifyCommerceWebhook} from '../server/ecommerce/eventIntake';
import {recordCommerceEvent} from '../server/ecommerce/durableEventInbox';

test('native PostgreSQL: migrated event inbox deduplicates concurrent deliveries',async()=>{
 const url=process.env.ECOMMERCE_TEST_DATABASE_URL;
 if(!url) throw Error('ECOMMERCE_TEST_DATABASE_URL_required');
 const admin=new Client({connectionString:url}),first=new Client({connectionString:url}),second=new Client({connectionString:url});
 await admin.connect(); await first.connect(); await second.connect();
 try {
  await admin.query('BEGIN');
  await admin.query('CREATE SCHEMA ecommerce_growth_test');
  await admin.query('SET LOCAL search_path=ecommerce_growth_test');
  const ddl=await readFile('migrations/20261019_ecommerce_growth_event_inbox.sql','utf8');
  await admin.query(ddl);
  await admin.query('COMMIT');
  for(const c of [first,second]) await c.query('SET search_path=ecommerce_growth_test');
  const event=classifyCommerceWebhook({verified:true,accountId:'account1',shopDomain:'shop.myshopify.com',topic:'orders/create',webhookId:'same-delivery'});
  const db1={query:async(sql:string,values?:readonly unknown[])=>({rows:(await first.query(sql,values as unknown[])).rows})};
  const db2={query:async(sql:string,values?:readonly unknown[])=>({rows:(await second.query(sql,values as unknown[])).rows})};
  const results=await Promise.all([recordCommerceEvent(db1,event),recordCommerceEvent(db2,event)]);
  assert.deepEqual(results.map(x=>x.status).sort(),['duplicate','inserted']);
  const rows=await admin.query('SELECT account_id,shop,topic,delivery_id,journey,state FROM ecommerce_growth_test.ecommerce_growth_event_inbox');
  assert.equal(rows.rowCount,1);
  assert.equal(rows.rows[0].state,'pending');
  assert.equal(rows.rows[0].journey,'order_support');
  assert.deepEqual(Object.keys(rows.rows[0]).sort(),['account_id','delivery_id','journey','shop','state','topic'].sort());
 } finally {
  await first.end();await second.end();
  await admin.query('DROP SCHEMA IF EXISTS ecommerce_growth_test CASCADE').catch(()=>{});
  await admin.end();
 }
});
