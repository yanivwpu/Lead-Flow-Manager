import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recoveryWorkerEnabled,runRecoveryWorkerTick} from '../server/ecommerce/checkoutRecoveryWorkerScheduler';

const env={
 RAILWAY_ENVIRONMENT_NAME:'staging',APP_URL:'https://whachatcrm-staging-app-staging.up.railway.app',
 ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED:'true',
 ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED:'true',
 ECOMMERCE_RECOVERY_SEND_ENABLED:'true',
 ECOMMERCE_RECOVERY_WORKER_ENABLED:'true',
 ECOMMERCE_RECOVERY_WORKER_MODE:'staging-test-only',
 ECOMMERCE_RECOVERY_WORKER_ALLOWED_ACCOUNT_ID:'merchant-test-123',
 ECOMMERCE_RECOVERY_ONE_SHOT_CHECKOUT_GID:'gid://shopify/AbandonedCheckout/123'
};
const claim={
 id:'1',claimToken:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 accountId:'merchant-test-123',shop:'test.myshopify.com',
 checkoutId:'gid://shopify/AbandonedCheckout/123',contactId:'customer-1',templateId:'template-1'
};
test('no scheduling without a single test-tenant allowlist and every independent staging send flag',()=>{
 assert.equal(recoveryWorkerEnabled(env),true);
 for(const patch of [
  {RAILWAY_ENVIRONMENT_NAME:'production'},{APP_URL:'https://app.whachatcrm.com'},
  {ECOMMERCE_RECOVERY_WORKER_MODE:'all-merchants'},
  {ECOMMERCE_RECOVERY_WORKER_ALLOWED_ACCOUNT_ID:undefined},
  {ECOMMERCE_RECOVERY_WORKER_ALLOWED_ACCOUNT_ID:'*'},
  {ECOMMERCE_RECOVERY_ONE_SHOT_CHECKOUT_GID:undefined},
  {ECOMMERCE_RECOVERY_ONE_SHOT_CHECKOUT_GID:'gid://shopify/AbandonedCheckout/999; DROP TABLE'},
  {ECOMMERCE_RECOVERY_ONE_SHOT_CHECKOUT_GID:'gid://shopify/Order/123'},
  {ECOMMERCE_RECOVERY_WORKER_ENABLED:'false'},
  {ECOMMERCE_RECOVERY_SEND_ENABLED:undefined},
  {ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED:'false'},
  {ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED:'false'}
 ])assert.equal(recoveryWorkerEnabled({...env,...patch}),false,JSON.stringify(patch));
});
test('one scheduler tick processes only a claimed checkout from the exact allowlisted tenant',async()=>{
 let claims=0,sends=0;
 const dep={
  claim:async(accountId:string,checkoutId:string)=>{
    claims++;assert.equal(accountId,'merchant-test-123');
    assert.equal(checkoutId,'gid://shopify/AbandonedCheckout/123');
    return claim;
  },
  process:async()=>{sends++;return 'accepted' as const;}
 };
 const disabled=await runRecoveryWorkerTick({...env,ECOMMERCE_RECOVERY_WORKER_ENABLED:undefined},dep);
 assert.equal(disabled,'disabled');assert.equal(claims,0);assert.equal(sends,0);
 assert.equal(await runRecoveryWorkerTick(env,dep),'accepted');
 assert.equal(claims,1);assert.equal(sends,1);
 const wrong=await runRecoveryWorkerTick(env,{
  claim:async()=>({...claim,accountId:'another-merchant'}),
  process:async()=>{sends++;return 'accepted' as const}
 });
 assert.equal(wrong,'uncertain');assert.equal(sends,1);
 const wrongCheckout=await runRecoveryWorkerTick(env,{
  claim:async()=>({...claim,checkoutId:'gid://shopify/AbandonedCheckout/999'}),
  process:async()=>{sends++;return 'accepted' as const}
 });
 assert.equal(wrongCheckout,'uncertain');assert.equal(sends,1);
});
test('the runtime reuses the existing outbox claims, Meta sender, consent and fresh Shopify checks',()=>{
 const code=readFileSync('server/ecommerce/checkoutRecoveryWorkerRuntime.ts','utf8');
 for(const needle of [
  'claimRecoveryDeliveryQuery','settleRecoveryDeliveryQuery','processClaimedRecoveryDelivery',
  'sendRecoveryViaMeta','recheckShopifyCheckoutForRecovery','readRecoveryConsentQuery',
  'getMetaMessageTemplates','ECOMMERCE_RECOVERY_WORKER_ALLOWED_ACCOUNT_ID',
  'ECOMMERCE_RECOVERY_ONE_SHOT_CHECKOUT_GID'
 ])assert.ok(code.includes(needle),needle);
 assert.ok(!code.includes("setInterval(()=>sendRecoveryViaMeta"));
 const index=readFileSync('server/index.ts','utf8');
 assert.ok(index.includes("ECOMMERCE_RECOVERY_WORKER_ENABLED === 'true'"));
 assert.ok(index.includes('startCheckoutRecoveryRuntime()'));
 const schedule=readFileSync('server/ecommerce/checkoutRecoveryWorkerScheduler.ts','utf8');
 assert.ok(schedule.includes("result!=='empty' && result!=='disabled'"));
 assert.ok(schedule.includes('clearInterval(timer)'));
 const query=readFileSync('server/ecommerce/checkoutRecoveryOutbox.ts','utf8');
 assert.ok(query.includes('AND o.checkout_gid=${input.checkoutId}'));
});
