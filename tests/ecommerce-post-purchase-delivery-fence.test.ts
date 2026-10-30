import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PgDialect} from 'drizzle-orm/pg-core';
import {postPurchaseDeliveryReadinessQuery,claimPostPurchaseDeliveryQuery,
  recordPostPurchaseAttemptQuery,settlePostPurchaseAttemptQuery,
  suppressPendingPostPurchaseQuery} from '../server/ecommerce/postPurchaseDeliveryReadiness';

const dialect=new PgDialect();
const claim='123e4567-e89b-42d3-a456-426614174000';
const scope=['owner-1','pilot.myshopify.com'];
const show=(q:Parameters<typeof dialect.sqlToQuery>[0])=>dialect.sqlToQuery(q);

test('schema migration is review only and enforces a unique scope and claim',()=>{
 const m=readFileSync('migrations/20261030_ecommerce_post_purchase_delivery_fence.sql','utf8');
 for(const expected of ['UNIQUE(intent_id)','ecommerce_postpurchase_outbox_one_journey',
   'ecommerce_postpurchase_outbox_intent_scope','provider_attempted_at','ON DELETE CASCADE'])
   assert.ok(m.includes(expected),expected);
 assert.doesNotMatch(m,/\bDROP\s+TABLE\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i);
});
test('readiness never authorizes delivery',()=>{
 assert.match(show(postPurchaseDeliveryReadinessQuery).sql,/to_regclass/);
});
test('claim is scoped and only pending rows can claim',()=>{
 const q=show(claimPostPurchaseDeliveryQuery(...scope,'install-1'));
 for(const x of ['SKIP LOCKED',"o.state='pending'",'claim_token=gen_random_uuid()',
   'i.state=\'preview_ready\'','o.installation_id'])
   assert.ok(q.sql.includes(x),x);
 assert.deepEqual(q.params, ['owner-1','pilot.myshopify.com','install-1']);
});
test('attempt marker can only be written once before sending',()=>{
 const q=show(recordPostPurchaseAttemptQuery('1',...scope,claim));
 assert.match(q.sql,/provider_attempted_at IS NULL/);
 assert.match(q.sql,/state='claimed'/);
 assert.match(q.sql,/claim_token/);
});
test('terminal settlement cannot requeue or reset attempted state',()=>{
 const q=show(settlePostPurchaseAttemptQuery('1',...scope,claim,'uncertain'));
 assert.match(q.sql,/provider_attempted_at IS NOT NULL/);
 assert.match(q.sql,/state='claimed'/);
 assert.doesNotMatch(q.sql,/state='pending'/);
 assert.throws(()=>settlePostPurchaseAttemptQuery('1',...scope,claim,'accepted'),/invalid_delivery_settlement/);
});
test('suppression cannot touch claimed or provider-accepted rows',()=>{
 const q=show(suppressPendingPostPurchaseQuery(...scope,'gid://shopify/Order/123'));
 assert.match(q.sql,/state='pending'/);
 assert.match(q.sql,/state='suppressed'/);
});
test('reject malformed shop, claims and order IDs',()=>{
 assert.throws(()=>claimPostPurchaseDeliveryQuery('owner','bad.com','installation'));
 assert.throws(()=>recordPostPurchaseAttemptQuery('0',...scope,claim));
 assert.throws(()=>suppressPendingPostPurchaseQuery(...scope,'invalid'));
});
