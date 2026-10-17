import test from "node:test";
import assert from "node:assert/strict";
import { createShopifyCheckoutProvider, STOREFRONT_API_VERSION, validateCheckoutUrl } from "../server/shopping/checkout/shopify";
import { checkoutReceiptCodec, checkoutRequestKey } from "../server/shopping/checkout/attempts";
import { CheckoutError, type CheckoutFailureDetail, type VerifiedCheckoutItem } from "../server/shopping/checkout/contract";
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
  assert.doesNotMatch(body.query,/quantityAvailable|currentlyNotInStock/);
  assert.deepEqual(init!.headers,{"Content-Type":"application/json"});
  const {quantityAvailable,currentlyNotInStock,...tokenlessVariant}=variant();
  return new Response(JSON.stringify({data:body.query.startsWith("mutation")?{cartCreate:{cart:cart(),userErrors:[],warnings:[]}}:{node:tokenlessVariant}}),{headers:{"x-shopify-api-version":STOREFRONT_API_VERSION}});
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

// Independently reviewed 2026-10 request contracts. These fixtures intentionally expose no
// token-only inventory/backorder fields, so permissive provider mocks cannot hide a dependency.
const tokenlessVerifyContract = `query CheckoutVariant($id:ID!) { node(id:$id) { ... on ProductVariant {
 id availableForSale quantityRule { minimum maximum increment } requiresComponents
 selectedOptions { name value } price { amount currencyCode } product { id requiresSellingPlan }
} } }`;
const tokenlessCartContract = `id checkoutUrl totalQuantity lines(first:2) { nodes {
 quantity merchandise { ... on ProductVariant { id product { id } } }
 cost { amountPerQuantity { amount currencyCode } }
} }`;
const compact = (query:string) => query.replace(/\s+/g,"").trim();
function tokenlessProvider(change:{variant?:(v:any)=>any;payload?:(p:any)=>any;errorAt?:"verify"|"create"|"status"}={}) {
 const calls:string[]=[];
 const provider=createShopifyCheckoutProvider({shop,credential:{kind:"tokenless"},fetch:async(_u,init)=>{
  assert.deepEqual(init!.headers,{"Content-Type":"application/json"});
  const {query}=JSON.parse(init!.body as string);calls.push(query);
  const operation=query.startsWith("mutation")?"create":query.includes("CheckoutStatus")?"status":"verify";
  const contracts={verify:tokenlessVerifyContract,create:`mutation PrepareCheckout($input:CartInput!) { cartCreate(input:$input) { cart { ${tokenlessCartContract} } userErrors { code } warnings { code } } }`,status:`query CheckoutStatus($id:ID!) { cart(id:$id) { ${tokenlessCartContract} } }`};
  assert.equal(compact(query),compact(contracts[operation]),"new selections require a renewed field-level authorization audit");
  assert.doesNotMatch(query,/quantityAvailable|metafields?|buyerIdentity|customerAccessToken|shopPayInstallmentsPricing/);
  if(change.errorAt===operation)return new Response(JSON.stringify({data:null,errors:[{message:"synthetic denied field",extensions:{code:"ACCESS_DENIED"}}]}),{headers:{"x-shopify-api-version":STOREFRONT_API_VERSION}});
  const {quantityAvailable,currentlyNotInStock,...sparse}=variant();
  const data=operation==="verify"?{node:change.variant?.(sparse)??sparse}:operation==="create"?{cartCreate:change.payload?.({cart:cart(),userErrors:[],warnings:[]})??{cart:cart(),userErrors:[],warnings:[]}}:{cart:cart()};
  return new Response(JSON.stringify({data}),{headers:{"x-shopify-api-version":STOREFRONT_API_VERSION}});
 }});
 return {provider,calls};
}
const tokenlessItem=()=>({...item,inventoryProof:{at:Date.now(),quantity:5,unrestricted:false}});
test("all three tokenless operations match the audited 2026-10 field contract and consume sparse responses",async()=>{
 const {provider,calls}=tokenlessProvider();
 const receipt=await provider.prepare(tokenlessItem());
 assert.equal(receipt.checkoutUrl,url);assert.equal(await provider.status!(receipt,item),"available");assert.equal(calls.length,3);
});
test("tokenless quantity rules, bundle/selling-plan restrictions and exact selected options still fail closed",async()=>{
 for(const variant of [
  (v:any)=>({...v,quantityRule:null}),
  (v:any)=>({...v,quantityRule:{minimum:3,maximum:null,increment:1}}),
  (v:any)=>({...v,quantityRule:{minimum:1,maximum:1,increment:1}}),
  (v:any)=>({...v,quantityRule:{minimum:1,maximum:null,increment:3}}),
  (v:any)=>({...v,requiresComponents:true}),
  (v:any)=>({...v,requiresComponents:undefined}),
  (v:any)=>({...v,product:{...v.product,requiresSellingPlan:true}}),
  (v:any)=>({...v,selectedOptions:[]}),
  (v:any)=>({...v,price:{amount:"601",currencyCode:"USD"}}),
  (v:any)=>({...v,price:{amount:"600",currencyCode:"EUR"}}),
 ]){
  const {provider,calls}=tokenlessProvider({variant});await assert.rejects(provider.prepare(tokenlessItem()),/unavailable|changed/);assert.equal(calls.length,1,"invalid selection must never dispatch cartCreate");
 }
});
test("tokenless Cart warnings, partial quantities and authorization errors cannot produce a checkout link or retry a mutation",async()=>{
 for(const payload of [(p:any)=>({...p,warnings:[{code:"MERCHANDISE_NOT_ENOUGH_STOCK"}]}),(p:any)=>({...p,cart:{...p.cart,totalQuantity:1}})]){
  const {provider,calls}=tokenlessProvider({payload});await assert.rejects(provider.prepare(tokenlessItem()));assert.equal(calls.length,2);
 }
 for(const errorAt of ["verify","create"] as const){
  const {provider,calls}=tokenlessProvider({errorAt});await assert.rejects(provider.prepare(tokenlessItem()),errorAt==="verify"?/invalid_response/:/ambiguous/);assert.equal(calls.length,errorAt==="verify"?1:2);
 }
 const {provider}=tokenlessProvider({errorAt:"status"});await assert.rejects(provider.status!({checkoutUrl:url,providerCartId:cart().id,paymentStatus:"unknown"},item),/invalid_response/);
});


function diagnosticProvider(response:(signal:AbortSignal)=>Promise<Response>) {
 let calls=0;
 const p=createShopifyCheckoutProvider({shop,credential:{kind:'tokenless'},fetch:async(u,init)=>{
   calls++;assert.equal(u,`https://${shop}/api/2026-10/graphql.json`);
   assert.equal(init?.method,'POST');assert.equal(init?.redirect,'error');
   assert.deepEqual(init?.headers,{'Content-Type':'application/json'});
   assert.ok(init?.signal instanceof AbortSignal);
   const body=JSON.parse(init?.body as string);assert.ok(body.query.startsWith('query CheckoutVariant'));
   assert.deepEqual(body.variables,{id:item.variantId});
   return response(init!.signal!);
 }});
 return {p,calls:()=>calls};
}
const proofItem=()=>({...item,inventoryProof:{at:Date.now(),quantity:5,unrestricted:false}});
function failureDetail(expected:CheckoutFailureDetail,code:string='unavailable') {
 return (error:unknown)=>{
  assert.ok(error instanceof CheckoutError);assert.equal(error.code,code);assert.equal(error.detail,expected);
  assert.doesNotMatch(JSON.stringify(error),/private-marker|secret-body|https:|password|stack|cause/);return true;
 };
}
test('Storefront diagnostics distinguish DNS/TLS/connection and native timeouts before HTTP headers without retry',async()=>{
 for(const [code,detail] of [
  ['ENOTFOUND','dns_failure'],['EAI_AGAIN','dns_failure'],['CERT_HAS_EXPIRED','tls_failure'],
  ['ERR_TLS_CERT_ALTNAME_INVALID','tls_failure'],['ECONNRESET','connection_failure'],['ECONNREFUSED','connection_failure'],
  ['UND_ERR_CONNECT_TIMEOUT','connect_timeout'],['UND_ERR_HEADERS_TIMEOUT','headers_timeout'],
 ] as const){
  const f=diagnosticProvider(async()=>{throw Object.assign(new TypeError('private-marker'),{cause:Object.assign(Error('private-marker'),{code})});});
  await assert.rejects(f.p.verify(proofItem()),failureDetail(detail));assert.equal(f.calls(),1);
 }
 const aggregate=diagnosticProvider(async()=>{throw Object.assign(Error('private-marker'),{cause:new AggregateError([Object.assign(Error('private-marker'),{code:'ENOTFOUND'})])});});
 await assert.rejects(aggregate.p.verify(proofItem()),failureDetail('dns_failure'));
 const timeout=diagnosticProvider(async()=>{throw new DOMException('private-marker','TimeoutError');});
 await assert.rejects(timeout.p.verify(proofItem()),failureDetail('request_timeout'));
 const unknown=diagnosticProvider(async()=>{throw Object.assign(Error('private-marker'),{code:'private-marker'});});
 await assert.rejects(unknown.p.verify(proofItem()),failureDetail('transport_unknown_before_headers'));
});
test('Storefront rejected redirect and received HTTP status/HTML are distinct; response bodies and destinations stay private',async()=>{
 const redirected=diagnosticProvider(async()=>{throw Object.assign(new TypeError('private-marker'),{cause:Error('unexpected redirect')});});
 await assert.rejects(redirected.p.verify(proofItem()),failureDetail('redirect_refused'));assert.equal(redirected.calls(),1);
 for(const [status,detail,code] of [[403,'http_403','setup_required'],[404,'http_404','unavailable'],[430,'http_430','unavailable'],[503,'http_503','unavailable'],[302,'http_redirect','unavailable']] as const){
  const f=diagnosticProvider(async()=>new Response('secret-body',{status,headers:{'Content-Type':'text/html','Location':'https://untrusted.invalid/private-marker'}}));
  await assert.rejects(f.p.verify(proofItem()),failureDetail(detail,code));assert.equal(f.calls(),1);
 }
 const html=diagnosticProvider(async()=>new Response('<html>secret-body password page</html>',{headers:{'Content-Type':'text/html'}}));
 await assert.rejects(html.p.verify(proofItem()),failureDetail('html_response','invalid_response'));
});
test('Storefront timeout/body read failure after HTTP headers is not mislabeled as JSON syntax failure',async()=>{
 for(const [error,detail] of [[new DOMException('private-marker','TimeoutError'),'body_timeout'],[Object.assign(Error('private-marker'),{code:'UND_ERR_SOCKET'}),'body_transport_failed']] as const){
  const f=diagnosticProvider(async()=>new Response(new ReadableStream({start(controller){controller.error(error);}}),{headers:{'x-shopify-api-version':STOREFRONT_API_VERSION}}));
  await assert.rejects(f.p.verify(proofItem()),failureDetail(detail,'invalid_response'));assert.equal(f.calls(),1);
 }
});
test('Storefront diagnostic inventory-proof failures happen before fetch; null variant and quantity-rule failures happen after valid HTTP JSON',async()=>{
 for(const [inventoryProof,detail] of [[undefined,'inventory_proof_missing'],[{at:Date.now()-61000,quantity:5,unrestricted:false},'inventory_proof_expired'],[{at:Date.now(),quantity:0,unrestricted:false},'inventory_proof_insufficient']] as const){
  const f=diagnosticProvider(async()=>{throw Error('must not fetch');});
  await assert.rejects(f.p.verify({...item,inventoryProof}),failureDetail(detail));assert.equal(f.calls(),0);
 }
 for(const [node,detail] of [[null,'variant_not_accessible'],[{...variant(),id:'gid://shopify/ProductVariant/99'},'variant_identity_mismatch'],[{...variant(),availableForSale:false},'variant_not_for_sale'],[{...variant(),requiresComponents:true},'variant_unsupported'],[{...variant(),quantityRule:{minimum:3,maximum:null,increment:1}},'quantity_rule_rejected']] as const){
  const f=diagnosticProvider(async()=>new Response(JSON.stringify({data:{node}}),{headers:{'x-shopify-api-version':STOREFRONT_API_VERSION}}));
  await assert.rejects(f.p.verify(proofItem()),failureDetail(detail));assert.equal(f.calls(),1);
 }
});
