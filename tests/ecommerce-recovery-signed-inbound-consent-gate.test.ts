import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyRecoveryConsentInbound,recoveryConsentCaptureEnabled,
 type VerifiedInboundConsentCandidate} from '../server/ecommerce/checkoutRecoveryInboundConsentGate';
const now=Date.parse('2026-10-20T19:00:00Z');
const event:VerifiedInboundConsentCandidate={
 signatureValid:true,hasRawBody:true,type:'text',phoneNumberId:'123456789012345',
 from:'15551234567',messageId:'wamid.HBgLMjI0MzQ1Njc4OTAA',
 timestamp:String(now/1000),text:'YES WHATSAPP CHECKOUT REMINDERS',
};
test('staging-only flag disabled by default and never on production',()=>{
 const env={RAILWAY_ENVIRONMENT_NAME:'staging',
 APP_URL:'https://whachatcrm-staging-app-staging.up.railway.app',
 ECOMMERCE_RECOVERY_CONSENT_CAPTURE_ENABLED:'true'};
 assert.equal(recoveryConsentCaptureEnabled(env),true);
 for(const patch of [{RAILWAY_ENVIRONMENT_NAME:'production'},
  {APP_URL:'https://app.whachatcrm.com'},
  {ECOMMERCE_RECOVERY_CONSENT_CAPTURE_ENABLED:'false'},
  {ECOMMERCE_RECOVERY_CONSENT_CAPTURE_ENABLED:undefined}])
  assert.equal(recoveryConsentCaptureEnabled({...env,...patch}),false);
});
test('only signed exact explicit WhatsApp checkout reminders wording grants consent',()=>{
 assert.equal(classifyRecoveryConsentInbound(event,now)?.action,'grant');
 for(const text of ['YES','yes please','I agree','Opt in','YES SMS CHECKOUT REMINDERS',
  'YES EMAIL CHECKOUT REMINDERS','YES WHATSAPP UPDATES','YES WHATSAPP CHECKOUT REMINDERS NOW',
  'yes whatsapp checkout reminders!','']) {
   assert.equal(classifyRecoveryConsentInbound({...event,text},now),null,text);
 }
});
test('signed STOP and unsubscribe revoke, but media/button/unsigned/stale/spoofed do nothing',()=>{
 for(const text of ['stop','STOP CHECKOUT REMINDERS','unsubscribe'])
  assert.equal(classifyRecoveryConsentInbound({...event,text},now)?.action,'revoke');
 for(const patch of [
  {signatureValid:false},{hasRawBody:false},{type:'interactive'},
  {type:'image'},{messageId:'m_not_meta_id'},{phoneNumberId:'false'},
  {from:'not-verified'},{timestamp:'bad'},
  {timestamp:String((now-16*60_000)/1000)},
  {timestamp:String((now+3*60_000)/1000)},
  {text:'not a consent command'},
 ]){
  assert.equal(classifyRecoveryConsentInbound({...event,...patch},now),null,JSON.stringify(patch));
 }
});
