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

test('original recovery readiness counts remain independent of optional receipt columns',()=>{
 const query=route.slice(route.indexOf('const counts=await db.execute(sql'),route.indexOf('const row=counts.rows[0]'));
 for(const marker of ["state='pending'","state='suppressed'","observations_due","ready_intents","active_consents"])
   assert.ok(query.includes(marker),marker);
 for(const optional of ["provider_attempted_at","meta_delivery_status"])
   assert.equal(query.includes(optional),false,optional+' must not affect readiness');
});

test('delivery evidence reports unavailable rather than false zero for missing columns',()=>{
 const capability=route.slice(route.indexOf('const capability=await'),route.indexOf('const totals=await'));
 assert.ok(capability.includes('information_schema.columns'));
 for(const column of ['provider_attempted_at','meta_delivery_status','provider_message_id'])
   assert.ok(capability.includes("column_name='"+column+"'"));
 const extra=route.slice(route.indexOf('const totals=await'),route.indexOf('if(t)delivery='));
 assert.ok(extra.includes('FROM ecommerce_checkout_recovery_outbox AS o'));
 assert.ok(extra.includes('WHERE o.account_id=${accountId} AND o.shop=${shop}'));
 for(const state of ['claimed','accepted','uncertain'])
   assert.ok(extra.includes("o.state='"+state+"'"));
 for(const col of ['provider_attempted_at','meta_delivery_status','provider_message_id'])
   assert.ok(extra.includes("to_jsonb(o)->>'"+col+"'"),col+' must not reference optional columns directly');
 assert.ok(route.includes("status:'unavailable',claimed:null,accepted:null,uncertain:null"));
 assert.ok(route.includes("providerAttempts:availability.has_attempt===true?asCount(t.attempts):null"));
 assert.ok(route.includes("metaDeliveredReceipts:availability.has_receipt===true?asCount(t.meta_delivered):null"));
 assert.ok(route.includes("status:availability.has_attempt===true&&availability.has_receipt===true&&"));
 assert.ok(route.includes("console.warn('[EcommerceRecoveryPreflight] delivery_aggregate_unavailable'"));
 assert.ok(!route.includes('console.warn(e)'));
 assert.ok(route.includes('delivery,'));
 assert.ok(!route.includes('delivery:{'));
});
