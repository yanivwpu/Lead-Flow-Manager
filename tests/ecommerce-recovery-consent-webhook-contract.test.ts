import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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
