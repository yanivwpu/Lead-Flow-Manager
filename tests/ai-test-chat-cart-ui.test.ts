import test from 'node:test';
import assert from 'node:assert/strict';
import { cartTestPreparationAllowed, preparePrivateCartTest, privateCartPreparationError } from '../client/src/lib/aiTestCartPreparation';
import type { TestChatView, PrivateCheckoutPreflight } from '../shared/aiTestChat';
const stamp=Date.parse('2026-10-26T04:30:12Z');
const selection={shop:'whachatcrm.myshopify.com',productId:'gid://shopify/Product/10108114174234',variantId:'gid://shopify/ProductVariant/51638769221914',quantity:1 as const,price:'749.95',currency:'USD',options:[{name:'Title',value:'Default Title'}]};
const inventory={tracked:true,quantity:50,verifiedAt:new Date(stamp).toISOString()};
const proof:PrivateCheckoutPreflight={ready:true,cartCreated:false,cartCreationEnabled:false,credentialKind:'private',selection,inventory,quantityRule:{minimum:1,maximum:null,increment:1},selectionSha256:'a'.repeat(64),sessionBinding:'b'.repeat(64),operatorCartAccessConfigured:false,nextAction:'separate_cart_approval_required'};
const chat={id:'b914b9e8-20ab-4941-84be-91b727a6b612',testMode:true,channel:'webchat',expiresAt:new Date(stamp+600000).toISOString(),transcript:[],state:{step:'confirming',quantity:1,selected:{productId:'owned-product',variantId:'owned-variant',price:'749.95',currency:'USD',options:selection.options}}} as TestChatView;
const request=()=>({requestId:'1d7b312f-1a14-4ea6-88a8-6f97e02fa510',scopeSha256:'c'.repeat(64),expiresAt:new Date(stamp+300000).toISOString(),selection,inventory,quantityRule:{minimum:1,maximum:null,increment:1},cartCreated:false,cartCreationEnabled:false});
test('uses current saved session and only empty-body preparation; sanitized response excludes unexpected fields at every level',async()=>{
 const calls:any[]=[];
 const result=await preparePrivateCartTest(chat,proof,async(path,body)=>{calls.push({path,body});return {...request(),token:'synthetic-secret',checkoutUrl:'https://example.test/private',sessionDigest:'hidden',selection:{...selection,credential:'hidden'},inventory:{...inventory,internal:'hidden'}};},()=>stamp);
 assert.deepEqual(calls,[{path:`/api/ai/test-chat/${chat.id}/checkout-handoff-request`,body:{}}]);
 assert.equal(result.requestId,request().requestId);assert.equal(result.scopeSha256,'c'.repeat(64));assert.equal(result.expiresAt,request().expiresAt);
 assert.doesNotMatch(JSON.stringify(result),/secret|credential|checkoutUrl|sessionDigest|internal|hidden/);
 assert.equal(result.cartCreated,false);assert.equal(result.cartCreationEnabled,false);
});
test('no preparation IO without fresh readiness, correct selection, unexpired existing session and confirming state',async()=>{
 let calls=0;const post=async()=>{calls++;return request();};
 for(const [view,ready,time] of [
  [chat,undefined,stamp],[chat,{...proof,ready:false},stamp],
  [chat,proof,stamp+60001],[chat,proof,stamp-1],
  [{...chat,expiresAt:new Date(stamp).toISOString()},proof,stamp],
  [{...chat,state:{...chat.state,quantity:2}},proof,stamp],
  [{...chat,state:{...chat.state,step:'selecting'}},proof,stamp],
  [chat,{...proof,selection:{...selection,variantId:'gid://shopify/ProductVariant/9'}},stamp],
  [{...chat,state:{...chat.state,selected:{...chat.state.selected,price:'750.00'}}},proof,stamp],
  [{...chat,expiresAt:'invalid'},proof,stamp],
 ] as any[]){assert.equal(cartTestPreparationAllowed(view,ready,time),false);await assert.rejects(preparePrivateCartTest(view,ready,post,()=>time));}
 assert.equal(calls,0);
});
test('rejects changed price/currency/quantity/options, expired requests and enabled/cart-created responses without retries',async()=>{
 let calls=0;
 const invalid=[{...request(),selection:{...selection,price:'750.00'}},{...request(),selection:{...selection,currency:'EUR'}},
  {...request(),selection:{...selection,quantity:2}},{...request(),selection:{...selection,options:[{name:'Title',value:'Other'}]}},
  {...request(),expiresAt:new Date(stamp).toISOString()},{...request(),expiresAt:new Date(stamp+300001).toISOString()},
  {...request(),cartCreated:true},{...request(),cartCreationEnabled:true},{...request(),scopeSha256:'invalid'}];
 for(const value of invalid)await assert.rejects(preparePrivateCartTest(chat,proof,async()=>{calls++;return value;},()=>stamp));
 assert.equal(calls,invalid.length);
 let failures=0;await assert.rejects(preparePrivateCartTest(chat,proof,async()=>{failures++;throw Error('503: synthetic provider failure');},()=>stamp));assert.equal(failures,1);
 assert.equal(privateCartPreparationError(Error('404: {"error":"session_expired"}')),'expired');
 assert.equal(privateCartPreparationError(Error('404: {"error":"not_found"}')),'unavailable');
});
