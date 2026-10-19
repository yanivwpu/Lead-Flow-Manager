import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCommerceWebhook } from '../server/ecommerce/eventIntake';

const valid = { verified:true, accountId:'acct-1', shopDomain:'demo.myshopify.com', topic:'orders/create', webhookId:'delivery-123' };

test('verified Shopify order event yields a tenant-bound candidate without sending',()=>{
  const r=classifyCommerceWebhook(valid);
  assert.equal(r.status,'candidate');
  if(r.status==='candidate') {
    assert.equal(r.journey,'order_support');
    assert.deepEqual(JSON.parse(r.dedupeKey),['acct-1','demo.myshopify.com','orders/create','delivery-123']);
  }
});
test('different tenants, shops and deliveries cannot collide',()=>{
  const key=(input:typeof valid)=>{const r=classifyCommerceWebhook(input);assert.equal(r.status,'candidate');return r.status==='candidate'?r.dedupeKey:'';};
  assert.notEqual(key(valid),key({...valid,accountId:'acct-2'}));
  assert.notEqual(key(valid),key({...valid,shopDomain:'second.myshopify.com'}));
  assert.notEqual(key(valid),key({...valid,webhookId:'delivery-124'}));
});
test('fail closed for unverified, unsupported and incomplete events',()=>{
  assert.deepEqual(classifyCommerceWebhook({...valid,verified:false}),{status:'ignored',reason:'unverified_webhook'});
  assert.deepEqual(classifyCommerceWebhook({...valid,topic:'carts/create'}),{status:'ignored',reason:'unsupported_topic'});
  assert.deepEqual(classifyCommerceWebhook({...valid,webhookId:''}),{status:'ignored',reason:'missing_identity'});
  assert.deepEqual(classifyCommerceWebhook({...valid,shopDomain:'attacker.example.com'}),{status:'ignored',reason:'invalid_shop'});
});
test('supported fulfillment and cancellation classification',()=>{
  assert.equal(classifyCommerceWebhook({...valid,topic:'orders/fulfilled'}).status,'candidate');
  const cancelled=classifyCommerceWebhook({...valid,topic:'orders/cancelled'});
  assert.equal(cancelled.status,'candidate');
  if(cancelled.status==='candidate') assert.equal(cancelled.journey,'order_cancelled');
});
