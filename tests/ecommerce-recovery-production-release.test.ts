import test from "node:test";
import assert from "node:assert/strict";
import {readProductionRecoveryScope,productionRecoveryClaimAllowed,productionRecoveryRecipientAllowed,
  productionRecoveryEvidenceScope} from "../server/ecommerce/checkoutRecoveryProductionRelease";
import {recoveryDeliveryExecutionEnabled,recoveryClaimExecutionEnabled,processClaimedRecoveryDelivery} from "../server/ecommerce/checkoutRecoveryDeliveryWorker";
import {metaRecoveryReceiptCaptureEnabled} from "../server/ecommerce/checkoutRecoveryMetaReceiptGate";
import {runRecoveryWorkerTick,recoveryWorkerEnabled,startStagingRecoveryWorkerScheduler,
  startControlledProductionRecoveryWorkerScheduler} from "../server/ecommerce/checkoutRecoveryWorkerScheduler";
import {recoveryPhoneDigest} from "../server/ecommerce/checkoutRecoveryMessagingEligibility";

const account="10000000-0000-4000-8000-000000000001", secret="synthetic-fixture-key-".repeat(3), phone="+447700900123";
const claim={id:"1",claimToken:"10000000-0000-4000-8000-000000000002",accountId:account,shop:"fixture.myshopify.com",
  checkoutId:"gid://shopify/AbandonedCheckout/12",contactId:"contact-fixture",templateId:"template-fixture"};
const env={RAILWAY_ENVIRONMENT_NAME:"production",APP_URL:"https://app.whachatcrm.com",ECOMMERCE_RECOVERY_PRODUCTION_DELIVERY_APPROVED:"true",
  ECOMMERCE_RECOVERY_WORKER_MODE:"production-controlled-one-checkout",ECOMMERCE_RECOVERY_WORKER_ENABLED:"true",
  ECOMMERCE_RECOVERY_SEND_ENABLED:"true",ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED:"true",ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED:"true",
  ECOMMERCE_RECOVERY_RECEIPTS_ENABLED:"true",ECOMMERCE_RECOVERY_WEBHOOKS_VERIFIED:"true",ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY:secret,
  ECOMMERCE_RECOVERY_PRODUCTION_RECEIPTS_APPROVED:"true",ECOMMERCE_RECOVERY_PRODUCTION_CONSENT_APPROVED:"true",ECOMMERCE_RECOVERY_CONSENT_CAPTURE_ENABLED:"true",
  ECOMMERCE_RECOVERY_WORKER_ALLOWED_ACCOUNT_ID:account,ECOMMERCE_RECOVERY_WORKER_ALLOWED_SHOP:claim.shop,
  ECOMMERCE_RECOVERY_ONE_SHOT_CHECKOUT_GID:claim.checkoutId,ECOMMERCE_RECOVERY_CONTROLLED_RECIPIENT_HMAC:recoveryPhoneDigest(secret,phone),
  ECOMMERCE_RECOVERY_CONTROLLED_EXPIRES_AT:new Date(Date.now()+10*60_000).toISOString()};

test("existing recovery guard remains staging-only; production needs every independent exact-scope approval and defaults off",()=>{
  assert.equal(recoveryDeliveryExecutionEnabled(env),false);
  assert.equal(recoveryWorkerEnabled(env),false);
  assert.equal(recoveryClaimExecutionEnabled({},claim),false);
  assert.ok(readProductionRecoveryScope(env));assert.equal(recoveryClaimExecutionEnabled(env,claim),true);
  for(const key of Object.keys(env)) assert.equal(readProductionRecoveryScope({...env,[key]:undefined}),null,key);
  for(const change of [{accountId:"other"},{shop:"foreign.myshopify.com"},{checkoutId:"gid://shopify/AbandonedCheckout/13"}])
    assert.equal(productionRecoveryClaimAllowed(env,{...claim,...change}),false);
  for(const value of ["*","all",new Date(Date.now()-1).toISOString(),new Date(Date.now()+2*60*60_000).toISOString()])
    assert.equal(readProductionRecoveryScope({...env,ECOMMERCE_RECOVERY_CONTROLLED_EXPIRES_AT:value}),null);
  assert.equal(productionRecoveryRecipientAllowed(env,"f".repeat(64)),false);
});
test("late signed receipt capture stays available after send kill switch/expiry, with separate evidence scope",()=>{
  const stopped={...env,ECOMMERCE_RECOVERY_SEND_ENABLED:"false",ECOMMERCE_RECOVERY_CONTROLLED_EXPIRES_AT:new Date(0).toISOString()};
  assert.equal(recoveryClaimExecutionEnabled(stopped,claim),false);
  assert.ok(productionRecoveryEvidenceScope(stopped));assert.equal(metaRecoveryReceiptCaptureEnabled(stopped),true);
  assert.equal(metaRecoveryReceiptCaptureEnabled({...stopped,ECOMMERCE_RECOVERY_PRODUCTION_RECEIPTS_APPROVED:"false"}),false);
});
test("controlled production scheduling can claim only the approved checkout and never claims when disabled",async()=>{
  let claims=0,sends=0;
  const deps={claim:async(a:string,c:string)=>{claims++;assert.equal(a,account);assert.equal(c,claim.checkoutId);return claim;},
    process:async()=>{sends++;return "accepted" as const;}};
  assert.equal(await runRecoveryWorkerTick({},deps),"disabled");assert.equal(claims,0);
  assert.equal(startStagingRecoveryWorkerScheduler(env,deps,()=>{}),null);
  assert.equal(startControlledProductionRecoveryWorkerScheduler({},deps,()=>{}),null);
  const stop=startControlledProductionRecoveryWorkerScheduler(env,deps,()=>{});
  assert.ok(stop);stop();
  assert.equal(await runRecoveryWorkerTick(env,deps),"accepted");assert.equal(claims,1);assert.equal(sends,1);
});
test("new production entry preserves purchase completion, recipient-specific consent and no uncertain retries",async()=>{
  let sends=0;const settled:string[]=[];
  const contact={id:claim.contactId,userId:account,phone,whatsappId:phone.slice(1),shopifyCustomerId:"gid://shopify/Customer/45",
    automationsPaused:false,tag:null,pipelineStage:null,customFields:{}};
  const template={name:"shopify_checkout_reminder",language:"en",category:"marketing",status:"approved"};
  let consent:any={accountId:account,shop:claim.shop,contactId:claim.contactId,shopifyCustomerId:contact.shopifyCustomerId,
    purpose:"checkout_recovery",channel:"whatsapp",source:"verified_whatsapp_explicit_opt_in",
    phoneDigest:recoveryPhoneDigest(secret,phone),grantedAt:new Date(Date.now()-1000).toISOString(),revokedAt:null};
  let completed=false;
  const deps={verifyCurrentInstallation:async()=>true,
    freshShopifyRecheck:async()=>completed?{status:"blocked" as const,reason:"completed",completed:true}:
      {status:"eligible_for_review" as const,completed:false,shopifyCustomerId:contact.shopifyCustomerId,
        recoveryUrl:"https://fixture.myshopify.com/checkouts/12/recover",lastActivityAt:new Date(Date.now()-2*60*60_000).toISOString()},
    resolveCurrentEvidence:async()=>({contact,consent,localTemplate:template,liveMetaTemplate:template}),
    sendApprovedTemplate:async()=>{sends++;throw Error("provider_acceptance_unknown");},
    settle:async(_claim:any,state:string)=>{settled.push(state);return true;}};
  completed=true;assert.equal(await processClaimedRecoveryDelivery(claim,env,deps,secret),"suppressed");
  completed=false;const granted=consent;consent=null;
  assert.equal(await processClaimedRecoveryDelivery(claim,env,deps,secret),"suppressed");
  consent={...granted,revokedAt:new Date().toISOString()};
  assert.equal(await processClaimedRecoveryDelivery(claim,env,deps,secret),"suppressed");assert.equal(sends,0);
  consent=granted;
  assert.equal(await processClaimedRecoveryDelivery(claim,env,deps,secret),"uncertain");assert.equal(sends,1);
  assert.equal(settled.at(-1),"uncertain");
});
