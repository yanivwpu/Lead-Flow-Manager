import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {
  prepareCheckoutRecoveryIntentQuery,
  suppressCheckoutRecoveryIntentQuery,
  suppressCompletedCheckoutIntentQuery,
} from '../server/ecommerce/checkoutRecoveryIntents';
import {upsertCheckoutObservationQuery} from '../server/ecommerce/checkoutObservationQueries';
const ID='gid://shopify/AbandonedCheckout/123';
const NOW='2026-10-20T12:00:00Z';
const key={accountId:'tenant-a',shop:'merchant.myshopify.com',checkoutId:ID};
const snapshot={checkoutId:ID,lastActivityAt:NOW,completed:false,hasRecoveryUrl:true};

test('native PostgreSQL: one intent per checkout, purchase permanently suppresses replays',async()=>{
 const url=process.env.ECOMMERCE_TEST_DATABASE_URL || process.env.SHOPIFY_TEST_DATABASE_URL;
 if(!url) throw Error('ecommerce_test_postgres_required');
 const schema='ecommerce_checkout_recovery_intent_test';
 const admin=new Client({connectionString:url}),first=new Client({connectionString:url}),second=new Client({connectionString:url});
 await Promise.all([admin.connect(),first.connect(),second.connect()]);
 try {
   await admin.query('BEGIN');
   await admin.query('CREATE SCHEMA '+schema);
   await admin.query('SET LOCAL search_path='+schema);
   await admin.query(await readFile('migrations/20261020_ecommerce_abandoned_checkout_observations.sql','utf8'));
   await admin.query(await readFile('migrations/20261020_ecommerce_checkout_recovery_intents.sql','utf8'));
   await admin.query('COMMIT');
   await first.query('SET search_path='+schema);
   await second.query('SET search_path='+schema);
   const a=drizzle(first),b=drizzle(second);
   await a.execute(upsertCheckoutObservationQuery({accountId:key.accountId,shop:key.shop,snapshot}));
   // CI clocks vary: simulate the elapsed delay without changing production logic.
   await admin.query("UPDATE "+schema+".ecommerce_abandoned_checkout_observations SET next_review_at=NOW()-INTERVAL '1 minute'");
   const results=await Promise.all([a.execute(prepareCheckoutRecoveryIntentQuery({
     ...key,verifiedLastActivityAt:NOW
   })),b.execute(prepareCheckoutRecoveryIntentQuery({
     ...key,verifiedLastActivityAt:NOW
   }))]);
   assert.deepEqual(results.map(x=>x.rows.length).sort(),[0,1]);
   let rows=await admin.query('SELECT status FROM '+schema+'.ecommerce_checkout_recovery_intents');
   assert.equal(rows.rowCount,1); assert.equal(rows.rows[0].status,'ready');
   // A Shopify purchase observation is terminal for the checkout, even after an old replay.
   await a.execute(upsertCheckoutObservationQuery({accountId:key.accountId,shop:key.shop,
     snapshot:{...snapshot,completed:true,lastActivityAt:'2026-10-20T13:00:00Z'}}));
   const cancelled=await a.execute(suppressCompletedCheckoutIntentQuery(key));
   assert.equal(cancelled.rows.length,1);
   await b.execute(upsertCheckoutObservationQuery({accountId:key.accountId,shop:key.shop,snapshot}));
   const late=await b.execute(prepareCheckoutRecoveryIntentQuery({...key,verifiedLastActivityAt:NOW}));
   assert.equal(late.rows.length,0);
   rows=await admin.query('SELECT status FROM '+schema+'.ecommerce_checkout_recovery_intents');
   assert.equal(rows.rows[0].status,'suppressed');
   // A new tenant's otherwise identical checkout does not conflict.
   await a.execute(upsertCheckoutObservationQuery({accountId:'tenant-b',shop:key.shop,snapshot}));
   const other=await admin.query('SELECT COUNT(*)::int AS n FROM '+schema+'.ecommerce_abandoned_checkout_observations');
   assert.equal(other.rows[0].n,2);
   // A premature send claim can never be created before its due timestamp.
   const early=await a.execute(prepareCheckoutRecoveryIntentQuery({
     ...key,accountId:'tenant-b',verifiedLastActivityAt:NOW
   }));
   assert.equal(early.rows.length,0);
   // Explicit suppression before sending is durable even across replays.
   const suppression=await a.execute(suppressCheckoutRecoveryIntentQuery({...key,accountId:'tenant-b'}));
   assert.equal(suppression.rows.length,1);
   const res=await admin.query('SELECT status FROM '+schema+
     ".ecommerce_checkout_recovery_intents WHERE account_id='tenant-b'");
   assert.equal(res.rows[0].status,'suppressed');
   const noReopen=await a.execute(prepareCheckoutRecoveryIntentQuery({
     ...key,accountId:'tenant-b',verifiedLastActivityAt:NOW
   }));
   assert.equal(noReopen.rows.length,0);
   assert.throws(()=>prepareCheckoutRecoveryIntentQuery({
     ...key,shop:'another.tld',verifiedLastActivityAt:NOW
   }));
 } finally {
   await first.end();await second.end();
   await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE').catch(()=>{});
   await admin.end();
 }
});
