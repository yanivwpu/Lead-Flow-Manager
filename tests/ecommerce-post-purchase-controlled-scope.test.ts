import test from 'node:test';
import assert from 'node:assert/strict';
import {PgDialect} from 'drizzle-orm/pg-core';
import {readControlledPostPurchaseScope,postPurchaseControlledScopeReady,
  controlledPostPurchaseRecipientMatches,sameControlledPostPurchaseScope} from '../server/ecommerce/postPurchaseControlledScope';
import {claimPostPurchaseDeliveryQuery,recordPostPurchaseAttemptQuery} from '../server/ecommerce/postPurchaseDeliveryReadiness';

const env={RAILWAY_ENVIRONMENT_NAME:'production',ECOMMERCE_POST_PURCHASE_DELIVERY_MODE:'controlled-one-intent',
  ECOMMERCE_POST_PURCHASE_CONTROLLED_INTENT_ID:'42',ECOMMERCE_POST_PURCHASE_CONTROLLED_RECIPIENT_HMAC:'a'.repeat(64),
  ECOMMERCE_POST_PURCHASE_CONTROLLED_EXPIRES_AT:new Date(Date.now()+10*60_000).toISOString()};
test('production has no unrestricted delivery fallback; incomplete or wildcard approval fails closed',()=>{
  assert.equal(postPurchaseControlledScopeReady(env),true);
  assert.equal(postPurchaseControlledScopeReady({...env,ECOMMERCE_POST_PURCHASE_CONTROLLED_EXPIRES_AT:new Date(Date.now()-1).toISOString()}),false);
  assert.equal(postPurchaseControlledScopeReady({RAILWAY_ENVIRONMENT_NAME:'production'}),false);
  assert.equal(postPurchaseControlledScopeReady({RAILWAY_ENVIRONMENT_NAME:'staging'}),true);
  for(const key of ['ECOMMERCE_POST_PURCHASE_DELIVERY_MODE','ECOMMERCE_POST_PURCHASE_CONTROLLED_INTENT_ID',
    'ECOMMERCE_POST_PURCHASE_CONTROLLED_RECIPIENT_HMAC','ECOMMERCE_POST_PURCHASE_CONTROLLED_EXPIRES_AT']){
    for(const value of [undefined,'','*','all']){
      const candidate={...env,[key]:value};
      assert.equal(postPurchaseControlledScopeReady(candidate),false);
      assert.equal(postPurchaseControlledScopeReady({...candidate,RAILWAY_ENVIRONMENT_NAME:'staging'}),false);
    }
  }
});
test('controlled authorization binds one intent and recipient and cannot be retargeted mid-attempt',()=>{
  const scope=readControlledPostPurchaseScope(env)!;
  assert.ok(scope);
  assert.equal(controlledPostPurchaseRecipientMatches(scope,'a'.repeat(64)),true);
  for(const digest of ['b'.repeat(64),'','*','invalid'])assert.equal(controlledPostPurchaseRecipientMatches(scope,digest),false);
  assert.equal(sameControlledPostPurchaseScope(scope,{...scope}),true);
  assert.equal(sameControlledPostPurchaseScope(scope,{...scope,intentId:'43'}),false);
  assert.equal(sameControlledPostPurchaseScope(scope,{...scope,recipientHmac:'b'.repeat(64)}),false);
  assert.equal(sameControlledPostPurchaseScope(null,scope),false);
});
test('both the claim and autocommitted attempt fence bind the approved intent',()=>{
  const dialect=new PgDialect();
  const claim=dialect.sqlToQuery(claimPostPurchaseDeliveryQuery('fixture','fixture.myshopify.com','install','42'));
  const fence=dialect.sqlToQuery(recordPostPurchaseAttemptQuery('7','fixture','fixture.myshopify.com',
    '10000000-0000-4000-8000-000000000001','42'));
  assert.match(claim.sql,/i\.id=\$\d+::bigint/);assert.equal(claim.params.at(-1),'42');
  assert.match(fence.sql,/intent_id=\$\d+::bigint/);assert.equal(fence.params.at(-1),'42');
  assert.throws(()=>claimPostPurchaseDeliveryQuery('fixture','fixture.myshopify.com','install','*'));
  assert.throws(()=>recordPostPurchaseAttemptQuery('7','fixture','fixture.myshopify.com',
    '10000000-0000-4000-8000-000000000001','0'));
});
