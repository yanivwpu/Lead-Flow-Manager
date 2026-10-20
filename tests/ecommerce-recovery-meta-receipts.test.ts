import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSignedRecoveryReceipt,applySignedRecoveryReceiptQuery} from '../server/ecommerce/checkoutRecoveryMetaReceipts';
import {metaRecoveryReceiptCaptureEnabled} from '../server/ecommerce/checkoutRecoveryMetaReceiptGate';
import {recoveryPhoneDigest} from '../server/ecommerce/checkoutRecoveryMessagingEligibility';
import {readFileSync} from 'node:fs';
const now=Date.parse('2026-10-20T19:00:00Z'),secret='s'.repeat(40);
const inbound={signatureValid:true,hasRawBody:true,phoneNumberId:'123456789012345',
 messageId:'wamid.HBgLMjI0MzQ1Njc4OTAA',recipientId:'15551234567',
 status:'delivered',timestamp:String(now/1000)};
test('Meta receipts require authentic signed raw webhook and exact E164 recipient HMAC',()=>{
 const parsed=parseSignedRecoveryReceipt(inbound,secret,now);
 assert.ok(parsed);
 assert.equal(parsed?.status,'delivered');
 assert.equal(parsed?.recipientDigest,recoveryPhoneDigest(secret,'+15551234567'));
 for(const patch of [
 {signatureValid:false},{hasRawBody:false},{messageId:'invalid'},
 {phoneNumberId:'fake'},{recipientId:'false'},{status:'unknown'},
 {timestamp:String((now-32*24*60*60_000)/1000)},
 {timestamp:String((now+6*60_000)/1000)}
 ])assert.equal(parseSignedRecoveryReceipt({...inbound,...patch},secret,now),null,JSON.stringify(patch));
 assert.equal(parseSignedRecoveryReceipt(inbound,'short',now),null);
});
test('staging-only receipt recorder off by default and unavailable in production',()=>{
 const env={RAILWAY_ENVIRONMENT_NAME:'staging',
 APP_URL:'https://whachatcrm-staging-app-staging.up.railway.app',
 ECOMMERCE_RECOVERY_RECEIPTS_ENABLED:'true'};
 assert.equal(metaRecoveryReceiptCaptureEnabled(env),true);
 for(const patch of [{RAILWAY_ENVIRONMENT_NAME:'production'},
   {ECOMMERCE_RECOVERY_RECEIPTS_ENABLED:undefined},
   {APP_URL:'https://app.whachatcrm.com'}])
 assert.equal(metaRecoveryReceiptCaptureEnabled({...env,...patch}),false);
});
test('receipt SQL validates account and shop and webhook requires signature before ACK',()=>{
 const receipt=parseSignedRecoveryReceipt(inbound,secret,now)!;
 assert.ok(applySignedRecoveryReceiptQuery({accountId:'tenant',shop:'test.myshopify.com',receipt}));
 assert.throws(()=>applySignedRecoveryReceiptQuery({accountId:'tenant',shop:'evil.com',receipt}));
 const src=readFileSync('server/routes.ts','utf8');
 const mark=src.indexOf('recordRecoveryReceiptFromVerifiedMeta({');
 const ack=src.indexOf('res.status(200).send("EVENT_RECEIVED");',mark);
 assert.ok(mark>0&&ack>mark);
 const guard=src.slice(mark-500,mark+800);
 assert.ok(guard.includes('signatureValid && rawBodyBuffer'));
 assert.ok(guard.includes('statusUpdate'));
 assert.ok(!guard.includes('signatureValid:true'));
});
