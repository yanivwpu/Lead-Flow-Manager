import test from 'node:test';
import assert from 'node:assert/strict';
import {
 recoveryPhoneDigest,evaluateRecoveryMessagingEligibility,
 type RecoveryContact,type WhatsAppRecoveryConsent,type RecoveryTemplateApproval,
} from '../server/ecommerce/checkoutRecoveryMessagingEligibility';
const now=Date.parse('2026-10-20T12:00:00Z');
const secret='s'.repeat(36),accountId='tenant-a',shop='store.myshopify.com';
const shopper='gid://shopify/Customer/456';
const contact:RecoveryContact={
 id:'contact-1',userId:accountId,phone:'+15551234567',whatsappId:'15551234567',
 shopifyCustomerId:shopper,automationsPaused:false,tag:'Shopper',pipelineStage:'Lead',customFields:{}
};
const consent:WhatsAppRecoveryConsent={
 accountId,shop,contactId:contact.id,shopifyCustomerId:shopper,
 purpose:'checkout_recovery',channel:'whatsapp',
 source:'verified_whatsapp_explicit_opt_in',
 phoneDigest:recoveryPhoneDigest(secret,contact.phone!),grantedAt:'2026-10-19T12:00:00Z',
 revokedAt:null
};
const template:RecoveryTemplateApproval={name:'checkout_recovery_v1',language:'en_US',category:'marketing',status:'approved'};
const base={accountId,shop,shopifyCustomerId:shopper,contact,consent,
 localTemplate:template,liveMetaTemplate:{...template,status:'APPROVED'},consentDigestSecret:secret,now};
const evaluate=(patch:Partial<typeof base>={})=>evaluateRecoveryMessagingEligibility({...base,...patch});
test('only exact customer, explicit WhatsApp opt-in and live Meta marketing approval can proceed',()=>{
 const r=evaluate();
 assert.deepEqual(r,{ok:true,recipientPhone:'+15551234567',templateName:'checkout_recovery_v1',templateLanguage:'en_US'});
});
test('Shopify marketing preference never substitutes WhatsApp recovery consent',()=>{
 for(const patch of [
  {consent:null},
  {consent:{...consent,source:'shopify_sms_marketing'} as any},
  {consent:{...consent,shopifyCustomerId:'gid://shopify/Customer/999'}},
  {consent:{...consent,revokedAt:'2026-10-20T00:00:00Z'}},
  {contact:{...contact,customFields:{marketingOptIn:true}},consent:null},
  {contact:{...contact,phone:'+15550000000'}},
  {contact:{...contact,whatsappId:null}},
  {contact:{...contact,shopifyCustomerId:'gid://shopify/Customer/999'}},
  {contact:{...contact,userId:'tenant-b'}},
  {consentDigestSecret:'too-short'},
  {consent:{...consent,grantedAt:'2024-01-01T00:00:00Z'}},
 ]) assert.equal(evaluate(patch).ok,false,JSON.stringify(patch));
});
test('DNC, paused automations and marketing unsubscribe block recovery',()=>{
 for(const patch of [
  {automationsPaused:true},{tag:'Do Not Contact'},
  {pipelineStage:'Unsubscribed'}, {customFields:{doNotContact:true}},
  {customFields:{marketingOptIn:false}},{customFields:{campaignOptOut:true}}
 ]) assert.equal(evaluate({contact:{...contact,...patch}}).ok,false,JSON.stringify(patch));
});
test('local and live Meta template approval must match MARKETING exactly',()=>{
 for(const patch of [
  {localTemplate:null},{liveMetaTemplate:null},
  {liveMetaTemplate:{...template,status:'PENDING'}},
  {localTemplate:{...template,category:'utility'}},
  {liveMetaTemplate:{...template,category:'UTILITY'}},
  {liveMetaTemplate:{...template,name:'another_template'}},
  {liveMetaTemplate:{...template,language:'es'}}
 ]) assert.equal(evaluate(patch).ok,false,JSON.stringify(patch));
});
