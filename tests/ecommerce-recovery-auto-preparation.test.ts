import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runAutoRecoveryPreparationTick,recoveryAutoPrepEnabled,
 type AutoPrepDeps} from '../server/ecommerce/checkoutRecoveryAutoPreparation';
const merchant={accountId:'staging-merchant-123',shop:'demo.myshopify.com',accessToken:'fake-staging-token'};
const env={
 RAILWAY_ENVIRONMENT_NAME:'staging',
 APP_URL:'https://whachatcrm-staging-app-staging.up.railway.app',
 ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED:'true',
 ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED:'true',
 ECOMMERCE_RECOVERY_AUTOPREP_ENABLED:'true',
 ECOMMERCE_RECOVERY_WORKER_MODE:'staging-test-only',
 ECOMMERCE_RECOVERY_WORKER_ALLOWED_ACCOUNT_ID:'staging-merchant-123',
 ECOMMERCE_RECOVERY_TEMPLATE_NAME:'checkout_recovery_v1'
};
const checkoutId='gid://shopify/AbandonedCheckout/123',customerId='gid://shopify/Customer/456';
const active={status:'eligible_for_review' as const,checkoutId,shopifyCustomerId:customerId,
 lastActivityAt:'2026-10-20T14:00:00Z',recoveryUrl:'https://demo.myshopify.com/checkouts/abc/recover'};
const snapshot={checkoutId,lastActivityAt:active.lastActivityAt,completed:false,hasRecoveryUrl:true};
function harness(options:{
 done?:boolean;match?:boolean;wrongCustomer?:boolean;identityOnly?:boolean
}={}){
 let observed=0,rechecks=0,queued=0,suppressed=0;const calls:string[]=[];
 const deps:AutoPrepDeps={
  merchant:async id=>id===merchant.accountId?merchant:null,
  observePage:async()=>({observations:[snapshot],hasNextPage:false,nextCursor:null}),
  persistObservation:async()=>{calls.push('observe');observed++;return true;},
  due:async()=>[{checkoutId,lastActivityAt:snapshot.lastActivityAt}],
  recheck:async()=>{calls.push('recheck');rechecks++;return options.done?
    {status:'blocked',reason:'checkout_completed',completed:true}:active;},
  suppress:async()=>{calls.push('suppress');suppressed++;return true;},
  resolveIdentity:async(_merchant,customerId,templateName)=>{
    calls.push('consent');
    assert.equal(customerId,active.shopifyCustomerId);
    assert.equal(templateName,'checkout_recovery_v1');
    if(options.match===false)return null;
    return {contactId:'contact-one',templateId:'template-one',
      shopifyCustomerId:options.wrongCustomer?'gid://shopify/Customer/999':customerId};
  },
  prepareAndEnqueue:async()=>{calls.push('enqueue');queued++;return true;},
 };
 return {deps,calls,count:()=>({observed,rechecks,queued,suppressed})};
}
test('automatic preparation requires the exact staging, explicit opt-in, test tenant and template',()=>{
 assert.equal(recoveryAutoPrepEnabled(env),true);
 for(const change of [
  {RAILWAY_ENVIRONMENT_NAME:'production'}, {APP_URL:'https://app.whachatcrm.com'},
  {ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED:undefined},
  {ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED:undefined},
  {ECOMMERCE_RECOVERY_AUTOPREP_ENABLED:undefined},
  {ECOMMERCE_RECOVERY_WORKER_MODE:'all-merchants'},
  {ECOMMERCE_RECOVERY_WORKER_ALLOWED_ACCOUNT_ID:'*'},
  {ECOMMERCE_RECOVERY_TEMPLATE_NAME:undefined},
  {ECOMMERCE_RECOVERY_TEMPLATE_NAME:'unapproved template'}
 ])assert.equal(recoveryAutoPrepEnabled({...env,...change}),false,JSON.stringify(change));
});
test('observation -> fresh purchase check -> verified matching customer -> durable enqueue; never calls Meta',async()=>{
 const h=harness();
 const result=await runAutoRecoveryPreparationTick(env,h.deps);
 assert.deepEqual(result,{observed:1,checked:1,queued:1,suppressed:0,skipped:0});
 assert.deepEqual(h.calls,['observe','recheck','consent','enqueue']);
});
test('purchase, absent consent and customer mismatch stop before queuing a message',async()=>{
 for(const [flags,want] of [
   [{done:true},['observe','recheck','suppress']],
   [{match:false},['observe','recheck','consent']],
   [{wrongCustomer:true},['observe','recheck','consent']]
 ] as const){
  const h=harness(flags);
  await runAutoRecoveryPreparationTick(env,h.deps);
  assert.deepEqual(h.calls,want);
  assert.equal(h.count().queued,0);
 }
});
test('disabled mode never accesses Shopify/DB and no account-wide loop exists',async()=>{
 const h=harness();
 const result=await runAutoRecoveryPreparationTick({...env,ECOMMERCE_RECOVERY_AUTOPREP_ENABLED:'false'},h.deps);
 assert.equal(result.disabled,true);assert.equal(h.calls.length,0);
 const code=readFileSync('server/ecommerce/checkoutRecoveryAutoPreparationRuntime.ts','utf8');
 for(const required of ['pg_advisory_xact_lock','ownerStillActive','recoveryPhoneDigest',
    'timingSafeEqual','last_verified_inbound_at','enqueueRecoveryDeliveryQuery',
    'suppressPendingRecoveryDeliveryQuery','fetchShopifyAbandonedCheckoutPage',
    'recheckShopifyCheckoutForRecovery'])assert.ok(code.includes(required),required);
 assert.equal(code.includes('sendMetaWhatsAppTemplate('),false);
 assert.equal(code.includes('sendRecoveryViaMeta('),false);
});
