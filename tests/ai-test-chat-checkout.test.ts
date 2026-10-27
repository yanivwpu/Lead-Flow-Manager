import test from 'node:test';
import { EventEmitter } from 'node:events';
import { createPrivateCartHandoff, PRIVATE_CART_CONFIRMATION, PRIVATE_CART_EXECUTION_ENABLED } from '../server/aiTestChat/cartHandoff';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eq,sql } from 'drizzle-orm';
import { users,integrations,catalogSources,catalogProducts,catalogVariants,aiTestSessions } from '../shared/schema';
import { catalogFixture } from './shopify-catalog-fixture';
import { AI_TEST_CHAT_SCHEMA_SQL } from '../server/aiTestChat/schemaSql';
import { createTestChatSessions } from '../server/aiTestChat/sessions';
import { createPrivateCheckoutPreflight,privatePreflightCredential } from '../server/aiTestChat/checkoutPreflight';
import { registerTestChatRoutes } from '../server/aiTestChat/routes';
import { ensureCatalogSource } from '../server/salesCatalog/shopify/installation';
import { SHOP,META } from '../server/shopping/checkout/controlledValidation';

const id='10000000-0000-4000-8000-000000000042',auth={workspaceUserId:id,actorUserId:id};
const product='gid://shopify/Product/10108114174234',variant='gid://shopify/ProductVariant/51638769221914';
const env=()=>({ECOMMERCE_PILOT_ENABLED:'true',RAILWAY_ENVIRONMENT_NAME:'production',APP_URL:'https://app.whachatcrm.com',
 ECOMMERCE_PILOT_WORKSPACE_ID:id,ECOMMERCE_PILOT_OWNER_EMAIL:'pilot-owner@example.invalid',PRIVATE_SHOPPING_PILOT_WORKSPACE_ID:id,
 SHOPIFY_CHECKOUT_TEST_WORKSPACE_ID:id,SHOPIFY_CHECKOUT_TEST_OPERATOR_IDS:id});
async function fixture() {
 const f=await catalogFixture(),db=f.database;
 try {
 await db.update(users).set({id,email:'pilot-owner@example.invalid',shopifyShop:SHOP}).where(eq(users.id,'tenant-a'));
 await db.update(integrations).set({userId:id,config:{shopUrl:SHOP}}).where(eq(integrations.id,'integration-a'));
 await f.pg.exec(AI_TEST_CHAT_SCHEMA_SQL);
 await f.pg.exec(readFileSync('migrations/0112_shopify_checkout_admin_tests.sql','utf8'));
 const source=(await ensureCatalogSource(db,id))!;
 await db.update(catalogSources).set({status:'ready',currency:'USD',initialSyncCompletedAt:new Date()}).where(eq(catalogSources.id,source.id));
 await db.insert(catalogProducts).values({id:'p',userId:id,sourceId:source.id,externalId:product,title:'The Collection Snowboard: Liquid',searchText:'liquid',status:'ACTIVE',published:true,complete:true,variantCount:1,providerUpdatedAt:new Date()});
 await db.insert(catalogVariants).values({id:'v',userId:id,sourceId:source.id,productId:'p',externalId:variant,title:'Default Title',options:[{name:'Title',value:'Default Title'}],price:'749.95',currency:'USD',providerUpdatedAt:new Date(),verifiedAt:new Date(),generation:'fixture'});
 const session=await createTestChatSessions(db).create(auth);
 let state:any={version:1,step:'confirming',intent:'availability',sourceId:source.id,quantity:1,choices:[],updatedAt:new Date().toISOString(),lastEventId:'selected',consumedEventIds:['selected'],
  selected:{productId:'p',variantId:'v',productTitle:'The Collection Snowboard: Liquid',variantTitle:'Default Title',price:'749.95',currency:'USD',options:[{name:'Title',value:'Default Title'}],verifiedAt:new Date(0).toISOString()}};
 async function save(patch:Record<string,unknown>={}){state={...state,...patch};await db.update(aiTestSessions).set({shoppingState:state}).where(eq(aiTestSessions.id,session.id));}
 await save();
 let reads=0,creates=0,status=200,changed=false,afterFetch:(()=>Promise<void>)|undefined,authorized=true,entitled=true;
 const configured:NodeJS.ProcessEnv=env();
 const live=()=>({id:variant,price:'749.95',selectedOptions:[{name:'Title',value:'Default Title'}],availableForSale:true,requiresComponents:false,inventoryQuantity:50,inventoryPolicy:'DENY',inventoryItem:{tracked:true},
  product:{id:product,title:'The Collection Snowboard: Liquid',status:'ACTIVE',publishedAt:'2020-01-01T00:00:00Z',requiresSellingPlan:false}});
 const requestFor=()=>async(query:string)=>{reads++;return query===META?{shop:{myshopifyDomain:SHOP,plan:{partnerDevelopment:true}},currentAppInstallation:{app:{apiKey:'e4585d4da1434c9e5649a2269e716076'},accessScopes:[{handle:'read_products'},{handle:'read_inventory'}]}}:
  {shop:{myshopifyDomain:SHOP,currencyCode:'USD'},nodes:[live()]};};
 let nodePatch:any=undefined;
 let cartMode:'success'|'ambiguous'|'mismatch'|'status-failed'|'rejected'|'http-denied'|'http-throttled'|'graphql-rejected'|'graphql-partial'|'version-mismatch'|undefined;
 const cart=()=>({id:'gid://shopify/Cart/fixture',checkoutUrl:'https://whachatcrm.myshopify.com/cart/c/fixture?key=fixture-secret',totalQuantity:1,
  lines:{nodes:[{quantity:1,merchandise:{id:variant,product:{id:product}},cost:{amountPerQuantity:{amount:cartMode==='mismatch'?'999.00':'749.95',currencyCode:'USD'}}}]}});
 const cartResponse=(data:any)=>new Response(JSON.stringify({data}),{headers:{'content-type':'application/json','x-shopify-api-version':'2026-10'}});
 const headers:any[]=[];
 const storefrontFetch=(async(_url:any,init:any)=>{
  const body=JSON.parse(init.body);if(body.query.startsWith('mutation')){
   creates++;if(!cartMode)throw Error('MUTATION FORBIDDEN');
   if(cartMode==='version-mismatch')return new Response(JSON.stringify({data:{cartCreate:{cart:cart(),userErrors:[],warnings:[]}}}),{headers:{'x-shopify-api-version':'2026-07'}});
   if(cartMode==='ambiguous')throw Error('synthetic lost response');
   if(cartMode==='http-denied'||cartMode==='http-throttled')return new Response('private-provider-message',{status:cartMode==='http-denied'?403:429,
    headers:{'x-shopify-api-version':'2026-10','x-request-id':'05185397-bb4e-4a80-9c67-e986fc5abb12'}});
   if(cartMode==='graphql-rejected'||cartMode==='graphql-partial')return new Response(JSON.stringify({
    data:cartMode==='graphql-partial'?{cartCreate:{cart:cart()}}:null,
    errors:[{message:'private-provider-message',extensions:{code:'ACCESS_DENIED'}}],
   }),{headers:{'content-type':'application/json','x-shopify-api-version':'2026-10'}});
   return cartResponse({cartCreate:{cart:cartMode==='rejected'?null:cart(),userErrors:cartMode==='rejected'?[{code:'INVALID',message:'private-provider-message'}]:[],warnings:[]}});
  }
  if(body.query.startsWith('query CheckoutStatus'))return cartResponse({cart:cartMode==='status-failed'?null:cart()});
  assert.match(body.query,/^query CheckoutVariant\(/);assert.equal(body.variables.id,variant);headers.push(init.headers);
  if(afterFetch)await afterFetch();
  const response=status===400?{errors:[{message:'Online Store channel is locked.',extensions:{code:'BAD_REQUEST'}}]}:
   {data:{node:nodePatch===null?null:{...live(),price:{amount:changed?'999.00':'749.95',currencyCode:'USD'},quantityRule:{minimum:1,maximum:null,increment:1},quantityAvailable:50,currentlyNotInStock:false,...nodePatch}}};
  return new Response(JSON.stringify(response),{status,headers:{'content-type':'application/json','x-shopify-api-version':'2026-10'}});
 }) as typeof fetch;
 let executionEnabled:boolean|undefined=false;
 let handlers:Record<string,any>={};
 function mount(){
  const executionGate=executionEnabled===undefined?{}:{executionEnabled:()=>executionEnabled!};
  handlers={};const app={get:(p:string,h:any)=>handlers['GET '+p]=h,post:(p:string,h:any)=>handlers['POST '+p]=h,delete:(p:string,h:any)=>handlers['DELETE '+p]=h};
  registerTestChatRoutes(app as any,{db,authorize:async(req,res)=>{if(!authorized){res.status(401).json({error:'unauthorized'});return null;}return req.auth??auth;},
   access:async()=>({allowed:entitled}),generate:(async()=>{throw Error('AI must not run');}) as any,diagnostics:async()=>({}),
   checkoutHandoffExecute:createPrivateCartHandoff({db,entitled:async()=>entitled,env:configured,requestFor,storefrontFetch,...executionGate}).execute,
   checkoutHandoffInspect:createPrivateCartHandoff({db,entitled:async()=>entitled,env:configured,requestFor,storefrontFetch,...executionGate}).inspect,
   checkoutHandoffPrepare:createPrivateCartHandoff({db,entitled:async()=>entitled,env:configured,requestFor,storefrontFetch}).prepare,
   checkoutPreflight:createPrivateCheckoutPreflight({db,entitled:async()=>entitled,env:configured,requestFor,storefrontFetch})});
 }
 mount();
 async function call(body:any={},patch:any={}){let code=200,data:any;const res:any=Object.assign(new EventEmitter(),{writableEnded:false,set:()=>res,status:(n:number)=>{code=n;return res;},json:(d:any)=>{data=d;res.writableEnded=true;return res;}});
  patch.captureResponse?.(res);
  await handlers[(patch.method??'POST')+' /api/ai/test-chat/:id/'+(patch.action??'checkout-preflight')](Object.assign(new EventEmitter(),{params:{id:session.id},sessionID:'authenticated-fixture-session',body,is:()=>true,get:()=>undefined,...patch}),res);
  return {code,data};}
 return {...f,db,session,source,save,call,mount,configured,headers,requestFor,storefrontFetch,executionEnabled:(v:boolean)=>{executionEnabled=v;},useSourceGate:()=>{executionEnabled=undefined;mount();},
  nodePatch:(value:any)=>{nodePatch=value;},cartMode:(value:typeof cartMode)=>{cartMode=value;},entitled:async()=>entitled,state:()=>state,reads:()=>reads,creates:()=>creates,
  provider:(s:number,c=false)=>{status=s;changed=c;},afterFetch:(run?:()=>Promise<void>)=>{afterFetch=run;},authorize:(value:boolean)=>{authorized=value;},entitle:(value:boolean)=>{entitled=value;}};
 } catch(error) { await f.cleanup(); throw error; }
}
test('authenticated persisted Liquid/quantity preflight survives reload and never creates a cart/approval or changes persisted state/transcript',async()=>{
 const f=await fixture();try{
  await f.save({quantity:2});
  const before=await f.pg.query('SELECT * FROM ai_test_sessions');
  const first=await f.call();assert.equal(first.code,200);assert.equal(first.data.ready,true);
  assert.equal(first.data.cartCreationEnabled,false);assert.equal(first.data.cartCreated,false);
  assert.deepEqual(first.data.inventory.quantity,50);assert.equal(first.data.selection.quantity,2);
  assert.equal(first.data.selection.variantId,variant);assert.equal(first.data.selection.price,'749.95');
  assert.equal(first.data.nextAction,'separate_cart_approval_required');
  assert.equal(first.data.operatorCartAccessConfigured,true);
  f.mount();const again=await f.call();assert.equal(again.data.sessionBinding,first.data.sessionBinding);
  assert.equal(again.data.ready,true);assert.equal(f.creates(),0);
  assert.notEqual((await f.call({},{sessionID:'new-authenticated-fixture-session'})).data.sessionBinding,first.data.sessionBinding);
  assert.deepEqual((await f.pg.query('SELECT * FROM ai_test_sessions')).rows,before.rows);
  assert.equal((await f.pg.query('SELECT count(*)::int AS n FROM shopify_checkout_admin_tests')).rows[0].n,0);
  assert.doesNotMatch(JSON.stringify(again.data),/fixture-token|authenticated-fixture-session|checkoutUrl|providerCartId/);
  assert.equal(f.headers[0]['X-Shopify-Storefront-Access-Token'],undefined);
 }finally{await f.cleanup();}
});
test('private route rejects missing auth, other actor/workspace, invalid input, expiry, turn lease and absent selection before provider IO',async()=>{
 const f=await fixture();try{
  f.authorize(false);assert.equal((await f.call()).code,401);f.authorize(true);
  f.entitle(false);assert.equal((await f.call()).code,403);f.entitle(true);
  f.configured.RAILWAY_ENVIRONMENT_NAME='staging';assert.equal((await f.call()).code,404);f.configured.RAILWAY_ENVIRONMENT_NAME='production';
  for(const patch of [{sessionID:null},{is:()=>false},{get:()=> 'cross-site'}])assert.equal((await f.call({},patch)).code,403);
  assert.equal((await f.call({quantity:2,variantId:variant})).code,400);
  assert.equal((await f.call({},{params:{id:'invalid'}})).code,400);
  for(const bad of [{workspaceUserId:'tenant-b',actorUserId:'tenant-b'},{...auth,actorUserId:'tenant-b'}])assert.equal((await f.call({},{auth:bad})).code,404);
  await f.db.update(users).set({email:'other@example.invalid'}).where(eq(users.id,id));assert.equal((await f.call()).code,404);
  await f.db.update(users).set({email:'pilot-owner@example.invalid'}).where(eq(users.id,id));
  await f.db.update(aiTestSessions).set({expiresAt:new Date(0)}).where(eq(aiTestSessions.id,f.session.id));assert.equal((await f.call()).code,404);
  await f.db.update(aiTestSessions).set({expiresAt:new Date(Date.now()+600000),leaseUntil:new Date(Date.now()+30000)}).where(eq(aiTestSessions.id,f.session.id));assert.equal((await f.call()).code,409);
  await f.db.update(aiTestSessions).set({leaseUntil:null}).where(eq(aiTestSessions.id,f.session.id));
  for(const patch of [{step:'selecting'},{step:'confirming',quantity:0},{quantity:1,pending:{action:'select'}},{pending:undefined,updatedAt:new Date(0).toISOString()}]){
   await f.save(patch);assert.equal((await f.call()).code,409);
  }
  assert.equal(f.reads(),0);assert.equal(f.headers.length,0);assert.equal(f.creates(),0);
 }finally{await f.cleanup();}
});
test('locked tokenless Storefront is diagnosed; store-bound token uses existing provider, changed prices and superseded sessions fail closed',async()=>{
 const f=await fixture();try{
  f.provider(400);let result=await f.call();assert.equal(result.data.ready,false);
  assert.equal(result.data.error,'checkout_test_storefront_bad_request_online_store_channel_locked');
  Object.assign(f.configured,{SHOPIFY_STOREFRONT_TEST_TOKEN:'synthetic-storefront-credential',SHOPIFY_STOREFRONT_TEST_TOKEN_KIND:'public',SHOPIFY_STOREFRONT_TEST_SHOP:SHOP});
  f.configured.SHOPIFY_STOREFRONT_TEST_TOKEN='fixture-token-a';assert.equal((await f.call()).code,503);
  f.configured.SHOPIFY_STOREFRONT_TEST_TOKEN='synthetic-storefront-credential';
  f.provider(200);result=await f.call();assert.equal(result.data.ready,true);
  assert.equal(f.headers.at(-1)['X-Shopify-Storefront-Access-Token'],'synthetic-storefront-credential');
  assert.doesNotMatch(JSON.stringify(result.data),/synthetic-storefront-credential|fixture-token/);
  f.configured.SHOPIFY_STOREFRONT_TEST_TOKEN_KIND='private';assert.equal((await f.call()).data.ready,true);
  assert.equal(f.headers.at(-1)['Shopify-Storefront-Private-Token'],'synthetic-storefront-credential');
  f.provider(200,true);result=await f.call();assert.equal(result.data.error,'checkout_test_storefront_changed');
  f.provider(429);result=await f.call();assert.equal(result.data.error,'checkout_test_storefront_throttled');
  await f.save({selected:{...f.state().selected,price:'750.00'}});
  f.provider(200);result=await f.call();assert.equal(result.data.error,'checkout_test_selection_unavailable_or_changed');
  await f.save({selected:{...f.state().selected,price:'749.95'}});
  f.afterFetch(async()=>{await f.save({quantity:2});});assert.equal((await f.call()).code,409);
  f.afterFetch(async()=>{await f.db.update(integrations).set({isActive:false}).where(eq(integrations.id,'integration-a'));});assert.equal((await f.call()).code,409);
  assert.equal(f.creates(),0);assert.equal((await f.pg.query('SELECT count(*)::int AS n FROM shopify_checkout_admin_tests')).rows[0].n,0);
 }finally{await f.cleanup();}
});
test('Storefront test credentials require exact shop binding and complete configuration without token-prefix guesses',()=>{
 assert.deepEqual(privatePreflightCredential({}),{kind:'tokenless'});
 assert.equal(privatePreflightCredential({SHOPIFY_STOREFRONT_TEST_TOKEN:'shpat_synthetic-private',SHOPIFY_STOREFRONT_TEST_TOKEN_KIND:'private',SHOPIFY_STOREFRONT_TEST_SHOP:SHOP}).kind,'private');
 const valid={SHOPIFY_STOREFRONT_TEST_TOKEN:'synthetic-storefront',SHOPIFY_STOREFRONT_TEST_TOKEN_KIND:'public',SHOPIFY_STOREFRONT_TEST_SHOP:SHOP};
 for(const patch of [{SHOPIFY_STOREFRONT_TEST_SHOP:'other.myshopify.com'},{SHOPIFY_STOREFRONT_TEST_TOKEN_KIND:'admin'},{SHOPIFY_STOREFRONT_TEST_TOKEN:undefined}])
  assert.throws(()=>privatePreflightCredential({...valid,...patch}),/storefront_test_credential_setup_required/);
});

test('private readiness honors an existing consumed dispatch and the same durable index without resetting either',async()=>{
 const f=await fixture();try{
  await f.db.execute(sql`INSERT INTO public.shopify_checkout_admin_tests
   (request_id,workspace_id,operator_id,session_digest,shop,integration_id,installation_digest,selection,selection_digest,expires_at,approved_at,claimed_at)
   VALUES (gen_random_uuid(),${id},${id},'fixture',${SHOP},'integration-a','fixture','{}'::jsonb,'fixture',now()+interval '10 minutes',now(),now())`);
  const denied=await f.call();assert.equal(denied.code,409);assert.equal(denied.data.error,'development_store_dispatch_already_consumed');
  assert.equal(f.reads(),0);assert.equal(f.creates(),0);
  await f.pg.exec('DROP INDEX shopify_checkout_admin_one_dispatch');
  assert.equal((await f.call()).code,503);assert.equal(f.reads(),0);
  assert.equal((await f.pg.query('SELECT count(*)::int AS n FROM shopify_checkout_admin_tests WHERE claimed_at IS NOT NULL')).rows[0].n,1);
 }finally{await f.cleanup();}
});

async function bridgeFixture(second=false) {
 const f=await fixture();
 Object.assign(f.configured,{SHOPIFY_STOREFRONT_TEST_TOKEN:'synthetic-storefront-credential',SHOPIFY_STOREFRONT_TEST_TOKEN_KIND:'private',SHOPIFY_STOREFRONT_TEST_SHOP:SHOP});
 let enabled=true;const diagnostics:import("../server/shopping/checkout/executionDiagnostics").ExecutionDiagnostic[]=[];
 const deps={db:f.db,entitled:f.entitled,env:f.configured,requestFor:f.requestFor,storefrontFetch:f.storefrontFetch,secondExecutionEnabled:()=>second,executionDiagnostic:(event:import("../server/shopping/checkout/executionDiagnostics").ExecutionDiagnostic)=>{diagnostics.push(event);}};
 const bridge=createPrivateCartHandoff({...deps,executionEnabled:()=>enabled});
 const prepare=()=>bridge.prepare(auth,f.session.id,'authenticated-fixture-session');
 const approval=(request:any)=>({requestId:request.requestId,scopeSha256:request.scopeSha256,expiresAt:request.expiresAt,confirmation:PRIVATE_CART_CONFIRMATION});
 const execute=(request:any,signal?:AbortSignal)=>bridge.execute(auth,f.session.id,'authenticated-fixture-session',approval(request),signal);
 const claims=async()=>Number((await f.pg.query('SELECT count(*)::int AS n FROM shopify_checkout_admin_tests WHERE claimed_at IS NOT NULL')).rows[0].n);
 return {...f,bridge,deps,diagnostics,prepare,approval,execute,claims,enable:(v:boolean)=>{enabled=v;}};
}
test('private handoff preparation grants no execution approval; explicit rollback gate still disables execution',async()=>{
 const f=await bridgeFixture();try{
  assert.equal(PRIVATE_CART_EXECUTION_ENABLED,false);
  const prepared=await f.call({},{action:'checkout-handoff-request'});assert.equal(prepared.code,200);
  const request=prepared.data;
  assert.equal(request.selection.variantId,variant);assert.equal(request.selection.quantity,1);
  assert.deepEqual(request.quantityRule,{minimum:1,maximum:null,increment:1});
  assert.equal(request.cartCreated,false);assert.equal(request.cartCreationEnabled,false);
  assert.doesNotMatch(JSON.stringify(request),/synthetic-storefront|fixture-token|fixture-secret|checkoutUrl|providerCartId/);
  assert.equal(f.creates(),0);assert.equal(await f.claims(),0);
  const rows=await f.pg.query('SELECT * FROM shopify_checkout_admin_tests');
  assert.equal(rows.rows[0].approved_at,null);assert.equal(rows.rows[0].claimed_at,null);
  assert.doesNotMatch(JSON.stringify(rows.rows),/synthetic-storefront|fixture-token|authenticated-fixture-session|checkoutUrl/);
  await assert.rejects(createPrivateCartHandoff({...f.deps,executionEnabled:()=>false}).execute(auth,f.session.id,'authenticated-fixture-session',f.approval(request)),/private_cart_execution_disabled/);
  const source=readFileSync('server/aiTestChat/routes.ts','utf8');
  assert.doesNotMatch(source,/route\("post",[^\n]*(?:cart-create|cart-approve)/);
  assert.doesNotMatch(readFileSync('server/aiTestChat/generate.ts','utf8'),/cartHandoff|checkout-handoff-request/);
 }finally{await f.cleanup();}
});
test('handoff preparation enforces authentication, owner-only pilot, exact Liquid quantity, same-origin empty JSON and entitlement',async()=>{
 const f=await bridgeFixture();try{
  f.authorize(false);assert.equal((await f.call({},{action:'checkout-handoff-request'})).code,401);f.authorize(true);
  for(const patch of [{sessionID:null},{is:()=>false},{get:()=> 'cross-site'}])assert.equal((await f.call({},{action:'checkout-handoff-request',...patch})).code,403);
  assert.equal((await f.call({quantity:1},{action:'checkout-handoff-request'})).code,400);
  await assert.rejects(f.bridge.prepare({...auth,actorUserId:'another-operator'},f.session.id,'http'),/not_found/);
  f.entitle(false);await assert.rejects(f.prepare(),/shopping_entitlement_required/);f.entitle(true);
  f.configured.RAILWAY_ENVIRONMENT_NAME='staging';await assert.rejects(f.prepare(),/not_found/);f.configured.RAILWAY_ENVIRONMENT_NAME='production';
  await f.save({quantity:2});await assert.rejects(f.prepare(),/exact_liquid_quantity_one_required/);
  assert.equal(f.creates(),0);assert.equal(await f.claims(),0);
 }finally{await f.cleanup();}
});
test('approval binds operator, HTTP/private session, exact price/selection, credential and expiry; invalid or stale approvals never dispatch',async()=>{
 const f=await bridgeFixture();try{
  const request=await f.prepare();
  for(const raw of [{...f.approval(request),confirmation:'yes'},{...f.approval(request),quantity:2}])
   await assert.rejects(f.bridge.execute(auth,f.session.id,'authenticated-fixture-session',raw),/invalid_private_cart_approval/);
  await assert.rejects(f.bridge.execute(auth,f.session.id,'different-http',f.approval(request)),/expired_changed_or_consumed/);
  await assert.rejects(f.execute({...request,scopeSha256:'0'.repeat(64)}),/expired_changed_or_consumed/);
  f.provider(200,true);await assert.rejects(f.execute(request),/failed_closed/);assert.equal(await f.claims(),0);f.provider(200);
  await f.save({selected:{...f.state().selected,price:'750.00'}});await assert.rejects(f.execute(request),/expired_changed_or_consumed/);
  await f.save({selected:{...f.state().selected,price:'749.95'}});
  f.configured.SHOPIFY_STOREFRONT_TEST_TOKEN='synthetic-replaced-credential';await assert.rejects(f.execute(request),/expired_changed_or_consumed/);
  f.configured.SHOPIFY_STOREFRONT_TEST_TOKEN='synthetic-storefront-credential';
  await f.pg.exec("UPDATE shopify_checkout_admin_tests SET expires_at=now()-interval '1 second'");
  await assert.rejects(f.execute(request),/expired_changed_or_consumed/);
  assert.equal(f.creates(),0);assert.equal(await f.claims(),0);
 }finally{await f.cleanup();}
});
test('separately scoped synthetic execution reuses the provider and autocommitted fence across workers, requests and the legacy path',async()=>{
 const f=await bridgeFixture();try{
  f.cartMode('success');const a=await f.prepare(),b=await f.prepare();
  const other=createPrivateCartHandoff({...f.deps,executionEnabled:()=>true});
  const results=await Promise.allSettled([f.execute(a),other.execute(auth,f.session.id,'authenticated-fixture-session',f.approval(b))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.creates(),1);assert.equal(await f.claims(),1);
  const success=results.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<any>;
  assert.equal(success.value.paymentStatus,'unknown');assert.equal(success.value.navigation,'separate_approval_required');
  await assert.rejects(f.execute(a));await assert.rejects(f.execute(b));assert.equal(f.creates(),1);
  // A legacy request cannot acquire a second claim for the same shop.
  await assert.rejects(f.db.execute(sql`INSERT INTO public.shopify_checkout_admin_tests
   (request_id,workspace_id,operator_id,session_digest,shop,integration_id,installation_digest,selection,selection_digest,expires_at,claimed_at)
   VALUES (gen_random_uuid(),${id},${id},'legacy',${SHOP},'integration-a','legacy','{}'::jsonb,'legacy',now()+interval '1 minute',now())`));
  assert.equal(await f.claims(),1);
  assert.doesNotMatch(JSON.stringify((await f.pg.query('SELECT * FROM shopify_checkout_admin_tests')).rows),/checkoutUrl|fixture-secret|providerCartId/);
 }finally{await f.cleanup();}
});
for(const mode of ['ambiguous','mismatch','status-failed'] as const)test(`provider ${mode} permanently consumes the dispatch; no retry or receipt persistence`,async()=>{
 const f=await bridgeFixture();try{
  const request=await f.prepare();f.cartMode(mode);
  await assert.rejects(f.execute(request),/failed_closed_do_not_retry/);
  assert.equal(await f.claims(),1);assert.equal(f.creates(),1);
  await assert.rejects(f.execute(request));await assert.rejects(f.prepare(),/development_store_dispatch_already_consumed/);
  assert.equal(f.creates(),1);
  assert.doesNotMatch(JSON.stringify((await f.pg.query('SELECT * FROM shopify_checkout_admin_tests')).rows),/fixture-secret|checkoutUrl|providerCartId/);
 }finally{await f.cleanup();}
});
test('abort/rollback before dispatch stops safely; abort after claim burns the fence without rollback or mutation',async()=>{
 const f=await bridgeFixture();try{
  const request=await f.prepare(),controller=new AbortController();controller.abort();
  await assert.rejects(f.execute(request,controller.signal),/private_cart_aborted/);assert.equal(await f.claims(),0);
  f.enable(false);await assert.rejects(f.execute(request),/execution_disabled/);f.enable(true);
  // Provider.verify runs again after the durable claim. Abort at that boundary.
  let checks=0;const after=new AbortController();
  f.afterFetch(async()=>{if(++checks===2)after.abort();});
  await assert.rejects(f.execute(request,after.signal),/failed_closed_do_not_retry/);
  assert.equal(await f.claims(),1);assert.equal(f.creates(),0);
  await assert.rejects(f.execute(request));assert.equal(await f.claims(),1);
 }finally{await f.cleanup();}
});
test('selection/credential changes during provider IO abort before mutation and retain any committed claim',async()=>{
 const f=await bridgeFixture();try{
  const request=await f.prepare();let checks=0;
  f.afterFetch(async()=>{if(++checks===2)await f.save({quantity:2});});
  await assert.rejects(f.execute(request),/failed_closed_do_not_retry/);
  assert.equal(await f.claims(),1);assert.equal(f.creates(),0);
 }finally{await f.cleanup();}
});


test('authenticated readiness distinguishes locked/unauthorized/invisible variants and reports validated quantity rules',async()=>{
 const f=await bridgeFixture();try{
  for(const status of [401,403]){f.provider(status);const r=await f.call();assert.equal(r.data.ready,false);assert.equal(r.data.error,'checkout_test_storefront_setup_required');}
  f.provider(400);assert.equal((await f.call()).data.error,'checkout_test_storefront_bad_request_online_store_channel_locked');
  f.provider(200);f.nodePatch(null);assert.equal((await f.call()).data.error,'checkout_test_storefront_variant_not_visible');
  for(const [patch,category] of [
   [{id:'gid://shopify/ProductVariant/9'},'variant_identity_mismatch'],
   [{quantityRule:{minimum:2,maximum:null,increment:1}},'quantity_rule_rejected'],
   [{quantityAvailable:0},'variant_unavailable'],
   [{price:{amount:'749.95',currencyCode:'EUR'}},'changed'],
  ] as const){f.nodePatch(patch);assert.equal((await f.call()).data.error,'checkout_test_storefront_'+category);}
  f.nodePatch(undefined);const r=await f.call();assert.equal(r.data.ready,true);
  assert.deepEqual(r.data.quantityRule,{minimum:1,maximum:null,increment:1});
  assert.equal(r.data.selection.productId,product);assert.equal(r.data.selection.variantId,variant);
  assert.equal(r.data.selection.currency,'USD');assert.equal(r.data.selection.price,'749.95');
  assert.equal(r.data.inventory.tracked,true);assert.equal(r.data.inventory.quantity,50);
  assert.equal(f.creates(),0);assert.equal(await f.claims(),0);
 }finally{await f.cleanup();}
});

test('actual preparation adapter JSON is accepted by the client using server response time, with exactly one unapproved record and no cart',async()=>{
 const {preparePrivateCartTest}=await import('../client/src/lib/aiTestCartPreparation');
 const f=await bridgeFixture();try{
  const ready=await f.call();assert.equal(ready.data.ready,true);
  const view=await createTestChatSessions(f.db).read(auth,f.session.id);
  let calls=0;
  const parsed=await preparePrivateCartTest(view,ready.data,async(path,body)=>{
   calls++;assert.equal(path,`/api/ai/test-chat/${f.session.id}/checkout-handoff-request`);assert.deepEqual(body,{});
   const prepared=await f.prepare();
   return {data:JSON.parse(JSON.stringify(prepared)),serverDate:new Date().toUTCString()};
  });
  assert.equal(calls,1);assert.match(parsed.scopeSha256,/^[a-f0-9]{64}$/);
  const records=await f.pg.query('SELECT request_id,approved_at,claimed_at FROM shopify_checkout_admin_tests');
  assert.equal(records.rows.length,1);assert.equal(records.rows[0].request_id,parsed.requestId);
  assert.equal(records.rows[0].approved_at,null);assert.equal(records.rows[0].claimed_at,null);
  assert.equal(f.creates(),0);assert.equal(await f.claims(),0);
 }finally{await f.cleanup();}
});

test('single GET inspects the same persisted request, including expiry, without provider IO or any insert/approval/claim/renewal',async()=>{
 const f=await bridgeFixture();try{
  const request=await f.prepare(),before=await f.pg.query('SELECT * FROM shopify_checkout_admin_tests');
  const reads=f.reads(),providerCalls=f.headers.length;
  const result=await f.call({},{method:'GET',action:'checkout-handoff-request'});
  assert.equal(result.code,200);assert.equal(result.data.status,'prepared_unapproved');
  assert.equal(result.data.requestId,request.requestId);assert.equal(result.data.scopeSha256,request.scopeSha256);
  assert.equal(result.data.expiresAt,request.expiresAt);assert.equal(result.data.canApprove,false);
  assert.equal(result.data.recordCreatedByThisCheck,false);assert.equal(result.data.originalInventoryProofAvailable,false);
  assert.equal(f.reads(),reads);assert.equal(f.headers.length,providerCalls);assert.equal(f.creates(),0);
  assert.deepEqual((await f.pg.query('SELECT * FROM shopify_checkout_admin_tests')).rows,before.rows);
  await f.pg.exec("UPDATE shopify_checkout_admin_tests SET expires_at=now()-interval '1 minute'");
  const expiredBefore=await f.pg.query('SELECT * FROM shopify_checkout_admin_tests');
  const expired=await f.bridge.inspect(auth,f.session.id,'authenticated-fixture-session');
  assert.equal(expired.status,'expired');assert.equal(expired.requestId,request.requestId);assert.equal(expired.canApprove,false);
  assert.deepEqual((await f.pg.query('SELECT * FROM shopify_checkout_admin_tests')).rows,expiredBefore.rows);
  assert.equal((await f.bridge.inspect(auth,f.session.id,'different-http')).status,'no_request_for_current_binding');
  await f.db.update(aiTestSessions).set({expiresAt:new Date(0)}).where(eq(aiTestSessions.id,f.session.id));
  const old=await f.bridge.inspect(auth,f.session.id,'authenticated-fixture-session');
  assert.equal(old.status,'expired');assert.equal(old.testSessionExpired,true);
  assert.equal((await f.call()).code,404); // The live preflight still refuses this expired session.

  f.authorize(false);assert.equal((await f.call({},{method:'GET',action:'checkout-handoff-request'})).code,401);f.authorize(true);
  for(const patch of [{sessionID:null},{get:()=> 'cross-site'}])assert.equal((await f.call({},{method:'GET',action:'checkout-handoff-request',...patch})).code,403);
  assert.doesNotMatch(JSON.stringify(result.data),/fixture-token|synthetic-storefront|authenticated-fixture-session|checkoutUrl|providerCartId/);
  assert.equal(f.creates(),0);assert.equal(await f.claims(),0);
 }finally{await f.cleanup();}
});


const executionHeaders=(name:string)=>name==='origin'?'https://app.whachatcrm.com':name==='sec-fetch-site'?'same-origin':undefined;
const routePatch={action:'checkout-handoff-execute',get:executionHeaders};
test('execution HTTP route: rollback false gate, exact expiry and explicit confirmation; no journal/provider action while disabled',async()=>{
 const f=await bridgeFixture();try{
  const request=await f.prepare(),before=await f.pg.query('SELECT * FROM shopify_checkout_admin_tests');
  const reads=f.reads(),providerCalls=f.headers.length;
  const result=await f.call(f.approval(request),routePatch);
  assert.equal(result.code,403);assert.equal(result.data.error,'private_cart_execution_disabled');
  const status=await f.call({},{method:'GET',action:'checkout-handoff-request'});assert.equal(status.data.executionEnabled,false);
  assert.equal(f.reads(),reads);assert.equal(f.headers.length,providerCalls);assert.equal(f.creates(),0);
  assert.deepEqual((await f.pg.query('SELECT * FROM shopify_checkout_admin_tests')).rows,before.rows);
  for(const raw of [{...f.approval(request),confirmation:'yes'},{...f.approval(request),quantity:2},{...f.approval(request),expiresAt:undefined}])
   assert.equal((await f.call(raw,routePatch)).code,400);
 }finally{await f.cleanup();}
});
test('execution HTTP route: rejects unauthenticated, cross-origin, delegated/foreign pilot, expired session and mismatched expiry before any dispatch',async()=>{
 const f=await bridgeFixture();try{
  const request=await f.prepare(),body=f.approval(request);f.executionEnabled(true);f.cartMode('success');
  f.authorize(false);assert.equal((await f.call(body,routePatch)).code,401);f.authorize(true);
  for(const patch of [{sessionID:null},{is:()=>false},{get:()=>undefined},{get:(n:string)=>n==='origin'?'https://evil.example':'same-site'},
   {get:(n:string)=>n==='origin'?'https://app.whachatcrm.com':'cross-site'}])assert.equal((await f.call(body,{...routePatch,...patch})).code,403);
  for(const bad of [{workspaceUserId:'tenant-b',actorUserId:'tenant-b'},{...auth,actorUserId:'tenant-b'}])assert.equal((await f.call(body,{...routePatch,auth:bad})).code,404);
  f.configured.RAILWAY_ENVIRONMENT_NAME='staging';assert.equal((await f.call(body,routePatch)).code,404);f.configured.RAILWAY_ENVIRONMENT_NAME='production';
  assert.equal((await f.call({...body,expiresAt:new Date(Date.parse(request.expiresAt)+1).toISOString()},routePatch)).code,409);
  assert.equal((await f.call(body,{...routePatch,sessionID:'different-http'})).code,409);
  f.entitle(false);assert.equal((await f.call(body,routePatch)).code,403);f.entitle(true);
  f.provider(200,true);assert.equal((await f.call(body,routePatch)).code,409);f.provider(200);
  assert.equal(await f.claims(),0);

  await f.db.update(aiTestSessions).set({expiresAt:new Date(0)}).where(eq(aiTestSessions.id,f.session.id));
  assert.equal((await f.call(body,routePatch)).code,404);
  await f.db.update(aiTestSessions).set({expiresAt:new Date(Date.now()+600000)}).where(eq(aiTestSessions.id,f.session.id));
  await f.pg.exec("UPDATE shopify_checkout_admin_tests SET expires_at=now()-interval '1 second'");
  assert.equal((await f.call(body,routePatch)).code,409);
  assert.equal(f.creates(),0);assert.equal(await f.claims(),0);
 }finally{await f.cleanup();}
});
test('execution HTTP route: isolated approved fixture dispatches once, returns private URL without navigation and refuses replays',async()=>{
 const f=await bridgeFixture();try{
  const request=await f.prepare();f.executionEnabled(true);f.cartMode('success');
  const results=await Promise.all([f.call(f.approval(request),routePatch),f.call(f.approval(request),routePatch)]);
  assert.equal(results.filter(r=>r.code===200).length,1);assert.equal(f.creates(),1);assert.equal(await f.claims(),1);
  const result=results.find(r=>r.code===200)!;assert.equal(result.data.cartCreated,true);
  assert.match(result.data.checkoutUrl,/^https:\/\/whachatcrm\.myshopify\.com\/cart\/c\//);
  assert.equal(result.data.navigation,'separate_approval_required');assert.equal(result.data.paymentStatus,'unknown');
  assert.equal((await f.call(f.approval(request),routePatch)).code,409);assert.equal(f.creates(),1);
  assert.doesNotMatch(JSON.stringify((await f.pg.query('SELECT * FROM shopify_checkout_admin_tests')).rows),/fixture-secret|checkoutUrl|providerCartId/);
 }finally{await f.cleanup();}
});
test('execution HTTP route: ambiguous mutation consumes the shared claim, and client disconnect before mutation aborts without retry',async()=>{
 let f=await bridgeFixture();try{
  const request=await f.prepare();f.executionEnabled(true);f.cartMode('ambiguous');
  const result=await f.call(f.approval(request),routePatch);assert.equal(result.code,409);
  assert.equal(result.data.error,'private_cart_failed_closed_do_not_retry');assert.equal(f.creates(),1);assert.equal(await f.claims(),1);
  assert.equal((await f.call(f.approval(request),routePatch)).code,409);assert.equal(f.creates(),1);
 }finally{await f.cleanup();}
 f=await bridgeFixture();try{
  const request=await f.prepare();f.executionEnabled(true);f.cartMode('success');
  let checks=0,res:any;f.afterFetch(async()=>{if(++checks===2)res.emit('close');});
  const result=await f.call(f.approval(request),{...routePatch,captureResponse:(value:any)=>{res=value;}});
  assert.equal(result.code,409);assert.equal(await f.claims(),1);assert.equal(f.creates(),0);
  assert.equal(res.listenerCount('close'),0);
 }finally{await f.cleanup();}
});


test('diagnostic-only source gate: execution remains disabled and unauthorized owners never dispatch',async()=>{
 const f=await bridgeFixture();try{
  f.useSourceGate();assert.equal(PRIVATE_CART_EXECUTION_ENABLED,false);
  const status=await f.call({},{method:'GET',action:'checkout-handoff-request'});
  assert.equal(status.code,200);assert.equal(status.data.executionEnabled,false);
  assert.equal(status.data.status,'no_request_for_current_binding');assert.equal(status.data.cartCreationEnabled,false);
  const body={requestId:'00000000-0000-4000-8000-000000000001',scopeSha256:'0'.repeat(64),
   expiresAt:new Date(Date.now()+300000).toISOString(),confirmation:PRIVATE_CART_CONFIRMATION};
  for(const raw of [{},{...body,confirmation:undefined},{...body,confirmation:'yes'},
   {...body,expiresAt:undefined},{...body,quantity:1}])assert.equal((await f.call(raw,routePatch)).code,400);
  assert.equal((await f.call(body,routePatch)).code,403); // Diagnostic-only release blocks execution before provider IO.
  f.authorize(false);assert.equal((await f.call(body,routePatch)).code,401);f.authorize(true);
  for(const bad of [{workspaceUserId:'tenant-b',actorUserId:'tenant-b'},{...auth,actorUserId:'tenant-b'}])
   assert.equal((await f.call(body,{...routePatch,auth:bad})).code,404);
  f.configured.RAILWAY_ENVIRONMENT_NAME='staging';assert.equal((await f.call(body,routePatch)).code,404);
  f.configured.RAILWAY_ENVIRONMENT_NAME='production';
  await f.db.update(users).set({email:'other@example.invalid'}).where(eq(users.id,id));
  assert.equal((await f.call(body,routePatch)).code,404);
  await f.db.update(users).set({email:'pilot-owner@example.invalid'}).where(eq(users.id,id));
  assert.equal((await f.call(body,{...routePatch,sessionID:null})).code,403);
  await f.db.update(aiTestSessions).set({expiresAt:new Date(0)}).where(eq(aiTestSessions.id,f.session.id));
  assert.equal((await f.call(body,routePatch)).code,404);
  assert.equal(f.reads(),0);assert.equal(f.headers.length,0);assert.equal(f.creates(),0);assert.equal(await f.claims(),0);
  assert.equal((await f.pg.query('SELECT count(*)::int AS n FROM shopify_checkout_admin_tests')).rows[0].n,0);
 }finally{await f.cleanup();}
});

test('structured execution stages distinguish post-claim/pre-dispatch abort, provider rejection, ambiguous transport, invalid receipt and verified success without secrets',async()=>{
 for(const mode of ['rejected','http-denied','http-throttled','graphql-rejected','graphql-partial','ambiguous','mismatch','status-failed','success'] as const){
  const f=await bridgeFixture();try{
   const request=await f.prepare();f.cartMode(mode);
   if(mode==='success')await f.execute(request);else await assert.rejects(f.execute(request));
   assert.equal(await f.claims(),1);assert.equal(f.creates(),1);
   const events=f.diagnostics;
   const committed=events.findIndex(e=>e.event==='claim_committed'),dispatch=events.findIndex(e=>e.event==='dispatch_started');
   assert.ok(committed>=0 && dispatch>committed);assert.equal(events[committed].claim,'committed');
   const terminal=events.at(-1)!;assert.equal(terminal.dispatchStarted,true);assert.equal(terminal.requestId,request.requestId);
   if(['rejected','http-denied','http-throttled','graphql-rejected','graphql-partial'].includes(mode)){assert.equal(terminal.stage,'provider_rejection');assert.equal(terminal.cartReported,mode==='graphql-partial');assert.equal(terminal.receiptValidated,false);}
   if(mode==='http-denied'||mode==='http-throttled'){
    assert.ok(events.some(e=>e.event==='response_received'&&e.httpStatus===(mode==='http-denied'?403:429)&&e.shopifyRequestId==='05185397-bb4e-4a80-9c67-e986fc5abb12'));
    assert.equal(terminal.reason,mode==='http-denied'?'setup_required':'throttled');
   }
   if(mode==='graphql-rejected'||mode==='graphql-partial')assert.equal(terminal.reason,'ambiguous:graphql_error');
   if(mode==='ambiguous'){assert.equal(terminal.stage,'provider_response');assert.equal(terminal.receiptValidated,false);}
   if(mode==='mismatch'){assert.equal(terminal.stage,'response_validation');assert.equal(terminal.cartReported,true);assert.equal(terminal.receiptValidated,false);}
   if(mode==='status-failed'){assert.equal(terminal.stage,'status_verification');assert.equal(terminal.receiptValidated,true);}
   if(mode==='success'){assert.equal(terminal.event,'execution_completed');assert.equal(terminal.receiptValidated,true);}
   assert.doesNotMatch(JSON.stringify(events),/fixture-secret|fixture-token|synthetic-storefront|authenticated-fixture-session|private-provider-message|checkoutUrl|providerCartId|gid:\/\/shopify\/Cart/);
  }finally{await f.cleanup();}
 }
 const f=await bridgeFixture();try{
  const request=await f.prepare();f.cartMode('success');const controller=new AbortController();let checks=0;
  f.afterFetch(async()=>{if(++checks===2)controller.abort();});
  await assert.rejects(f.execute(request,controller.signal));
  assert.equal(await f.claims(),1);assert.equal(f.creates(),0);
  assert.equal(f.diagnostics.at(-1)!.claim,'committed');assert.equal(f.diagnostics.at(-1)!.dispatchStarted,false);
 }finally{await f.cleanup();}
});

test('stage diagnostics separate pre-claim price rejection from uncertain claim acknowledgement without permitting a provider mutation',async()=>{
 let f=await bridgeFixture();try{
  const request=await f.prepare();f.provider(200,true);
  await assert.rejects(f.execute(request));
  assert.equal(await f.claims(),0);assert.equal(f.creates(),0);
  const last=f.diagnostics.at(-1)!;assert.equal(last.stage,'pre_dispatch_validation');assert.equal(last.claim,'not_attempted');
  assert.equal(last.dispatchStarted,false);assert.equal(last.reason,'checkout_test_storefront_changed');
 }finally{await f.cleanup();}
 f=await bridgeFixture();try{
  const request=await f.prepare(),execute=f.db.execute.bind(f.db);
  (f.db as any).execute=async(query:any)=>{
   const result=await execute(query);
   if(result.rows.length===1 && Object.keys(result.rows[0]).length===1 && typeof result.rows[0].request_id==='string')
    throw Error('synthetic lost SQL acknowledgement: private value');
   return result;
  };
  await assert.rejects(f.execute(request));
  assert.equal(await f.claims(),1);assert.equal(f.creates(),0);
  const last=f.diagnostics.at(-1)!;assert.equal(last.stage,'claim_commit');assert.equal(last.claim,'unknown');assert.equal(last.dispatchStarted,false);
  assert.doesNotMatch(JSON.stringify(f.diagnostics),/lost SQL|private value/);
 }finally{await f.cleanup();}
});


async function secondFixture() {
 const f=await bridgeFixture(true);
 await f.pg.exec(readFileSync('migrations/0115_private_cart_second_authorization.sql','utf8'));
 f.configured.SHOPPING_CHECKOUT_RECEIPT_KEY=Buffer.alloc(32,9).toString('base64');
 // Seed a synthetic consumed original. Never run this fixture against a remote database.
 const legacy=createPrivateCartHandoff({...f.deps,secondExecutionEnabled:()=>false,executionEnabled:()=>true});
 const original=await legacy.prepare(auth,f.session.id,'authenticated-fixture-session');
 await f.pg.query('UPDATE shopify_checkout_admin_tests SET approved_at=now(),claimed_at=now() WHERE request_id=$1',[original.requestId]);
 const grant=crypto.randomUUID();
 await f.pg.query(`INSERT INTO shopify_private_cart_second_authorization
  (attempt_number,authorization_id,original_request_id,workspace_id,operator_id,shop,integration_id,installation_digest,approved_by,approval_reference,expires_at)
  SELECT 2,$1,request_id,workspace_id,operator_id,shop,integration_id,installation_digest,operator_id,'synthetic-explicit-second-approval',now()+interval '1 hour'
  FROM shopify_checkout_admin_tests WHERE request_id=$2`,[grant,original.requestId]);
 return {...f,grant,original};
}
test('second attempt stays default-denied and cannot activate through a request body or ordinary configuration',async()=>{
 const {PRIVATE_CART_SECOND_EXECUTION_ENABLED}=await import('../server/aiTestChat/secondCartAuthorization');
 assert.equal(PRIVATE_CART_SECOND_EXECUTION_ENABLED,false);
 const f=await secondFixture();try{
  const request=await f.prepare();const prod=createPrivateCartHandoff({...f.deps,secondExecutionEnabled:()=>false});
  await assert.rejects(prod.execute(auth,f.session.id,'authenticated-fixture-session',f.approval(request)),/execution_disabled/);
  await assert.rejects(f.execute({...request,scopeSha256:'0'.repeat(64)}));
  await assert.rejects(f.bridge.execute({...auth,actorUserId:'not-owner'},f.session.id,'authenticated-fixture-session',f.approval(request)));
  await assert.rejects(f.bridge.execute(auth,f.session.id,'other-http-session',f.approval(request)));
  assert.equal(f.creates(),0);assert.equal(await f.claims(),1);
 }finally{await f.cleanup();}
});
for(const mode of ['success','ambiguous','mismatch','status-failed','graphql-partial','http-denied','version-mismatch'] as const)
test(`second guarded attempt ${mode}: original unchanged, one new claim, no replay, encrypted durable receipt`,async()=>{
 const f=await secondFixture();try{
  const before=(await f.pg.query('SELECT * FROM shopify_checkout_admin_tests WHERE request_id=$1',[f.original.requestId])).rows[0];
  const request=await f.prepare();f.cartMode(mode);
  if(mode==='success')assert.equal((await f.execute(request)).cartCreated,true);else await assert.rejects(f.execute(request));
  assert.equal(f.creates(),1);assert.equal(await f.claims(),1);
  const row=(await f.pg.query('SELECT * FROM shopify_private_cart_second_authorization')).rows[0];
  assert.equal(row.request_id,request.requestId);assert.ok(row.claimed_at);assert.equal(row.scope_digest,request.scopeSha256);
  assert.equal(!!row.encrypted_receipt,['success','mismatch','status-failed','graphql-partial','version-mismatch'].includes(mode));
  assert.equal(!!row.verified_at,mode==='success');assert.ok(row.diagnostic);assert.ok(row.diagnostic.events.length>0);
  if(mode==='http-denied')assert.ok(row.diagnostic.events.some((e:any)=>e.operation==='create'&&e.shopifyRequestId==='05185397-bb4e-4a80-9c67-e986fc5abb12'));
  assert.doesNotMatch(JSON.stringify(row),/fixture-secret|checkoutUrl|providerCartId|synthetic-storefront/);
  if(row.encrypted_receipt){
   const {privateCartReceiptCodec}=await import('../server/aiTestChat/secondCartAuthorization');
   const codec=privateCartReceiptCodec(f.configured);
   assert.ok(codec.open(row.encrypted_receipt,`${f.grant}:${request.requestId}`).providerCartId);
   assert.throws(()=>codec.open(row.encrypted_receipt,`${f.grant}:other-request`));
  }
  await assert.rejects(f.execute(request));await assert.rejects(f.prepare());assert.equal(f.creates(),1);
  assert.deepEqual((await f.pg.query('SELECT * FROM shopify_checkout_admin_tests WHERE request_id=$1',[f.original.requestId])).rows[0],before);
 }finally{await f.cleanup();}
});
test('second attempt missing receipt key, revoked authorization and changed price never claim or dispatch',async()=>{
 const f=await secondFixture();try{
  const request=await f.prepare();f.cartMode('success');
  delete f.configured.SHOPPING_CHECKOUT_RECEIPT_KEY;await assert.rejects(f.execute(request),/receipt_setup/);
  f.configured.SHOPPING_CHECKOUT_RECEIPT_KEY=Buffer.alloc(32,9).toString('base64');
  f.provider(200,true);await assert.rejects(f.execute(request));f.provider(200);
  await f.pg.exec("UPDATE shopify_private_cart_second_authorization SET revoked_at=now()");
  await assert.rejects(f.execute(request));assert.equal(f.creates(),0);
  assert.equal((await f.pg.query('SELECT claimed_at FROM shopify_private_cart_second_authorization')).rows[0].claimed_at,null);
 }finally{await f.cleanup();}
});
test('second attempt status persistence failure retains encrypted receipt and permanent claim; no mutation retry',async()=>{
 const f=await secondFixture();try{
  const request=await f.prepare();f.cartMode('success');const execute=f.db.execute.bind(f.db);let receiptSaved=false;
  (f.db as any).execute=async(query:any)=>{
   if(receiptSaved)throw Error('synthetic database unavailable');
   const result=await execute(query);
   const row=(await f.pg.query('SELECT encrypted_receipt FROM shopify_private_cart_second_authorization')).rows[0];
   if(row?.encrypted_receipt)receiptSaved=true;
   return result;
  };
  await assert.rejects(f.execute(request));assert.equal(f.creates(),1);
  const row=(await f.pg.query('SELECT claimed_at,encrypted_receipt FROM shopify_private_cart_second_authorization')).rows[0];
  assert.ok(row.claimed_at);assert.ok(row.encrypted_receipt);
 }finally{await f.cleanup();}
});
test('second claim lost acknowledgement is permanently consumed with durable checkpoint and zero provider mutations',async()=>{
 const f=await secondFixture();try{
  const request=await f.prepare();f.cartMode('success');const execute=f.db.execute.bind(f.db);let lost=false;
  (f.db as any).execute=async(query:any)=>{
   const result=await execute(query);
   const row=(await f.pg.query('SELECT claimed_at FROM shopify_private_cart_second_authorization')).rows[0];
   if(row?.claimed_at&&!lost){lost=true;throw Error('synthetic lost claim acknowledgement');}
   return result;
  };
  await assert.rejects(f.execute(request));assert.equal(f.creates(),0);assert.equal(await f.claims(),1);
  const row=(await f.pg.query('SELECT claimed_at,diagnostic FROM shopify_private_cart_second_authorization')).rows[0];
  assert.ok(row.claimed_at);assert.equal(row.diagnostic.stage,'claim_commit');assert.equal(row.diagnostic.dispatchStarted,false);
  await assert.rejects(f.execute(request));assert.equal(f.creates(),0);
 }finally{await f.cleanup();}
});

test('second inspection prefers the winning claim and reports shared consumption across another HTTP session',async()=>{
 const f=await secondFixture();try{
  const winner=await f.prepare();await f.prepare();
  const other=await f.bridge.prepare(auth,f.session.id,'other-authenticated-http-session');
  f.cartMode('success');await f.execute(winner);
  const current=await f.bridge.inspect(auth,f.session.id,'authenticated-fixture-session');
  assert.equal(current.requestId,winner.requestId);assert.equal(current.status,'cart_verified');
  assert.equal(current.dispatchClaimed,true);assert.equal((current as any).receiptAvailable,true);
  assert.equal((current as any).authorizationConsumedByAnotherRequest,false);
  const separate=await f.bridge.inspect(auth,f.session.id,'other-authenticated-http-session');
  assert.equal(separate.requestId,other.requestId);assert.equal(separate.status,'authorization_consumed_by_another_request');
  assert.equal(separate.dispatchClaimed,true);assert.equal(separate.approved,false);
  assert.equal((separate as any).authorizationConsumedByAnotherRequest,true);assert.equal(f.creates(),1);
  assert.doesNotMatch(JSON.stringify([current,separate]),/checkoutUrl|providerCartId|fixture-secret|synthetic-storefront/);
 }finally{await f.cleanup();}
});
