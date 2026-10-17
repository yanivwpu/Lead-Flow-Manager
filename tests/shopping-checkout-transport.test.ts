import test from 'node:test';
import assert from 'node:assert/strict';
import { createShopifyCheckoutProvider } from '../server/shopping/checkout/shopify';
import { CheckoutError } from '../server/shopping/checkout/contract';
import { verificationStage } from '../server/shopping/checkout/preflightDiagnostics';
import { transportDetail } from '../server/shopping/checkout/storefrontDiagnostics';
const shop='whachatcrm.myshopify.com';
const item=()=>({productId:'gid://shopify/Product/1',variantId:'gid://shopify/ProductVariant/2',quantity:1,price:'600.00',currency:'USD',options:[{name:'Title',value:'Default Title'}],inventoryProof:{at:Date.now(),quantity:50,unrestricted:false}});
const node=()=>({id:item().variantId,availableForSale:true,requiresComponents:false,selectedOptions:item().options,price:{amount:'600.00',currencyCode:'USD'},product:{id:item().productId,requiresSellingPlan:false},quantityRule:{minimum:1,maximum:null,increment:1}});
const response=(value:any)=>new Response(JSON.stringify({data:{node:value}}),{headers:{'x-shopify-api-version':'2026-10','Content-Type':'application/json'}});
function provider(implementation:(init:RequestInit)=>Promise<Response>) {
 let calls=0;
 const p=createShopifyCheckoutProvider({shop,credential:{kind:'tokenless'},fetch:(async(url,init)=>{
  calls++;assert.equal(url,`https://${shop}/api/2026-10/graphql.json`);
  assert.equal(init?.method,'POST');assert.equal(init?.redirect,'error');assert.deepEqual(init?.headers,{'Content-Type':'application/json'});
  assert.match(JSON.parse(init!.body as string).query,/^query CheckoutVariant/);
  assert.equal(init!.signal?.aborted,false);return implementation(init!);
 }) as typeof fetch});
 return {p,calls:()=>calls};
}
async function fails(implementation:(init:RequestInit)=>Promise<Response>,detail:string) {
 const {p,calls}=provider(implementation);
 await assert.rejects(verificationStage('storefront',()=>p.verify(item())),(error:any)=>{
  assert.equal(error.code,`checkout_test_storefront_${detail}`);
  assert.doesNotMatch(JSON.stringify(error),/private|secret|key=|https:|token=/);return true;
 });assert.equal(calls(),1);
}
test('transport errors retain fixed timeout/DNS/TLS/connect/socket categories without exception text or retries',async()=>{
 for(const [error,detail] of [
  [new DOMException('private token=secret','TimeoutError'),'transport_timeout'],
  [new DOMException('private token=secret','AbortError'),'transport_aborted'],
  ...[['ENOTFOUND','transport_dns'],['EAI_AGAIN','transport_dns'],['ERR_TLS_CERT_ALTNAME_INVALID','transport_tls'],['CERT_HAS_EXPIRED','transport_tls'],['ECONNREFUSED','transport_connect'],['ENETUNREACH','transport_connect'],['UND_ERR_SOCKET','transport_socket'],['UND_ERR_CONNECT_TIMEOUT','transport_timeout'],['UNKNOWN_PRIVATE_CODE','transport_unknown']].map(([code,detail])=>[new TypeError('private token=secret',{cause:Object.assign(new Error('private token=secret'),{code})}),detail]),
  [new TypeError('fetch failed',{cause:new Error('unexpected redirect')}),'transport_redirect'],
 ] as const)await fails(async()=>{throw error;},detail as string);
});
test('bounded AggregateError/cyclic cause handling cannot mislabel mixed failures as a confirmed cause',()=>{
 const dns=Object.assign(new Error('private'),{code:'ENOTFOUND'}), tls=Object.assign(new Error('private'),{code:'CERT_HAS_EXPIRED'});
 assert.equal(transportDetail(new AggregateError([dns,dns])),'transport_dns');
 assert.equal(transportDetail(new AggregateError([dns,tls])),'transport_unknown');
 const cyclic:any={};cyclic.cause=cyclic;assert.equal(transportDetail(cyclic),'transport_unknown');
});
test('HTTP responses, HTML access gates, served-version mismatch and missing data remain distinct',async()=>{
 for(const [status,detail] of [[302,'http_redirect'],[404,'http_client_error'],[423,'http_client_error'],[503,'http_server_error']] as const)
  await fails(async()=>new Response('private token=secret',{status}),detail);
 await fails(async()=>new Response('<html>private password page token=secret</html>',{headers:{'Content-Type':'text/html; charset=utf-8'}}),'http_html_response');
 await fails(async()=>new Response('{}',{headers:{'x-shopify-api-version':'2026-07'}}),'api_version_mismatch');
 await fails(async()=>new Response('{}',{headers:{'x-shopify-api-version':'2026-10'}}),'missing_data');
});
test('HTTP headers received: body read timeout, body socket failure and invalid JSON differ',async()=>{
 for(const [error,detail] of [[new DOMException('private','TimeoutError'),'response_body_timeout'],[Object.assign(new Error('private'),{code:'UND_ERR_SOCKET'}),'response_body_read_failed'],[new SyntaxError('private token=secret'),'invalid_json']] as const)
  await fails(async()=>{const r=response(node());r.json=async()=>{throw error;};return r;},detail);
});
test('successful HTTP/GraphQL response still rejects absent variant, identity, availability, unsupported items and quantity rules',async()=>{
 for(const [variant,detail] of [[null,'variant_not_visible'],[{...node(),id:'gid://shopify/ProductVariant/9'},'variant_identity_mismatch'],[{...node(),availableForSale:false},'variant_unavailable'],[{...node(),requiresComponents:true},'unsupported_variant'],[{...node(),quantityRule:null},'quantity_rule_invalid'],[{...node(),quantityRule:{minimum:2,maximum:null,increment:1}},'quantity_rule_rejected']] as const)
  await fails(async()=>response(variant),detail);
 const f=provider(async()=>response(node()));await f.p.verify(item());assert.equal(f.calls(),1);
});
test('invalid inventory proof stops before HTTP; mutation ambiguity codes stay unchanged',async()=>{
 const f=provider(async()=>response(node()));
 await assert.rejects(f.p.verify({...item(),inventoryProof:undefined}),(e:any)=>e instanceof CheckoutError && e.code==='unavailable' && e.detail==='inventory_proof_invalid');assert.equal(f.calls(),0);
 let calls=0;const p=createShopifyCheckoutProvider({shop,credential:{kind:'tokenless'},fetch:(async()=>{if(++calls===1)return response(node());throw Object.assign(new Error('private'),{code:'ENOTFOUND'});}) as typeof fetch});
 await assert.rejects(p.prepare(item()),(e:any)=>e.code==='ambiguous' && e.detail==='transport_dns');assert.equal(calls,2);
});

test('the original 15000ms request abort covers fetch without retries',async()=>{
 const original=AbortSignal.timeout;
 try {
  AbortSignal.timeout=((ms:number)=>{assert.equal(ms,15000);return original(1);}) as typeof AbortSignal.timeout;
  const keepAlive=setTimeout(()=>{},1000);
  try {await fails(init=>new Promise((_resolve,reject)=>{init.signal!.addEventListener('abort',()=>reject(init.signal!.reason),{once:true});}),'transport_timeout');}
  finally {clearTimeout(keepAlive);}
 } finally {AbortSignal.timeout=original;}
});
