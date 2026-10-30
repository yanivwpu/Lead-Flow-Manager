import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {grantSignedRecoveryConsentQuery,revokeSignedRecoveryConsentQuery,
  suppressRecoveryOutboxByContactQuery} from '../server/ecommerce/checkoutRecoveryInboundConsentQueries';
const SECRET='H'.repeat(40),SHOP='store.myshopify.com',PHONE='+15551234567';
const base={
 accountId:'tenant-a',shop:SHOP,phone:PHONE,secret:SECRET,
 eventAt:new Date('2026-10-20T12:00:00Z'),wamid:'wamid.HBgLMjI0MzQ1Njc4OTAA+/==',
};
const grant={...base,contactId:'contact-a',
 shopifyCustomerId:'gid://shopify/Customer/456',whatsappId:'15551234567'};
test('native PostgreSQL: signed opt-in evidence is ordered, scoped, replay safe and STOP kills queued sends',async()=>{
 const url=process.env.ECOMMERCE_TEST_DATABASE_URL || process.env.SHOPIFY_TEST_DATABASE_URL;
 if(!url)throw Error('shopify_test_postgres_required');
 const schema='ecommerce_signed_recovery_consent_test';
 const a=new Client({connectionString:url}),b=new Client({connectionString:url});
 await Promise.all([a.connect(),b.connect()]);
 try{
  await a.query('BEGIN');
  await a.query('CREATE SCHEMA '+schema);
  await a.query('SET LOCAL search_path='+schema);
  await a.query(await readFile('migrations/20261020_ecommerce_abandoned_checkout_observations.sql','utf8'));
  await a.query(await readFile('migrations/20261020_ecommerce_checkout_recovery_intents.sql','utf8'));
  await a.query('CREATE TABLE contacts(id VARCHAR(128),user_id VARCHAR(128),phone TEXT,whatsapp_id TEXT,custom_fields JSONB,source_details JSONB,automations_paused BOOLEAN NOT NULL DEFAULT FALSE)');
  await a.query(await readFile('migrations/20261020_ecommerce_whatsapp_recovery_delivery.sql','utf8'));
  await a.query(await readFile('migrations/20261020_ecommerce_recovery_signed_inbound_consent.sql','utf8'));
  await a.query('COMMIT');
  await Promise.all([a.query('SET search_path='+schema),b.query('SET search_path='+schema)]);
  const db=drizzle(a),db2=drizzle(b);
  await a.query("INSERT INTO contacts VALUES('contact-a','tenant-a',$1,'15551234567',$2,$3,FALSE)",[
    PHONE,JSON.stringify({shopifyCustomerId:'456',shopifyShop:SHOP}),JSON.stringify({})
  ]);
  await a.query("INSERT INTO contacts VALUES('contact-b','tenant-b',$1,'15551234567',$2,$3,FALSE)",[
    PHONE,JSON.stringify({shopifyCustomerId:'456',shopifyShop:'other.myshopify.com'}),JSON.stringify({})
  ]);
  const first=await db.execute(grantSignedRecoveryConsentQuery(grant));
  assert.equal(first.rows.length,1);
  assert.equal((await db.execute(grantSignedRecoveryConsentQuery(grant))).rows.length,0,'duplicate Meta WAMID replay');
  const older=await db2.execute(grantSignedRecoveryConsentQuery({
    ...grant,eventAt:new Date('2026-10-20T11:59:59Z'),wamid:'wamid.OlderMessage12345'
  }));
  assert.equal(older.rows.length,0,'stale opt-in replay');
  const other=await db2.execute(grantSignedRecoveryConsentQuery({
    ...grant,accountId:'tenant-b',shop:SHOP
  }));
  assert.equal(other.rows.length,0,'cross-tenant consent blocked');

  await a.query('INSERT INTO ecommerce_abandoned_checkout_observations(account_id,shop,checkout_gid,last_activity_at,next_review_at) VALUES($1,$2,$3,NOW(),NOW())',[
    'tenant-a',SHOP,'gid://shopify/AbandonedCheckout/123'
  ]);
  const intent=await a.query("INSERT INTO ecommerce_checkout_recovery_intents(account_id,shop,checkout_gid,status,verified_at) VALUES($1,$2,'gid://shopify/AbandonedCheckout/123','ready',NOW()) RETURNING id",['tenant-a',SHOP]);
  await a.query("INSERT INTO ecommerce_checkout_recovery_outbox(intent_id,account_id,shop,checkout_gid,contact_id,template_id,state) VALUES($1,$2,$3,'gid://shopify/AbandonedCheckout/123','contact-a','tpl','pending')",[intent.rows[0].id,'tenant-a',SHOP]);

  const stop=await db.execute(revokeSignedRecoveryConsentQuery({
    ...base,eventAt:new Date('2026-10-20T12:00:20Z'),wamid:'wamid.StopMessage123456+/=='
  }));
  assert.deepEqual(stop.rows.map(r=>r.contact_id),['contact-a']);
  const stopQuery=suppressRecoveryOutboxByContactQuery({
    accountId:'tenant-a',shop:SHOP,contactIds:['contact-a']});
  assert.ok(stopQuery);
  if(stopQuery)assert.equal((await db.execute(stopQuery)).rows.length,1);
  assert.equal((await db.execute(revokeSignedRecoveryConsentQuery({
    ...base,eventAt:new Date('2026-10-20T12:00:20Z'),wamid:'wamid.StopMessage123456+/=='
  }))).rows.length,0,'STOP webhook replay does not reapply');
  const lateGrant=await db.execute(grantSignedRecoveryConsentQuery(grant));
  assert.equal(lateGrant.rows.length,0,'old YES cannot override STOP');
  const rows=await a.query("SELECT revoked_at, last_verified_wamid FROM ecommerce_whatsapp_recovery_consents WHERE account_id='tenant-a'");
  assert.ok(rows.rows[0].revoked_at);
  assert.equal(rows.rows[0].last_verified_wamid,'wamid.StopMessage123456+/==');
  assert.equal((await a.query("SELECT state FROM ecommerce_checkout_recovery_outbox")).rows[0].state,'suppressed');

  const reOptIn=await db.execute(grantSignedRecoveryConsentQuery({...grant,
    eventAt:new Date('2026-10-20T12:01:00Z'),wamid:'wamid.FreshYesMessage123'}));
  assert.equal(reOptIn.rows.length,1,'only a newer explicit YES regrants consent');
  const after=await a.query("SELECT revoked_at FROM ecommerce_whatsapp_recovery_consents WHERE contact_id='contact-a'");
  assert.equal(after.rows[0].revoked_at,null);
  const sameSecondStop={...base,eventAt:new Date('2026-10-20T12:01:00Z'),wamid:'wamid.SameSecondStop123'};
  assert.equal((await db.execute(revokeSignedRecoveryConsentQuery(sameSecondStop))).rows.length,1,
    'STOP wins over YES with the same provider timestamp');
  assert.equal((await db.execute(grantSignedRecoveryConsentQuery({...grant,
    eventAt:sameSecondStop.eventAt,wamid:'wamid.SameSecondYes1234'}))).rows.length,0);
  assert.equal((await a.query("SELECT state FROM ecommerce_checkout_recovery_outbox")).rows[0].state,'suppressed',
    're-opt-in cannot resurrect a previously suppressed send');
 }finally{
  await b.end();
  await a.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE').catch(()=>{});
  await a.end();
 }
});
