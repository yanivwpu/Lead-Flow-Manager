import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyRecoveryConsentInbound,validRecoveryWamid} from '../server/ecommerce/checkoutRecoveryInboundConsentGate';
import {grantSignedRecoveryConsentQuery} from '../server/ecommerce/checkoutRecoveryInboundConsentQueries';
test('signed inbound consent capture is AFTER Meta signature verification and BEFORE ACK',()=>{
 const src=readFileSync('server/routes.ts','utf8');
 const verify=src.indexOf('signatureValid = verifyMetaWebhookSignature(');
 const capture=src.indexOf('captureRecoveryConsentFromVerifiedMeta({');
 const ack=src.indexOf('res.status(200).send("EVENT_RECEIVED");',capture);
 assert.ok(verify>=0 && capture>verify && ack>capture,'must never ACK before capture');
 const block=src.slice(verify,ack);
 for(const guard of ['signatureValid && rawBodyBuffer',"incomingMessage.type === \"text\"",
   'metaInboxContact?.id','Buffer.isBuffer(rawBodyBuffer)',
   'ECOMMERCE_RECOVERY_CONSENT_CAPTURE_ENABLED']) assert.ok(block.includes(guard),guard);
 assert.ok(!block.includes('signatureValid: true'),'webhook must pass real verification');
});
test('there is no merchant/browser/API route to mint signed consent evidence',()=>{
 const src=readFileSync('server/ecommerce/checkoutRecoveryInboundConsentCapture.ts','utf8');
 assert.ok(!src.includes('router.post('));
 assert.ok(!src.includes('app.post('));
 assert.ok(src.includes('pg_advisory_xact_lock'));
 assert.ok(src.includes('owner.metaPhoneNumberId!==candidate.phoneNumberId'));
 assert.ok(src.includes('exactContacts'));
 assert.ok(src.includes('revokeSignedRecoveryConsentQuery'));
 assert.ok(src.includes('suppressRecoveryOutboxByContactQuery'));
});

test('realistic padded Meta message IDs pass signed consent validation, malformed IDs fail',()=>{
 const wamid='wamid.HBgLMjI0MzQ1Njc4OTAwMDAwMDAwMDAwMDA=';
 assert.equal(validRecoveryWamid(wamid),true);
 assert.equal(validRecoveryWamid('wamid.ABCDEF123+/=='),true);
 for(const invalid of ['wamid.ABCDEF123===','wamid.'+'A'.repeat(251),'wamid.ABCDEF123\n','bad.ABCDEF123']) {
   assert.equal(validRecoveryWamid(invalid),false);
 }
 const at=new Date('2026-10-29T19:31:56Z');
 const event={signatureValid:true,hasRawBody:true,type:'text',phoneNumberId:'1144480422078565',
   from:'15551234567',messageId:wamid,timestamp:String(at.getTime()/1000),
   text:'Yes WhatsApp checkout reminders'};
 assert.equal(classifyRecoveryConsentInbound(event,at.getTime())?.action,'grant');
 assert.equal(classifyRecoveryConsentInbound({...event,signatureValid:false},at.getTime()),null);
 assert.equal(classifyRecoveryConsentInbound({...event,text:'YES'},at.getTime()),null);
 assert.equal(classifyRecoveryConsentInbound({...event,text:'STOP'},at.getTime())?.action,'revoke');
 assert.doesNotThrow(()=>grantSignedRecoveryConsentQuery({
   accountId:'tenant-test',shop:'example.myshopify.com',contactId:'contact-test',
   shopifyCustomerId:'gid://shopify/Customer/123',
   whatsappId:'15551234567',phone:'+15551234567',secret:'K'.repeat(40),
   eventAt:at,wamid
 }));
});
