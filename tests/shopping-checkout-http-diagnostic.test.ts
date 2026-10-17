import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyHttpSummary, storefrontHttpSummary } from '../server/shopping/checkout/httpDiagnostic';
test('summary projects only status, followed-redirect flag, content family and header presence',()=>{
 for(const [mime,family] of [['application/json','JSON'],['application/graphql-response+json; charset=utf-8','JSON'],['APPLICATION/PROBLEM+JSON','JSON'],['text/html; charset=utf-8','HTML'],['application/xhtml+xml','HTML'],['text/plain','other'],['application/json-secret','other'],['','other']] as const){
  const r=new Response('private body',{status:404,headers:{'content-type':mime,'x-shopify-api-version':'private value','set-cookie':'private cookie','location':'https://private.invalid/?key=private'}});
  r.json=()=>{throw Error('body must never be read by summary');};
  assert.deepEqual(storefrontHttpSummary(r),{httpStatus:404,redirectOccurred:false,contentTypeFamily:family,apiVersionHeaderPresent:true});
 }
 assert.deepEqual(emptyHttpSummary(),{httpStatus:null,redirectOccurred:null,contentTypeFamily:null,apiVersionHeaderPresent:null});
});
test('a redirect HTTP response is not evidence that fetch followed a redirect',()=>{
 const r=new Response(null,{status:302,headers:{Location:'https://private.invalid'}});
 assert.equal(storefrontHttpSummary(r).redirectOccurred,false);
 Object.defineProperty(r,'redirected',{value:true});assert.equal(storefrontHttpSummary(r).redirectOccurred,true);
});
