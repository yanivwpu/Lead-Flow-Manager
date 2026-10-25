import test from 'node:test';
import assert from 'node:assert/strict';
const {verifyBilling,BILLING_QUERY}=await import('../scripts/shopify-reassignment/verify-live-billing.mjs');
const body=()=>({data:{shop:{myshopifyDomain:'whachatcrm.myshopify.com'},currentAppInstallation:{app:{apiKey:'e4585d4da1434c9e5649a2269e716076'},activeSubscriptions:[{id:'gid://shopify/AppSubscription/123',status:'ACTIVE',test:true,currentPeriodEnd:null,lineItems:[{plan:{pricingDetails:{interval:"EVERY_30_DAYS",price:{amount:"0.00",currencyCode:"USD"}}}}]}]}}});
const run=(data:any)=>verifyBilling({token:'fixture',expectedCharge:'123',fetchImpl:async (_url:any,request:any)=>{
 assert.equal(request.redirect,'error'); assert.equal(JSON.parse(request.body).query,BILLING_QUERY);
 assert.doesNotMatch(BILLING_QUERY,/mutation|appSubscriptionCreate/);return {ok:true,json:async()=>data};}});
test('read-only live verifier binds shop, production app and existing subscription and preserves test flag',async()=>{
 const result=await run(body());assert.equal(result.subscriptions[0].test,true);assert.ok(!JSON.stringify(result).includes('fixture'));
});
test('billing verification rejects wrong app, foreign shop, missing test evidence, unknown charge and provider errors',async()=>{
 const candidates=[];let b=body();b.data.currentAppInstallation.app.apiKey='staging';candidates.push(b);
 b=body();b.data.shop.myshopifyDomain='other.myshopify.com';candidates.push(b);
 b=body();delete (b.data.currentAppInstallation.activeSubscriptions[0] as any).test;candidates.push(b);
 b=body();b.data.currentAppInstallation.activeSubscriptions[0].id='foreign';candidates.push(b);
 b=body();b.data.currentAppInstallation.activeSubscriptions[0].lineItems=[];candidates.push(b);
 candidates.push({errors:[{message:'provider failure'}]});
 for(const candidate of candidates) await assert.rejects(run(candidate));
});
