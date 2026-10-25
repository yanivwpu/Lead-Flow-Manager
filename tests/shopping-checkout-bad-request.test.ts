import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyBadRequest, badRequestDiagnostic } from '../server/shopping/checkout/badRequestDiagnostic';
const failure=(code:string,fieldName?:string)=>({errors:[{message:'private token=secret https://private.invalid/?key=secret',path:['private'],extensions:{code,fieldName,arbitrary:'private'}}]});
const json=(body:unknown,status=400)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
test('only known codes and audited field names become categories; no provider messages or values escape',()=>{
 for(const [code,category] of [['GRAPHQL_PARSE_FAILED','graphql_parse_error'],['undefinedField','graphql_undefined_field'],['selectionMismatch','graphql_selection_mismatch'],['variableMismatch','graphql_variable_invalid'],['ACCESS_DENIED','graphql_access_denied'],['MAX_COMPLEXITY_EXCEEDED','graphql_complexity_exceeded']] as const){
  assert.equal(classifyBadRequest(failure(code,'quantityRule')),`${category}_quantityRule`);
  assert.equal(classifyBadRequest(failure(code,'private_token_secret')),category);
 }
 for(const value of [failure('PRIVATE_SECRET'),failure('toString'),{errors:[{message:'Access denied private token=secret'}]}])assert.equal(classifyBadRequest(value),'graphql_error_unclassified');
 assert.equal(classifyBadRequest({errors:{query:'private query rejection'}}),'request_envelope_rejected');
 assert.equal(classifyBadRequest({errors:[...failure('ACCESS_DENIED').errors,...failure('undefinedField').errors]}),'graphql_errors_mixed');
 assert.equal(classifyBadRequest({errors:Array.from({length:9},()=>failure('ACCESS_DENIED').errors[0])}),'unclassified');
});
test('bounded HTTP400 JSON diagnostic has no request side effects and ignores other statuses',async()=>{
 assert.equal(await badRequestDiagnostic(json(failure('undefinedField','node'))),'graphql_undefined_field_node');
 const other=json(failure('ACCESS_DENIED'),200);assert.equal(await badRequestDiagnostic(other),'not_applicable');assert.equal(other.bodyUsed,false);
 assert.equal(await badRequestDiagnostic(new Response('<html>private</html>',{status:400,headers:{'content-type':'text/html'}})),'non_json');
 assert.equal(await badRequestDiagnostic(new Response('private invalid JSON',{status:400,headers:{'content-type':'application/json'}})),'invalid_json');
 assert.equal(await badRequestDiagnostic(json({errors:{query:'x'.repeat(17000)}})),'body_too_large');
 const mismatch=json(failure('ACCESS_DENIED'));mismatch.headers.set('x-shopify-api-version','2026-07');
 assert.equal(await badRequestDiagnostic(mismatch),'api_version_mismatch');assert.equal(mismatch.bodyUsed,false);
});
test('stalled and errored response streams produce fixed categories, not raw exceptions',async()=>{
 const original=globalThis.setTimeout;
 try {
  globalThis.setTimeout=((callback:any,ms?:number,...args:any[])=>{assert.equal(ms,2000);return original(callback,1,...args);}) as typeof setTimeout;
  const keepAlive=original(()=>{},1000);
  try {assert.equal(await badRequestDiagnostic(new Response(new ReadableStream({pull(){return new Promise(()=>{});}}),{status:400,headers:{'content-type':'application/json'}})),'body_timeout');}
  finally {clearTimeout(keepAlive);}
 }finally{globalThis.setTimeout=original;}
 const broken=new ReadableStream({start(controller){controller.error(Error('private token=secret'));}});
 assert.equal(await badRequestDiagnostic(new Response(broken,{status:400,headers:{'content-type':'application/json'}})),'body_unreadable');
});
test('existing verification serializes the exact named query and ID variables; HTTP400 stays a rejection',async()=>{
 const { createShopifyCheckoutProvider } = await import('../server/shopping/checkout/shopify');
 const id='gid://shopify/ProductVariant/51638768632090';let calls=0;
 const provider=createShopifyCheckoutProvider({shop:'whachatcrm.myshopify.com',credential:{kind:'tokenless'},fetch:(async(url,init)=>{
  calls++;assert.equal(url,'https://whachatcrm.myshopify.com/api/2026-10/graphql.json');
  assert.deepEqual(init!.headers,{'Content-Type':'application/json'});assert.equal(init!.redirect,'error');
  const envelope=JSON.parse(init!.body as string);assert.deepEqual(Object.keys(envelope).sort(),['query','variables']);
  assert.deepEqual(envelope.variables,{id});
  const contract='query CheckoutVariant($id:ID!) { node(id:$id) { ... on ProductVariant { id availableForSale quantityRule { minimum maximum increment } requiresComponents selectedOptions { name value } price { amount currencyCode } product { id requiresSellingPlan } } } }';
  assert.equal(envelope.query.replace(/\s+/g,''),contract.replace(/\s+/g,''));
  return json(failure('undefinedField','quantityRule'));
 }) as typeof fetch});
 await assert.rejects(provider.verify({productId:'gid://shopify/Product/10108113912090',variantId:id,quantity:1,price:'600.00',currency:'USD',options:[{name:'Title',value:'Default Title'}],inventoryProof:{at:Date.now(),quantity:50,unrestricted:false}}),(e:any)=>e.code==='unavailable' && e.detail==='http_client_error');
 assert.equal(calls,1);
});

test('only the exact known Shopify BAD_REQUEST maps to the protected Online Store category',()=>{
 const locked={message:'Online Store channel is locked.',extensions:{code:'BAD_REQUEST'}};
 assert.equal(classifyBadRequest({errors:[locked]}),'online_store_channel_locked');
 assert.equal(classifyBadRequest({errors:[{...locked,message:'Online Store channel is locked. token=private'}]}),'graphql_error_unclassified');
 assert.equal(classifyBadRequest({errors:[{...locked,extensions:{code:'UNKNOWN'}}]}),'graphql_error_unclassified');
 assert.equal(classifyBadRequest({errors:[locked,...failure('ACCESS_DENIED').errors]}),'graphql_errors_mixed');
});
