import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {recoveryRuntimeSchemaReadyQuery} from '../server/ecommerce/checkoutRecoverySchema';
import {upsertCheckoutObservationQuery} from '../server/ecommerce/checkoutObservationQueries';
import {prepareCheckoutRecoveryIntentQuery} from '../server/ecommerce/checkoutRecoveryIntents';
import {enqueueRecoveryDeliveryQuery,claimRecoveryDeliveryQuery,settleRecoveryDeliveryQuery,suppressPendingRecoveryDeliveryQuery,fenceRecoveryProviderAttemptQuery} from '../server/ecommerce/checkoutRecoveryOutbox';

test('Postgres: consent-scoped recovery is unique, claimed once and never automatically retried after uncertainty',async()=>{
 const url=process.env.ECOMMERCE_TEST_DATABASE_URL || process.env.SHOPIFY_TEST_DATABASE_URL;
 if(!url)throw Error('ecommerce_postgres_test_connection_required');
 const schema='ecommerce_recovery_delivery_fixture';
 const clients=[new Client({connectionString:url}),new Client({connectionString:url}),new Client({connectionString:url})];
 await Promise.all(clients.map(c=>c.connect()));
 const [admin,first,second]=clients;
 try{
  await admin.query('BEGIN');
  await admin.query('CREATE SCHEMA '+schema);
  await admin.query('SET LOCAL search_path='+schema);
  await admin.query(await readFile('migrations/20261020_ecommerce_abandoned_checkout_observations.sql','utf8'));
  await admin.query(await readFile('migrations/20261020_ecommerce_checkout_recovery_intents.sql','utf8'));
  await admin.query('CREATE TABLE contacts(id VARCHAR(128), user_id VARCHAR(128), custom_fields JSONB, source_details JSONB, automations_paused BOOLEAN NOT NULL DEFAULT FALSE)');
  await admin.query('CREATE TABLE message_templates(id VARCHAR(128), user_id VARCHAR(128), category TEXT, status TEXT)');
  await admin.query(await readFile('migrations/20261020_ecommerce_whatsapp_recovery_delivery.sql','utf8'));
  await admin.query(await readFile('migrations/20261028_ecommerce_recovery_provider_attempt.sql','utf8'));
  await admin.query('COMMIT');
  for(const c of [first,second])await c.query('SET search_path='+schema);
  const a=drizzle(first),b=drizzle(second);
  assert.equal((await a.execute(recoveryRuntimeSchemaReadyQuery(schema))).rows[0].ready,false,
    'four tables without signed consent/receipt columns cannot be ready');
  await first.query(await readFile('migrations/20261020_ecommerce_recovery_signed_inbound_consent.sql','utf8'));
  await first.query(await readFile('migrations/20261020_ecommerce_recovery_meta_receipts.sql','utf8'));
  assert.equal((await a.execute(recoveryRuntimeSchemaReadyQuery(schema))).rows[0].ready,true);
  const tenant='tenant-a',shop='store.myshopify.com',checkoutId='gid://shopify/AbandonedCheckout/123',shopper='gid://shopify/Customer/456';
  const key={accountId:tenant,shop,checkoutId};
  await a.execute(upsertCheckoutObservationQuery({accountId:tenant,shop,snapshot:{
    checkoutId,lastActivityAt:'2026-10-20T10:00:00Z',completed:false,hasRecoveryUrl:true
  }}));
  await admin.query("UPDATE "+schema+".ecommerce_abandoned_checkout_observations SET next_review_at=NOW()-INTERVAL '1 minute'");
  await a.execute(prepareCheckoutRecoveryIntentQuery({...key,verifiedLastActivityAt:'2026-10-20T10:00:00Z'}));
  await admin.query("INSERT INTO "+schema+".contacts(id,user_id,custom_fields,source_details) VALUES ($1,$2,$3,$4)",[
    'contact-1',tenant,JSON.stringify({shopifyCustomerId:'456',shopifyShop:shop}),JSON.stringify({})
  ]);
  await admin.query("INSERT INTO "+schema+".message_templates(id,user_id,category,status) VALUES('tpl-1','tenant-a','marketing','approved')");
  const params=[tenant,shop,'contact-1',shopper,'verified_whatsapp_explicit_opt_in','a'.repeat(64)];
  await admin.query("INSERT INTO "+schema+".ecommerce_whatsapp_recovery_consents(account_id,shop,contact_id,shopify_customer_gid,evidence_source,recipient_hmac,granted_at) VALUES($1,$2,$3,$4,$5,$6,NOW())",params);
  const enqueue={...key,contactId:'contact-1',shopifyCustomerId:shopper,templateId:'tpl-1'};
  const copies=await Promise.all([a.execute(enqueueRecoveryDeliveryQuery(enqueue)),b.execute(enqueueRecoveryDeliveryQuery(enqueue))]);
  assert.deepEqual(copies.map(x=>x.rows.length).sort(),[0,1]);
  const rejected=await a.execute(enqueueRecoveryDeliveryQuery({...enqueue,accountId:'tenant-b'}));
  assert.equal(rejected.rows.length,0,'tenant isolation');
  await admin.query("UPDATE "+schema+".message_templates SET status='pending'");
  const pendingTemplate=await a.execute(enqueueRecoveryDeliveryQuery({...enqueue,checkoutId:'gid://shopify/AbandonedCheckout/999'}));
  assert.equal(pendingTemplate.rows.length,0);
  const claims=await Promise.all([a.execute(claimRecoveryDeliveryQuery({accountId:tenant,shop})),
    b.execute(claimRecoveryDeliveryQuery({accountId:tenant,shop}))]);
  assert.deepEqual(claims.map(x=>x.rows.length).sort(),[0,1]);
  const claim=claims.flatMap(x=>x.rows)[0];
  assert.ok(claim.claim_token);
  const attempt={id:String(claim.id),accountId:tenant,shop,claimToken:String(claim.claim_token)};
  assert.equal((await b.execute(fenceRecoveryProviderAttemptQuery({...attempt,accountId:'tenant-b'}))).rows.length,0);
  const attempts=await Promise.all([a.execute(fenceRecoveryProviderAttemptQuery(attempt)),
    b.execute(fenceRecoveryProviderAttemptQuery(attempt))]);
  assert.deepEqual(attempts.map(r=>r.rows.length).sort(),[0,1],'one provider attempt even for duplicate claimed-token callers');
  await first.query('BEGIN');
  await first.query('ROLLBACK'); // Simulated failure of the subsequent provider transaction.
  assert.equal((await b.execute(fenceRecoveryProviderAttemptQuery(attempt))).rows.length,0,
    'provider transaction rollback never permits resend');
  const noDouble=await a.execute(claimRecoveryDeliveryQuery({accountId:tenant,shop}));
  assert.equal(noDouble.rows.length,0);
  const failClosed=await a.execute(settleRecoveryDeliveryQuery({id:String(claim.id),accountId:tenant,
    shop,claimToken:String(claim.claim_token),outcome:'uncertain'}));
  assert.equal(failClosed.rows.length,1);
  const noRetry=await b.execute(claimRecoveryDeliveryQuery({accountId:tenant,shop}));
  assert.equal(noRetry.rows.length,0);
  const cannotPretendAccepted=await a.execute(settleRecoveryDeliveryQuery({id:String(claim.id),
    accountId:tenant,shop,claimToken:String(claim.claim_token),outcome:'accepted',providerMessageId:'fake-meta-id'}));
  assert.equal(cannotPretendAccepted.rows.length,0);
  const counts=await admin.query("SELECT state, count(*)::int AS n FROM "+schema+".ecommerce_checkout_recovery_outbox GROUP BY state");
  assert.deepEqual(counts.rows,[{state:'uncertain',n:1}]);
  assert.throws(()=>settleRecoveryDeliveryQuery({id:String(claim.id),accountId:tenant,shop,
    claimToken:String(claim.claim_token),outcome:'accepted'}));
  assert.throws(()=>enqueueRecoveryDeliveryQuery({...enqueue,shop:'external.test'}));
  const dontUndo=await a.execute(suppressPendingRecoveryDeliveryQuery(key));
  assert.equal(dontUndo.rows.length,0,'provider-uncertain status cannot silently become pending');
 }finally{
  await first.end();await second.end();
  await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE').catch(()=>{});
  await admin.end();
 }
});
