import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

const src=readFileSync('server/shopifyRoutes.ts','utf8');
const start=src.indexOf("router.get('/ecommerce/checkout-recovery-preflight'");
const end=src.indexOf("router.post('/ecommerce/checkout-observation-preview-sync'", start);
assert.ok(start>=0&&end>start);
const route=src.slice(start,end);

test('recovery staging preflight remains authenticated, owner-scoped and read only',()=>{
  assert.ok(route.includes("if (!req.user) return res.status(401)"));
  assert.ok(route.includes('stagingRecoveryPreflightAllowed(environment,shop)'));
  assert.ok(route.includes("isShopifyContactInstallationActive(owner)"));
  assert.ok(route.includes("matches.length!==1"));
  assert.ok(route.includes("WHERE account_id=\${accountId} AND shop=\${shop}"));
  assert.ok(route.includes("mode:'staging_read_only'"));
  for(const forbidden of [
    "db.insert(", "db.update(", "db.delete(", "db.transaction(",
    "sendMetaWhatsAppTemplate(", "sendRecoveryViaMeta(", "claimRecoveryDeliveryQuery(",
    "fenceRecoveryProviderAttemptQuery(", "settleRecoveryDeliveryQuery(",
    "UPDATE ecommerce_checkout_recovery_outbox", "INSERT INTO ecommerce_checkout_recovery_outbox",
    "providerMessageId:String(", "recipientPhone:", "recoveryUrl:"
  ])assert.equal(route.includes(forbidden),false,forbidden);
  assert.ok(route.includes("messagesSentByThisCheck:0"));
  assert.ok(route.includes("recoveryActivatedByThisCheck:false"));
});

test('recovery outcome reconciliation exposes terminal and receipt counts, not PII',()=>{
 const query=route.slice(route.indexOf('const counts=await db.execute(sql'),route.indexOf('const row=counts.rows[0]'));
 const expected=[
  ["state='pending'","pending_outbox"],
  ["state='suppressed'","suppressed_outbox"],
  ["state='claimed'","claimed_outbox"],
  ["state='accepted'","accepted_outbox"],
  ["state='uncertain'","uncertain_outbox"],
  ["provider_attempted_at IS NOT NULL","provider_attempts"],
  ["provider_message_id IS NOT NULL","provider_accepted"],
  ["meta_delivery_status='sent'","meta_sent_receipts"],
  ["meta_delivery_status='delivered'","meta_delivered_receipts"],
  ["meta_delivery_status='read'","meta_read_receipts"],
  ["meta_delivery_status='failed'","meta_failed_receipts"]
 ];
 for(const [where,alias] of expected){
  const pos=query.indexOf(where);
  assert.ok(pos>=0,where);
  const near=query.slice(Math.max(0,pos-125),pos+180);
  assert.ok(near.includes('account_id=\${accountId} AND shop=\${shop}'),alias+' must be tenant scoped');
  assert.ok(near.includes('AS '+alias),alias+' must alias the count');
 }
 const output=route.slice(route.indexOf('delivery:{'),route.indexOf('flags:recoveryAutomationFlags(environment)'));
 for(const name of ['claimed','accepted','uncertain','providerAttempts','providerAccepted',
    'metaSentReceipts','metaDeliveredReceipts','metaReadReceipts','metaFailedReceipts'])
  assert.ok(output.includes(name+':asCount('),name);
 assert.ok(!output.includes('provider_message_id:'));
 assert.ok(!output.includes('recipient'));
 assert.ok(!output.includes('checkout_gid'));
});