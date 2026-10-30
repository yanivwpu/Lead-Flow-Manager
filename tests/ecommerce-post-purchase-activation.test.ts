import test from 'node:test';
import assert from 'node:assert/strict';
import {postPurchaseActivationReadiness,parsePostPurchaseActivation} from '../server/ecommerce/postPurchaseActivation';
const account='10000000-0000-4000-8000-000000000001';
const env={RAILWAY_ENVIRONMENT_NAME:'staging',APP_URL:'https://whachatcrm-staging-app-staging.up.railway.app',
  ECOMMERCE_POST_PURCHASE_PREP_ENABLED:'true',ECOMMERCE_POST_PURCHASE_ACCOUNT_ID:account,
  ECOMMERCE_POST_PURCHASE_DELIVERY_ENABLED:'true',ECOMMERCE_POST_PURCHASE_DELIVERY_ACCOUNT_ID:account,
  ECOMMERCE_POST_PURCHASE_RECEIPTS_ENABLED:'true',ECOMMERCE_POST_PURCHASE_WEBHOOKS_VERIFIED:'true',
  ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY:'synthetic-fixture-secret-'.repeat(2)};
const config={ecommercePostPurchasePlans:{orderConfirmation:{selected:true,delayMinutes:0}},
  ecommercePostPurchaseTemplates:{orderConfirmation:'fixture-template'}};
test('activation requires independent release, exact owner, schema and configured journeys; production denied',()=>{
  assert.equal(postPurchaseActivationReadiness(env,account,config,true).canActivate,true);
  assert.equal(postPurchaseActivationReadiness(env,account,config,true).merchantEnabled,false);
  for(const key of Object.keys(env))assert.equal(postPurchaseActivationReadiness({...env,[key]:undefined},account,config,true).canActivate,false,key);
  assert.equal(postPurchaseActivationReadiness({...env,RAILWAY_ENVIRONMENT_NAME:'production',APP_URL:'https://app.whachatcrm.com'},account,config,true).canActivate,false);
  assert.equal(postPurchaseActivationReadiness(env,'other',config,true).canActivate,false);
  assert.equal(postPurchaseActivationReadiness(env,account,config,false).canActivate,false);
  assert.equal(postPurchaseActivationReadiness(env,account,{},true).canActivate,false);
});
test('activation input cannot inject owner, release gates, consent or arbitrary configuration',()=>{
  assert.equal(parsePostPurchaseActivation({action:'set_post_purchase_delivery',enabled:true}),true);
  assert.equal(parsePostPurchaseActivation({action:'set_post_purchase_delivery',enabled:false}),false);
  for(const value of [null,[],{},true,{action:'set_post_purchase_delivery',enabled:'true'},
    {action:'set_post_purchase_delivery',enabled:true,accountId:account},
    {action:'set_post_purchase_delivery',enabled:true,consent:true}])assert.equal(parsePostPurchaseActivation(value),null);
});
