import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { consumeDispatch } from '../scripts/checkout-validation/private-files';
import { runValidation, SHOP, META, selectionDigest, authorize } from '../scripts/checkout-validation/harness';
const selection={shop:SHOP,userId:'owner',productId:'gid://shopify/Product/1',variantId:'gid://shopify/ProductVariant/2',quantity:1,price:'12.00',currency:'USD',options:[{name:'Title',value:'Default Title'}]};
const approval=()=>({action:'CREATE EXACTLY ONE DEVELOPMENT STORE CART',selectionSha256:selectionDigest(selection),expiresAt:new Date(Date.now()+600000).toISOString(),approvedBy:'fixture operator',developmentStoreEvidence:'synthetic fixture'});
function fixture(change:{meta?:(m:any)=>any;variant?:(v:any)=>any;cart?:(c:any)=>any;ambiguous?:boolean;installationChanged?:boolean}={}) {
 let mutations=0, consumed=false, saved=false, installs=0; const calls:string[]=[];
 const variant={id:selection.variantId,selectedOptions:selection.options,price:'12.00',availableForSale:true,requiresComponents:false,inventoryQuantity:5,inventoryPolicy:'DENY',inventoryItem:{tracked:true},product:{id:selection.productId,status:'ACTIVE',publishedAt:'2020-01-01T00:00:00Z',requiresSellingPlan:false}};
 const deps={
  installation:async()=>({shop:SHOP,integrationId:'installation',token:change.installationChanged && ++installs>1?'changed':'synthetic-admin'}),
  requestFor:()=>async(query:string)=>query===META ? (change.meta?.({shop:{myshopifyDomain:SHOP,plan:{partnerDevelopment:true}},currentAppInstallation:{app:{apiKey:'e4585d4da1434c9e5649a2269e716076'},accessScopes:[{handle:'read_products'},{handle:'read_inventory'}]}})??{shop:{myshopifyDomain:SHOP,plan:{partnerDevelopment:true}},currentAppInstallation:{app:{apiKey:'e4585d4da1434c9e5649a2269e716076'},accessScopes:[{handle:'read_products'},{handle:'read_inventory'}]}}):{shop:{myshopifyDomain:SHOP,currencyCode:'USD'},nodes:[change.variant?.(variant)??variant]},
  storefrontFetch:(async(url:any,init:any)=>{
   assert.equal(url,`https://${SHOP}/api/2026-10/graphql.json`);assert.deepEqual(init.headers,{'Content-Type':'application/json'});assert.equal(init.redirect,'error');
   const {query,variables}=JSON.parse(init.body); calls.push(query);
   const cart={id:'gid://shopify/Cart/fixture?key=private',checkoutUrl:`https://${SHOP}/cart/c/fixture?key=private`,totalQuantity:1,lines:{nodes:[{quantity:1,merchandise:{id:selection.variantId,product:{id:selection.productId}},cost:{amountPerQuantity:{amount:'12.00',currencyCode:'USD'}}}]}};
   let data;
   if(query.startsWith('mutation')) {assert.equal(consumed,true);mutations++;assert.deepEqual(variables,{input:{lines:[{merchandiseId:selection.variantId,quantity:1}]}});if(change.ambiguous)throw Error('synthetic network failure');data={cartCreate:{cart:change.cart?.(cart)??cart,userErrors:[],warnings:[]}};}
   else if(query.includes('CheckoutStatus'))data={cart};
   else data={node:{...variant,price:{amount:'12.00',currencyCode:'USD'},quantityRule:{minimum:1,maximum:null,increment:1}}};
   return new Response(JSON.stringify({data}),{headers:{'x-shopify-api-version':'2026-10'}});
  }) as typeof fetch,
  consume:async()=>{if(consumed)throw Error('already_consumed');consumed=true;},
  saveReceipt:async()=>{saved=true;},
 };
 return {deps,counts:()=>({mutations,consumed,saved}),calls};
}
test('preflight uses real provider verification without cart dispatch or local claim',async()=>{
 const f=fixture();const result=await runValidation(selection,f.deps);assert.equal(result.cartCreated,false);assert.deepEqual(f.counts(),{mutations:0,consumed:false,saved:false});assert.equal(f.calls.length,1);
});
test('exact approval allows one claimed provider cart and status verification',async()=>{
 const f=fixture();assert.equal((await runValidation(selection,{...f.deps,approval:approval()})).cartCreated,true);assert.deepEqual(f.counts(),{mutations:1,consumed:true,saved:true});assert.equal(f.calls.length,4);
 await assert.rejects(runValidation(selection,{...f.deps,approval:approval()}),/already_consumed/);assert.equal(f.counts().mutations,1);
});
test('wrong shop or expired/mismatched authorization fails before any network call',async()=>{
 const f=fixture();await assert.rejects(runValidation({...selection,shop:'other.myshopify.com'},f.deps));
 for(const a of [{...approval(),expiresAt:'2020-01-01T00:00:00Z'},{...approval(),selectionSha256:'0'.repeat(64)},{...approval(),action:'yes'}])await assert.rejects(runValidation(selection,{...f.deps,approval:a}));
 assert.equal(f.calls.length,0);assert.throws(()=>authorize(selection,{...approval(),expiresAt:new Date(Date.now()+3600000).toISOString()}));
});
test('live development plan, correct app and existing scope grants are mandatory',async()=>{
 for(const meta of [(m:any)=>({...m,shop:{...m.shop,plan:{partnerDevelopment:false}}}),(m:any)=>({...m,currentAppInstallation:{...m.currentAppInstallation,app:{apiKey:'other'}}}),(m:any)=>({...m,currentAppInstallation:{...m.currentAppInstallation,accessScopes:[]}})]){
 const f=fixture({meta});await assert.rejects(runValidation(selection,{...f.deps,approval:approval()}));assert.equal(f.calls.length,0);assert.equal(f.counts().consumed,false);
 }
});
test('unpublished, changed variant/options/price/currency, unsupported components and insufficient inventory fail closed',async()=>{
 for(const variant of [(v:any)=>({...v,product:{...v.product,publishedAt:null}}),(v:any)=>({...v,id:'gid://shopify/ProductVariant/3'}),(v:any)=>({...v,price:'13'}),(v:any)=>({...v,selectedOptions:[]}),(v:any)=>({...v,requiresComponents:true}),(v:any)=>({...v,inventoryQuantity:0})]){
 const f=fixture({variant});await assert.rejects(runValidation(selection,{...f.deps,approval:approval()}));assert.equal(f.counts().mutations,0);
 }
 const f=fixture();await assert.rejects(runValidation({...selection,currency:'EUR'},{...f.deps}));assert.equal(f.counts().mutations,0);
});
test('installation replacement, partial cart and ambiguous mutation never silently retry',async()=>{
 const replaced=fixture({installationChanged:true});await assert.rejects(runValidation(selection,{...replaced.deps,approval:approval()}));assert.equal(replaced.counts().mutations,0);
 for(const change of [{ambiguous:true},{cart:(c:any)=>({...c,totalQuantity:2})}]){
 const f=fixture(change);await assert.rejects(runValidation(selection,{...f.deps,approval:approval()}));await assert.rejects(runValidation(selection,{...f.deps,approval:approval()}));assert.equal(f.counts().mutations,1);
 }
});
test('CLI has read-only transaction, exclusive durable claim, private receipt and no app bootstrap; gate stays false',()=>{
 const cli=readFileSync('scripts/validate-shopify-checkout.ts','utf8');assert.match(cli,/BEGIN READ ONLY/);const files=readFileSync('scripts/checkout-validation/private-files.ts','utf8');assert.match(files,/'wx',0o600/);assert.match(files,/await file.sync\(\)/);assert.doesNotMatch(cli,/import\(['"].*(?:db|routes|index)['"]\)/);
 assert.match(readFileSync('server/shopping/checkout/authorization.ts','utf8'),/CHECKOUT_ROLLOUT_APPROVED: boolean = false/);
});

test('real filesystem claim is exclusive across racing invocations and remains consumed',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'checkout-claim-'));
 try {
  const claims=await Promise.allSettled([consumeDispatch(dir),consumeDispatch(dir)]);
  assert.equal(claims.filter(c=>c.status==='fulfilled').length,1);
  assert.equal((await stat(join(dir,'cart-dispatch-consumed.json'))).mode & 0o777,0o600);
  await assert.rejects(consumeDispatch(dir));
 } finally {await rm(dir,{recursive:true,force:true});}
});
