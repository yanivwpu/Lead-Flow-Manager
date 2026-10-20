import test from 'node:test';
import assert from 'node:assert/strict';
import {recheckShopifyCheckoutForRecovery} from '../server/ecommerce/checkoutFreshRecheck';

const ID='gid://shopify/AbandonedCheckout/123';
const node={id:ID,updatedAt:'2026-10-20T10:00:00Z',completedAt:null,
  abandonedCheckoutUrl:'https://store.example.com/123/checkouts/token/recover?key=secret'};
const data=(overrides:Record<string,unknown>={})=>({
  data:{
    abandonedCheckouts:{nodes:[node]},
    abandonmentByAbandonedCheckoutId:{customerHasNoOrderSinceAbandonment:true},
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
    assert.equal(decision.recoveryUrl,node.abandonedCheckoutUrl);
  }
});
test('completed checkout and a later order both fail closed',async()=>{
  const done=await read(data({abandonedCheckouts:{nodes:[{...node,completedAt:'2026-10-20T11:00:00Z'}]}}));
  assert.deepEqual(done,{status:'blocked',reason:'checkout_completed',completed:true});
  const purchased=await read(data({
    abandonmentByAbandonedCheckoutId:{customerHasNoOrderSinceAbandonment:false}
  }));
  assert.deepEqual(purchased,{status:'blocked',reason:'new_order_or_order_status_unknown',completed:true});
});
test('missing/foreign record, null abandonment, incomplete response and spoofed URLs fail closed',async()=>{
  const variants=[
    data({abandonedCheckouts:{nodes:[]}}),
    data({abandonedCheckouts:{nodes:[{...node,id:'gid://shopify/AbandonedCheckout/999'}]}}),
    data({abandonmentByAbandonedCheckoutId:null}),
    data({abandonmentByAbandonedCheckoutId:{}}),
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
