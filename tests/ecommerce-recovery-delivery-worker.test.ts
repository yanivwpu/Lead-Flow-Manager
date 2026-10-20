import test from 'node:test';
import assert from 'node:assert/strict';
import { processClaimedRecoveryDelivery, recoveryDeliveryExecutionEnabled } from '../server/ecommerce/checkoutRecoveryDeliveryWorker';
import { recoveryPhoneDigest } from '../server/ecommerce/checkoutRecoveryMessagingEligibility';
const accountId='tenant-a',shop='store.myshopify.com',id='gid://shopify/AbandonedCheckout/123';
const shopper='gid://shopify/Customer/456',secret='z'.repeat(40);
const claim={id:'1',claimToken:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  accountId,shop,checkoutId:id,contactId:'contact-1',templateId:'tpl-1'};
const enabled={RAILWAY_ENVIRONMENT_NAME:'staging',APP_URL:'https://whachatcrm-staging-app-staging.up.railway.app',
 ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED:'true',ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED:'true',
 ECOMMERCE_RECOVERY_SEND_ENABLED:'true'};
function harness(changes:Record<string,unknown>={}){
 let sends=0,settlements:string[]=[];
 const evidence={
  contact:{id:'contact-1',userId:accountId,phone:'+15551234567',whatsappId:'15551234567',
    shopifyCustomerId:shopper,automationsPaused:false,tag:'Shopper',pipelineStage:'Lead',customFields:{}},
  consent:{accountId,shop,contactId:'contact-1',shopifyCustomerId:shopper,
    purpose:'checkout_recovery' as const,channel:'whatsapp' as const,
    source:'verified_whatsapp_explicit_opt_in' as const,
    grantedAt:new Date(Date.now()-3600_000).toISOString(),revokedAt:null,
    phoneDigest:recoveryPhoneDigest(secret,'+15551234567')},
  localTemplate:{name:'checkout_recovery',language:'en_US',category:'marketing',status:'approved'},
  liveMetaTemplate:{name:'checkout_recovery',language:'en_US',category:'marketing',status:'APPROVED'},
 };
 const deps={
   verifyCurrentInstallation:async()=>changes.install===false?false:true,
   freshShopifyRecheck:async()=>changes.fresh||{status:'eligible_for_review',
     checkoutId:id,shopifyCustomerId:shopper,lastActivityAt:'2026-10-20T12:00:00Z',
     recoveryUrl:'https://store.myshopify.com/checkouts/abc/recover'},
   resolveCurrentEvidence:async()=>({...evidence,...changes.evidence as object}),
   sendApprovedTemplate:async()=>{sends++;if(changes.failSend)throw Error('provider accepted but response lost');
     return {messageId:'wamid.success-123'};},
   settle:async(_claim:any,status:string)=>{settlements.push(status);return true;}
 };
 return {deps:deps as any,getSends:()=>sends,settlements};
}
test('delivery is disabled in production and without independent operator enable flag',async()=>{
 const h=harness();assert.equal(recoveryDeliveryExecutionEnabled({...enabled,RAILWAY_ENVIRONMENT_NAME:'production'}),false);
 assert.equal(await processClaimedRecoveryDelivery(claim,{...enabled,ECOMMERCE_RECOVERY_SEND_ENABLED:undefined},
   h.deps,secret),'disabled');
 assert.equal(h.getSends(),0);assert.equal(h.settlements.length,0);
});
test('only matching customer, verified opt-in and approved marketing template can send',async()=>{
 const h=harness();
 assert.equal(await processClaimedRecoveryDelivery(claim,enabled,h.deps,secret),'accepted');
 assert.equal(h.getSends(),1);assert.deepEqual(h.settlements,['accepted']);
});
test('completed purchase, lost installation, revocation and unapproved templates never call Meta',async()=>{
 for(const modifications of [
  {install:false},
  {fresh:{status:'blocked',reason:'checkout_completed',completed:true}},
  {evidence:{consent:null}},
  {evidence:{contact:null}},
  {evidence:{liveMetaTemplate:{name:'checkout_recovery',language:'en_US',category:'marketing',status:'PENDING'}}}
 ]){
   const h=harness(modifications);
   const outcome=await processClaimedRecoveryDelivery(claim,enabled,h.deps,secret);
   assert.equal(outcome,'suppressed',JSON.stringify(modifications));
   assert.equal(h.getSends(),0);
 }
});
test('unknown Shopify status and ambiguous Meta acceptance remain terminal uncertain, never auto-retry',async()=>{
 const outage=harness({fresh:{status:'blocked',reason:'shopify_status_unavailable',completed:false}});
 assert.equal(await processClaimedRecoveryDelivery(claim,enabled,outage.deps,secret),'uncertain');
 assert.equal(outage.getSends(),0);
 const ambiguous=harness({failSend:true});
 assert.equal(await processClaimedRecoveryDelivery(claim,enabled,ambiguous.deps,secret),'uncertain');
 assert.equal(ambiguous.getSends(),1);assert.deepEqual(ambiguous.settlements,['uncertain']);
});
