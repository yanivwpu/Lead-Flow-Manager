import test from 'node:test';
import assert from 'node:assert/strict';
import {recheckShopifyCheckoutForRecovery} from '../server/ecommerce/checkoutFreshRecheck';

const ID='gid://shopify/AbandonedCheckout/123';
const node={id:ID,updatedAt:'2026-10-20T10:00:00Z',completedAt:null,
  abandonedCheckoutUrl:'https://store.example.com/123/checkouts/token/recover?key=secret',customer:{id:'gid://shopify/Customer/456'}};
const data=(overrides:Record<string,unknown>={})=>({
  data:{
    abandonedCheckouts:{nodes:[node]},
    abandonmentByAbandonedCheckoutId:{customerHasNoOrderSinceAbandonment:true,customer:{id:'gid://shopify/Customer/456'}},
    shop:{primaryDomain:{url:'https://store.example.com'}},
    ...overrides
  }
});
const source=(body:unknown,status=200)=>{
  return (async (_url: string|URL|Request,init?:RequestInit)=>{
    assert.equal(JSON.parse(String(init?.body)).variables.checkoutId,ID);
    assert.equal(JSON.parse(String(init?.body)).variables.search,'id:123');
    return new Response(JSON.stringify(body),{status});
  }) as typeof fetch;
};
const read=(body:unknown)=>recheckShopifyCheckoutForRecovery({
  shop:'demo.myshopify.com',accessToken:'not-a-real-token',
  checkoutId:ID,now:Date.parse('2026-10-20T12:00:00Z'),fetchImpl:source(body)
});
test('fresh checkout + no later order permits only in-memory review with primary custom store domain',async()=>{
  const decision=await read(data());
  assert.equal(decision.status,'eligible_for_review');
  if(decision.status==='eligible_for_review'){
    assert.equal(decision.checkoutId,ID);
    assert.equal(decision.shopifyCustomerId,'gid://shopify/Customer/456');
    assert.equal(decision.recoveryUrl,node.abandonedCheckoutUrl);
  }
});
test('completed checkout and a later order both fail closed',async()=>{
  const done=await read(data({abandonedCheckouts:{nodes:[{...node,completedAt:'2026-10-20T11:00:00Z'}]}}));
  assert.deepEqual(done,{status:'blocked',reason:'checkout_completed',completed:true});
  const purchased=await read(data({
    abandonmentByAbandonedCheckoutId:{customerHasNoOrderSinceAbandonment:false,customer:{id:'gid://shopify/Customer/456'}}
  }));
  assert.deepEqual(purchased,{status:'blocked',reason:'new_order_or_order_status_unknown',completed:true});
});
test('missing/foreign record, null abandonment, incomplete response and spoofed URLs fail closed',async()=>{
  const variants=[
    data({abandonedCheckouts:{nodes:[]}}),
    data({abandonedCheckouts:{nodes:[{...node,id:'gid://shopify/AbandonedCheckout/999'}]}}),
    data({abandonmentByAbandonedCheckoutId:null}),
    data({abandonmentByAbandonedCheckoutId:{}}),
    data({abandonmentByAbandonedCheckoutId:{customerHasNoOrderSinceAbandonment:true,customer:{id:'gid://shopify/Customer/999'}}}),
    data({abandonedCheckouts:{nodes:[{...node,customer:null}]}}),
    data({abandonedCheckouts:{nodes:[{...node,completedAt:undefined}]}}),
    data({abandonedCheckouts:{nodes:[{...node,abandonedCheckoutUrl:'https://evil.test/123/checkouts/a/recover'}]}}),
    data({abandonedCheckouts:{nodes:[{...node,abandonedCheckoutUrl:'http://store.example.com/123/checkouts/a/recover'}]}}),
    data({shop:{primaryDomain:{url:'http://store.example.com'}}}),
    data({abandonedCheckouts:{nodes:[{...node,updatedAt:'2030-01-01T12:00:00Z'}]}})
  ];
  for(const v of variants) assert.equal((await read(v)).status,'blocked');
  assert.equal((await read({errors:[{message:'permission denied'}]})).status,'blocked');
  assert.equal((await read({data:{abandonedCheckouts:{nodes:[node]}}})).status,'blocked');
});
test('permission errors and transport outages never authorize recovery',async()=>{
  const blocked=await recheckShopifyCheckoutForRecovery({
    shop:'demo.myshopify.com',accessToken:'token',checkoutId:ID,
    fetchImpl:source(data(),403)
  });assert.equal(blocked.status,'blocked');
  const badId=await recheckShopifyCheckoutForRecovery({
    shop:'demo.myshopify.com',accessToken:'token',checkoutId:'gid://shopify/Order/123',
    fetchImpl:source(data())
  });assert.equal(badId.status,'blocked');
});


/** Shopify may omit an otherwise visible checkout from an exact ID-filtered
 * search; the fallback may only accept one identical global ID on a bounded
 * read-only page, with a fresh no-new-order verification.
 */
function pairedSource(filtered:unknown, fallback:unknown, onCall:(n:number,payload:Record<string,any>)=>void){
 let called=0;
 const fetchImpl=(async(_url:string|URL|Request,init?:RequestInit)=>{
   called++;
   const payload=JSON.parse(String(init?.body));
   onCall(called,payload);
   assert.equal(init?.method,'POST');
   return new Response(JSON.stringify(called===1?filtered:fallback),{status:200});
 }) as typeof fetch;
 return {fetchImpl,count:()=>called};
}
test('bounded recent-list fallback confirms exact checkout when indexed ID search misses it',async()=>{
 const c=pairedSource(data({abandonedCheckouts:{nodes:[]}}),data({
   abandonedCheckouts:{nodes:[{...node,id:'gid://shopify/AbandonedCheckout/987'},node]}
 }), (n,payload)=>{
   if(n===1){assert.equal(payload.variables.search,'id:123');assert.ok(payload.query.includes('first: 2'));}
   if(n===2){
     assert.deepEqual(payload.variables,{checkoutId:ID});
     assert.ok(payload.query.includes('first: 25'));
     assert.ok(payload.query.includes('sortKey: CREATED_AT'));
     assert.ok(!payload.query.includes('query: $search'));
     assert.ok(payload.query.includes('\n'));
     assert.ok(payload.query.includes('abandonmentByAbandonedCheckoutId'));
   }
 });
 const decision=await recheckShopifyCheckoutForRecovery({
   shop:'demo.myshopify.com',accessToken:'test-token',checkoutId:ID,
   now:Date.parse('2026-10-20T12:00:00Z'),fetchImpl:c.fetchImpl
 });
 assert.equal(decision.status,'eligible_for_review');
 assert.equal(c.count(),2);
 if(decision.status==='eligible_for_review')assert.equal(decision.checkoutId,ID);
});
test('no fallback is necessary when filtered search confirms an exact ID',async()=>{
 const c=pairedSource(data(),data(),(n)=>assert.equal(n,1));
 const decision=await recheckShopifyCheckoutForRecovery({
   shop:'demo.myshopify.com',accessToken:'test-token',checkoutId:ID,
   now:Date.parse('2026-10-20T12:00:00Z'),fetchImpl:c.fetchImpl
 });
 assert.equal(decision.status,'eligible_for_review');
 assert.equal(c.count(),1);
});
test('bounded fallback never substitutes another checkout or trusts incomplete results',async()=>{
 for(const fallback of [
   data({abandonedCheckouts:{nodes:[]}}),
   data({abandonedCheckouts:{nodes:[{...node,id:'gid://shopify/AbandonedCheckout/987'}]}}),
   data({abandonedCheckouts:{nodes:[node,node]}}),
   {data:{abandonedCheckouts:{nodes:[node]}}},
   {errors:[{message:'unauthorized'}]}
 ]){
   const c=pairedSource(data({abandonedCheckouts:{nodes:[]}}),fallback,()=>{});
   const decision=await recheckShopifyCheckoutForRecovery({
     shop:'demo.myshopify.com',accessToken:'test-token',checkoutId:ID,
     now:Date.parse('2026-10-20T12:00:00Z'),fetchImpl:c.fetchImpl
   });
   assert.equal(decision.status,'blocked');
   assert.equal(c.count(),2);
 }
});
test('even after fallback finds the exact checkout, purchase and identity safety checks remain mandatory',async()=>{
 for(const fallback of [
   data({abandonedCheckouts:{nodes:[{...node,completedAt:'2026-10-20T11:00:00Z'}]}}),
   data({abandonmentByAbandonedCheckoutId:{customerHasNoOrderSinceAbandonment:false,customer:{id:'gid://shopify/Customer/456'}}}),
   data({abandonmentByAbandonedCheckoutId:{customerHasNoOrderSinceAbandonment:true,customer:{id:'gid://shopify/Customer/999'}}}),
   data({abandonedCheckouts:{nodes:[{...node,abandonedCheckoutUrl:'https://attacker.invalid/checkouts/a/recover'}]}})
 ]){
   const c=pairedSource(data({abandonedCheckouts:{nodes:[]}}),fallback,()=>{});
   const decision=await recheckShopifyCheckoutForRecovery({
     shop:'demo.myshopify.com',accessToken:'test-token',checkoutId:ID,
     now:Date.parse('2026-10-20T12:00:00Z'),fetchImpl:c.fetchImpl
   });
   assert.equal(decision.status,'blocked');
   assert.equal(c.count(),2);
 }
});
