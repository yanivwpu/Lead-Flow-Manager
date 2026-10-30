import test from 'node:test';
import assert from 'node:assert/strict';
import { readPostPurchasePlans, parsePostPurchasePlanChange, POST_PURCHASE_JOURNEYS } from '../shared/postPurchase';
import { planPostPurchaseTimeline, type PostPurchaseSnapshot } from '../server/ecommerce/postPurchaseTimeline';

const now = Date.UTC(2026, 9, 30);
function fixture(topic = 'orders/create'): PostPurchaseSnapshot {
  return {
    accountId:'a', shop:'one.myshopify.com', installationActive:true, merchantPaused:false,
    event:{verified:true, accountId:'a',shop:'one.myshopify.com',topic,deliveryId:'delivery-1',
      orderId:'gid://shopify/Order/1',customerId:'gid://shopify/Customer/2',occurredAt:now - 180*86400000},
    order:{accountId:'a',shop:'one.myshopify.com',id:'gid://shopify/Order/1',customerId:'gid://shopify/Customer/2',
      status:topic==='orders/create'?'open':topic==='orders/cancelled'?'cancelled':'fulfilled',
      updatedAt:now - 180*86400000,checkedAt:now,latestPurchaseAt:now - 180*86400000},
    recipient:{accountId:'a',customerId:'gid://shopify/Customer/2',identityVerified:true,channel:'whatsapp',
      stopped:false,erased:false,paused:false,consentPurposes:POST_PURCHASE_JOURNEYS},
    templates:Object.fromEntries(POST_PURCHASE_JOURNEYS.map(journey=>[journey,{
      localApproved:true,liveApproved:true,exactBodyMatched:true,language:'en',
      category:['orderConfirmation','fulfillmentUpdate','cancellation'].includes(journey)?'UTILITY':'MARKETING',
    }])), previousKeys:[],now,
  };
}
const plans=readPostPurchasePlans({ecommercePostPurchasePlans:Object.fromEntries(POST_PURCHASE_JOURNEYS.map(j=>[j,{selected:true,delayMinutes:0}]))});
const result=(input:PostPurchaseSnapshot,journey='orderConfirmation')=>planPostPurchaseTimeline(plans,input).find(row=>row.journey===journey)!;

test('all six journeys use existing classified topics, correct category and bounded timing',()=>{
  for(const [topic,expected] of [
    ['orders/create',['orderConfirmation']],['orders/fulfilled',['fulfillmentUpdate','reviewRequest','repeatPurchase','winBack']],
    ['orders/cancelled',['cancellation']],
  ] as const){
    const rows=planPostPurchaseTimeline(plans,fixture(topic));
    assert.deepEqual(rows.filter(r=>r.status==='preview_ready').map(r=>r.journey),expected);
    assert.ok(rows.every(r=>r.messagingEnabled===false));
  }
  const input=fixture();input.event.occurredAt=now;input.order.updatedAt=now;
  const delayed=structuredClone(plans);delayed.orderConfirmation.delayMinutes=10;
  const row=planPostPurchaseTimeline(delayed,input)[0];
  assert.equal(row.dueAt,now+600000);assert.ok(row.reasons.includes('waiting_for_timing'));
});

test('fresh evidence, exact tenant/order/customer, STOP, erasure and uninstall fail closed',()=>{
  const cases:Array<[string,(s:PostPurchaseSnapshot)=>void]>=[
    ['installation_inactive',s=>s.installationActive=false],
    ['merchant_or_contact_paused',s=>s.merchantPaused=true],
    ['merchant_or_contact_paused',s=>s.recipient.paused=true],
    ['event_ineligible',s=>s.event.verified=false],
    ['event_ineligible',s=>s.event.topic='fulfillments/create'],
    ['tenant_or_shop_mismatch',s=>s.order.accountId='b'],
    ['tenant_or_shop_mismatch',s=>s.event.shop='two.myshopify.com'],
    ['identity_unverified',s=>s.recipient.customerId='gid://shopify/Customer/3'],
    ['identity_unverified',s=>s.event.orderId='gid://shopify/Order/3'],
    ['identity_unverified',s=>s.recipient.identityVerified=false],
    ['recipient_stopped',s=>s.recipient.stopped=true],['privacy_erased',s=>s.recipient.erased=true],
    ['fresh_order_check_required',s=>s.order.checkedAt=now-60001],
    ['fresh_order_check_required',s=>s.order.checkedAt=now+1],
    ['invalid_order_time',s=>s.event.occurredAt=NaN],
    ['order_status_changed',s=>s.order.status='cancelled'],
    ['order_status_changed',s=>s.order.status='fulfilled'],
    ['purpose_specific_whatsapp_consent_required',s=>s.recipient.consentPurposes=['checkout_recovery']],
    ['approved_matching_template_required',s=>s.templates.orderConfirmation!.liveApproved=false],
    ['approved_matching_template_required',s=>s.templates.orderConfirmation!.exactBodyMatched=false],
    ['approved_matching_template_required',s=>s.templates.orderConfirmation!.category='MARKETING'],
  ];
  for(const [reason,mutate] of cases){const input=fixture();mutate(input);assert.ok(result(input).reasons.includes(reason),reason);}
});

test('new purchases suppress marketing; cancellation supersedes queued shipping and reviews',()=>{
  const input=fixture('orders/fulfilled');input.order.latestPurchaseAt=now;
  for(const journey of ['reviewRequest','repeatPurchase','winBack'])
    assert.ok(result(input,journey).reasons.includes('purchase_recheck_required_or_new_purchase'));
  input.order.status='cancelled';
  for(const journey of ['fulfillmentUpdate','reviewRequest','repeatPurchase','winBack'])
    assert.ok(result(input,journey).reasons.includes('order_status_changed'));
});

test('semantic duplicate and uncertain attempt fence survives different delivery IDs and tenant boundaries',()=>{
  const input=fixture();const key=result(input).key;
  input.event.deliveryId='redelivered-with-new-id';input.previousKeys=[key];
  assert.ok(result(input).reasons.includes('duplicate_or_uncertain_attempt'));
  const other=fixture();other.accountId=other.event.accountId=other.order.accountId=other.recipient.accountId='b';
  assert.notEqual(result(other).key,key);
});

test('configuration defaults are off; reject activation injection and malformed timing',()=>{
  assert.ok(Object.values(readPostPurchasePlans(null)).every(x=>!x.selected));
  for(const delayMinutes of [-1,0.5,Infinity,NaN,'5',259201])
    assert.equal(parsePostPurchasePlanChange({action:'save_post_purchase_plan',journey:'winBack',plan:{selected:true,delayMinutes}}),null);
  assert.equal(parsePostPurchasePlanChange({action:'activate',journey:'winBack',plan:{selected:true,delayMinutes:5}}),null);
  assert.equal(parsePostPurchasePlanChange({action:'save_post_purchase_plan',journey:'winBack',plan:{selected:true,delayMinutes:5,send:true}}),null);
  assert.deepEqual(parsePostPurchasePlanChange({action:'save_post_purchase_plan',journey:'winBack',plan:{selected:true,delayMinutes:5}}),{journey:'winBack',plan:{selected:true,delayMinutes:5}});
});
