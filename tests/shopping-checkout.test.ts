import test from "node:test";
import assert from "node:assert/strict";
import { createShopifyCheckoutProvider, STOREFRONT_API_VERSION, validateCheckoutUrl } from "../server/shopping/checkout/shopify";
import { checkoutReceiptCodec, checkoutRequestKey } from "../server/shopping/checkout/attempts";
import type { VerifiedCheckoutItem } from "../server/shopping/checkout/contract";
const shop="fixture-a.myshopify.com", url=`https://${shop}/cart/c/provider-token?key=secret`;
const item:VerifiedCheckoutItem={productId:"gid://shopify/Product/1",variantId:"gid://shopify/ProductVariant/2",quantity:2,price:"600.00",currency:"USD",options:[{name:"Color",value:"Ice"}]};
function variant(){return {id:item.variantId,product:{id:item.productId,requiresSellingPlan:false},availableForSale:true,quantityAvailable:5,quantityRule:{minimum:1,maximum:null,increment:1},currentlyNotInStock:false,requiresComponents:false,price:{amount:"600.0",currencyCode:"USD"},selectedOptions:item.options};}
function cart(){return {id:"gid://shopify/Cart/provider?key=secret",checkoutUrl:url,totalQuantity:2,lines:{nodes:[{quantity:2,merchandise:{id:item.variantId,product:{id:item.productId}},cost:{amountPerQuantity:{amount:"600",currencyCode:"USD"}}}]}};}
function provider(options:{kind?:"public"|"private";mutate?:(v:any)=>any;payload?:(p:any)=>any;response?:(query:string)=>Response|Promise<Response>}={}) {
 const calls:Array<{url:string;init:RequestInit;body:any}>=[];
 const p=createShopifyCheckoutProvider({shop,credential:{kind:options.kind??"public",token:"storefront-fixture-secret"},fetch:async(u,init)=>{
  const body=JSON.parse(init!.body as string);calls.push({url:String(u),init:init!,body});
  if(options.response)return options.response(body.query);
  const data=body.query.startsWith("mutation")?{cartCreate:options.payload?.({cart:cart(),userErrors:[],warnings:[]})??{cart:cart(),userErrors:[],warnings:[]}}:{node:options.mutate?.(variant())??variant()};
  return new Response(JSON.stringify({data}),{headers:{"x-shopify-api-version":STOREFRONT_API_VERSION}});
 }});
 return {p,calls};
}
test("official Storefront authentication and grounded cart creation; no order/payment API",async()=>{
 for(const kind of ["public","private"] as const){
  const {p,calls}=provider({kind});const result=await p.prepare(item);
  assert.equal(result.checkoutUrl,url);assert.equal(result.paymentStatus,"unknown");assert.equal(calls.length,2);
  assert.equal(calls[0].url,`https://${shop}/api/2026-10/graphql.json`);
  assert.equal((calls[0].init.headers as any)[kind==="private"?"Shopify-Storefront-Private-Token":"X-Shopify-Storefront-Access-Token"],"storefront-fixture-secret");
  assert.equal((calls[0].init.headers as any)["X-Shopify-Access-Token"],undefined);
  assert.equal(calls[0].init.redirect,"error");
  assert.deepEqual(calls[1].body.variables,{input:{lines:[{merchandiseId:item.variantId,quantity:2}]}});
  assert.doesNotMatch(JSON.stringify(calls.map(c=>c.body)),/orderCreate|checkoutCreate|payment|customerAccessToken/);
 }
});
test("reject forged identities and quantity before provider IO",async()=>{
 for(const patch of [{variantId:"2"},{productId:"gid://shopify/ProductVariant/2"},{quantity:0},{quantity:100},{quantity:1.2},{price:"NaN"},{currency:"usd"}]){
  const {p,calls}=provider();await assert.rejects(p.prepare({...item,...patch}),/unavailable/);assert.equal(calls.length,0);
 }
});
test("price, currency and options require renewed confirmation",async()=>{
 for(const mutate of [(v:any)=>({...v,price:{amount:"601",currencyCode:"USD"}}),(v:any)=>({...v,price:{amount:"600",currencyCode:"EUR"}}),(v:any)=>({...v,selectedOptions:[]})]){
  const {p,calls}=provider({mutate});await assert.rejects(p.prepare(item),/changed/);assert.equal(calls.length,1);
 }
});
test("wrong store product, unavailable/unpublished Storefront node, insufficient inventory, bundles and subscriptions fail closed",async()=>{
 for(const mutate of [()=>false,(v:any)=>({...v,id:"gid://shopify/ProductVariant/99"}),(v:any)=>({...v,product:{id:"gid://shopify/Product/99"}}),(v:any)=>({...v,availableForSale:false}),(v:any)=>({...v,quantityAvailable:1}),(v:any)=>({...v,quantityAvailable:null}),(v:any)=>({...v,requiresComponents:true}),(v:any)=>({...v,quantityRule:{minimum:3,maximum:null,increment:1}}),(v:any)=>({...v,quantityRule:{minimum:1,maximum:1,increment:1}}),(v:any)=>({...v,quantityRule:{minimum:1,maximum:null,increment:3}}),(v:any)=>({...v,product:{...v.product,requiresSellingPlan:true}})]){
  const {p,calls}=provider({mutate});await assert.rejects(p.prepare(item),/unavailable/);assert.equal(calls.length,1);
 }
});
test("checkout destination rejects unrelated stores, open redirects, userinfo, ports, insecure protocols and fabricated paths",()=>{
 assert.equal(validateCheckoutUrl(url,shop),url);
 assert.equal(validateCheckoutUrl("https://store.example.invalid/cart/c/real",shop,"store.example.invalid"),"https://store.example.invalid/cart/c/real");
 assert.throws(()=>validateCheckoutUrl("https://store.example.invalid/cart/c/real",shop),/invalid_response/);
 assert.throws(()=>validateCheckoutUrl("https://store.example.invalid.evil.invalid/cart/c/real",shop,"store.example.invalid"),/invalid_response/);
 for(const raw of ["http://"+shop+"/cart/c/a",`https://${shop}.evil.invalid/cart/c/a`,`https://fixture-b.myshopify.com/cart/c/a`,`https://evil@${shop}/cart/c/a`,`https://${shop}:8443/cart/c/a`,`https://${shop}/products/snowboard`,`https://${shop}/cart/c/a?redirect=https://evil.invalid`,`https://${shop}/cart/c/a#evil`,"javascript:alert(1)"])assert.throws(()=>validateCheckoutUrl(raw,shop),/invalid_response/);
});
test("cart response must preserve exact variant, quantity and price; warnings are never silently accepted",async()=>{
 for(const payload of [(x:any)=>({...x,cart:{...x.cart,totalQuantity:1}}),(x:any)=>({...x,cart:{...x.cart,checkoutUrl:"https://evil.invalid/cart/c/a"}}),(x:any)=>({...x,warnings:[{code:"MERCHANDISE_NOT_ENOUGH_STOCK"}]}),(x:any)=>({...x,userErrors:[{code:"INVALID"}]})]){
  const {p}=provider({payload});await assert.rejects(p.prepare(item));
 }
});
test("HTTP auth errors, throttling, server errors, timeout and version fall-forward are bounded without automatic retries",async()=>{
 for(const [status,code] of [[401,"setup_required"],[403,"setup_required"],[429,"throttled"],[500,"unavailable"]] as const){
  const {p,calls}=provider({response:()=>new Response("secret provider body",{status})});await assert.rejects(p.verify(item),new RegExp(code));assert.equal(calls.length,1);
  if(status===429){await assert.rejects(p.verify(item),/throttled/);assert.equal(calls.length,1);}
 }
 const timeout=provider({response:()=>{throw Error("secret");}});await assert.rejects(timeout.p.verify(item),/unavailable/);
 const version=provider({response:()=>new Response(JSON.stringify({data:{node:variant()}}),{headers:{"x-shopify-api-version":"2027-01"}})});await assert.rejects(version.p.verify(item),/invalid_response/);
 const ambiguous=provider({response:q=>{if(q.startsWith("mutation"))throw Error("secret provider URL");return new Response(JSON.stringify({data:{node:variant()}}),{headers:{"x-shopify-api-version":STOREFRONT_API_VERSION}});}});await assert.rejects(ambiguous.p.prepare(item),/ambiguous/);assert.equal(ambiguous.calls.length,2);
});
test("provider cart existence/expiration never claims payment",async()=>{
 for(const [data,status] of [[{cart:null},"expired"],[{cart:cart()},"available"]] as const){
  const {p}=provider({response:()=>new Response(JSON.stringify({data}),{headers:{"x-shopify-api-version":STOREFRONT_API_VERSION}})});
  assert.equal(await p.status!({checkoutUrl:url,providerCartId:cart().id,paymentStatus:"unknown"}),status);
 }
});
test("encrypted receipt is bound to owned request; key includes tenant, confirmation and item",()=>{
 const codec=checkoutReceiptCodec(Buffer.alloc(32,7)),value={checkoutUrl:url,providerCartId:cart().id,paymentStatus:"unknown" as const};
 const context={userId:"a",conversationId:"conv",sourceId:"source",integrationId:"install",confirmationId:"event",item};const key=checkoutRequestKey(context);
 const encrypted=codec.seal(value,key);assert.doesNotMatch(encrypted,/secret|provider-token|myshopify/);assert.deepEqual(codec.open(encrypted,key),value);
 assert.throws(()=>codec.open(encrypted,"tenant-b"),/invalid_response/);
 for(const patch of [{userId:"b"},{conversationId:"other"},{confirmationId:"new"},{item:{...item,quantity:3}},{integrationId:"reinstalled"}])assert.notEqual(checkoutRequestKey({...context,...patch}),key);
 assert.throws(()=>checkoutReceiptCodec(Buffer.alloc(0)),/setup_required/);
});

test("official tokenless Cart requests omit tokens and token-only inventory field; fresh owned Admin inventory proof is mandatory",async()=>{
 const calls:any[]=[];
 const p=createShopifyCheckoutProvider({shop,credential:{kind:"tokenless"},fetch:async(u,init)=>{
  calls.push(init);const body=JSON.parse(init!.body as string);
  assert.doesNotMatch(body.query,/quantityAvailable/);
  assert.deepEqual(init!.headers,{"Content-Type":"application/json"});
  return new Response(JSON.stringify({data:body.query.startsWith("mutation")?{cartCreate:{cart:cart(),userErrors:[],warnings:[]}}:{node:variant()}}),{headers:{"x-shopify-api-version":STOREFRONT_API_VERSION}});
 }});
 for(const inventoryProof of [undefined,{at:Date.now()-61_000,quantity:5,unrestricted:false},{at:Date.now()+60_000,quantity:5,unrestricted:false},{at:Date.now(),quantity:1,unrestricted:false},{at:Date.now(),quantity:null,unrestricted:false}])await assert.rejects(p.prepare({...item,inventoryProof}),/unavailable/);
 assert.equal(calls.length,0);
 assert.equal((await p.prepare({...item,inventoryProof:{at:Date.now(),quantity:5,unrestricted:false}})).checkoutUrl,url);
 assert.equal(calls.length,2);
});
test("refreshed inventory proof does not change durable identity; reused cart content must still match",async()=>{
 const context={userId:"a",conversationId:"c",sourceId:"s",integrationId:"i",confirmationId:"e",item:{...item,inventoryProof:{at:1,quantity:5,unrestricted:false}}};
 assert.equal(checkoutRequestKey(context),checkoutRequestKey({...context,item:{...context.item,inventoryProof:{at:2,quantity:6,unrestricted:false}}}));
 const p=provider({response:()=>new Response(JSON.stringify({data:{cart:{...cart(),totalQuantity:1}}}),{headers:{"x-shopify-api-version":STOREFRONT_API_VERSION}})}).p;
 await assert.rejects(p.status!({checkoutUrl:url,providerCartId:cart().id,paymentStatus:"unknown"},item),/changed/);
});
