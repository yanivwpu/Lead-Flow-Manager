import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import { recoveryCustomerErasureQueries,recoveryStoreErasureQueries,
 recoveryUninstallQueries,parseRecoveryTableAvailability
} from '../server/ecommerce/checkoutRecoveryPrivacyQueries';
const ready={observations:true,intents:true,outbox:true,consents:true};
test('PostgreSQL: Shopify customer erasure, uninstall and store redact are scoped and ordered',async()=>{
 const url=process.env.ECOMMERCE_TEST_DATABASE_URL||process.env.SHOPIFY_TEST_DATABASE_URL;
 if(!url)throw Error('recovery_privacy_test_postgres_required');
 const schema='ecommerce_recovery_privacy_fixture';
 const client=new Client({connectionString:url});await client.connect();
 try{
  await client.query('BEGIN');
  await client.query('CREATE SCHEMA '+schema);
  await client.query('SET LOCAL search_path='+schema);
  for(const migration of [
    'migrations/20261020_ecommerce_abandoned_checkout_observations.sql',
    'migrations/20261020_ecommerce_checkout_recovery_intents.sql',
    'migrations/20261020_ecommerce_whatsapp_recovery_delivery.sql',
  ])await client.query(await readFile(migration,'utf8'));
  await client.query('COMMIT');
  await client.query('SET search_path='+schema);
  const db=drizzle(client);
  async function seed(account:string,shop:string,contact:string,cust:string,checkout:string){
    const id='gid://shopify/AbandonedCheckout/'+checkout;
    await client.query('INSERT INTO ecommerce_abandoned_checkout_observations (account_id,shop,checkout_gid,last_activity_at,next_review_at) VALUES($1,$2,$3,NOW(),NOW())',[account,shop,id]);
    const r=await client.query("INSERT INTO ecommerce_checkout_recovery_intents (account_id,shop,checkout_gid,status,verified_at) VALUES($1,$2,$3,'ready',NOW()) RETURNING id",[account,shop,id]);
    await client.query("INSERT INTO ecommerce_whatsapp_recovery_consents(account_id,shop,contact_id,shopify_customer_gid,evidence_source,recipient_hmac,granted_at) VALUES($1,$2,$3,$4,'verified_whatsapp_explicit_opt_in',$5,NOW())",[account,shop,contact,'gid://shopify/Customer/'+cust,'f'.repeat(64)]);
    await client.query("INSERT INTO ecommerce_checkout_recovery_outbox(intent_id,account_id,shop,checkout_gid,contact_id,template_id) VALUES($1,$2,$3,$4,$5,'template-1')",[r.rows[0].id,account,shop,id,contact]);
  }
  const store='store-a.myshopify.com',other='store-b.myshopify.com';
  await seed('tenant-a',store,'a','456','123');
  await seed('tenant-a',store,'b','789','124');
  await seed('tenant-b',other,'c','456','125');
  for(const q of recoveryCustomerErasureQueries({accountId:'tenant-a',shop:store,contactIds:[],shopifyCustomerIds:['456']},ready))
    await db.execute(q);
  let rows=await client.query("SELECT contact_id FROM ecommerce_checkout_recovery_outbox ORDER BY contact_id");
  assert.deepEqual(rows.rows.map(r=>r.contact_id),['b','c']);
  rows=await client.query("SELECT contact_id FROM ecommerce_whatsapp_recovery_consents ORDER BY contact_id");
  assert.deepEqual(rows.rows.map(r=>r.contact_id),['b','c']);
  for(const q of recoveryUninstallQueries('tenant-a',store,ready))await db.execute(q);
  rows=await client.query("SELECT contact_id,state FROM ecommerce_checkout_recovery_outbox ORDER BY contact_id");
  assert.deepEqual(rows.rows,[{contact_id:'b',state:'suppressed'},{contact_id:'c',state:'pending'}]);
  rows=await client.query("SELECT contact_id,revoked_at IS NOT NULL AS revoked FROM ecommerce_whatsapp_recovery_consents ORDER BY contact_id");
  assert.deepEqual(rows.rows,[{contact_id:'b',revoked:true},{contact_id:'c',revoked:false}]);
  for(const q of recoveryStoreErasureQueries(store,ready))await db.execute(q);
  for(const table of ['ecommerce_checkout_recovery_outbox','ecommerce_whatsapp_recovery_consents',
   'ecommerce_checkout_recovery_intents','ecommerce_abandoned_checkout_observations']){
    const remaining=await client.query('SELECT DISTINCT shop FROM '+table);
    assert.deepEqual(remaining.rows,[{shop:other}],table);
  }
  assert.deepEqual(recoveryStoreErasureQueries(store,parseRecoveryTableAvailability({})),[]);
  assert.deepEqual(recoveryCustomerErasureQueries({accountId:'tenant-a',shop:store,contactIds:[],shopifyCustomerIds:[]},ready),[]);
  assert.throws(()=>recoveryStoreErasureQueries('bad.shop',ready));
 }finally{
   await client.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE').catch(()=>{});
   await client.end();
 }
});
test('existing privacy handlers include recovery erasure and uninstall hooks',async()=>{
 const f=await readFile('server/shopifyPrivacyRedaction.ts','utf8');
 const u=await readFile('server/shopifyContactService.ts','utf8');
 const c=await readFile('server/shopifyPrivacyRequests.ts','utf8');
 assert.ok(f.includes('recoveryStoreErasureQueries'));
 assert.ok(u.includes('recoveryUninstallQueries'));
 assert.ok(c.includes('recoveryCustomerErasureQueries'));
});
