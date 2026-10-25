import test from 'node:test';
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

const id='6868785e-e8af-4152-8e2d-8d031c2e97d0',auth={workspaceUserId:id,actorUserId:id};
const product='gid://shopify/Product/10108114174234',variant='gid://shopify/ProductVariant/51638769221914';
const env=()=>({ECOMMERCE_PILOT_ENABLED:'true',RAILWAY_ENVIRONMENT_NAME:'production',APP_URL:'https://app.whachatcrm.com',
 ECOMMERCE_PILOT_WORKSPACE_ID:id,ECOMMERCE_PILOT_OWNER_EMAIL:'marketing@whachatcrm.com',
 SHOPIFY_CHECKOUT_TEST_WORKSPACE_ID:id,SHOPIFY_CHECKOUT_TEST_OPERATOR_IDS:id});
async function fixture() {
 const f=await catalogFixture(),db=f.database;
 try {
 await db.update(users).set({id,email:'marketing@whachatcrm.com',shopifyShop:SHOP}).where(eq(users.id,'tenant-a'));
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
 const headers:any[]=[];
 const storefrontFetch=(async(_url:any,init:any)=>{
  const body=JSON.parse(init.body);if(body.query.startsWith('mutation')){creates++;throw Error('MUTATION FORBIDDEN');}
  assert.match(body.query,/^query CheckoutVariant\(/);assert.equal(body.variables.id,variant);headers.push(init.headers);
  if(afterFetch)await afterFetch();
  const response=status===400?{errors:[{message:'Online Store channel is locked.',extensions:{code:'BAD_REQUEST'}}]}:
   {data:{node:{...live(),price:{amount:changed?'999.00':'749.95',currencyCode:'USD'},quantityRule:{minimum:1,maximum:null,increment:1},quantityAvailable:50,currentlyNotInStock:false}}};
  return new Response(JSON.stringify(response),{status,headers:{'content-type':'application/json','x-shopify-api-version':'2026-10'}});
 }) as typeof fetch;
 let handlers:Record<string,any>={};
 function mount(){
  handlers={};const app={get:(p:string,h:any)=>handlers['GET '+p]=h,post:(p:string,h:any)=>handlers['POST '+p]=h,delete:(p:string,h:any)=>handlers['DELETE '+p]=h};
  registerTestChatRoutes(app as any,{db,authorize:async(req,res)=>{if(!authorized){res.status(401).json({error:'unauthorized'});return null;}return req.auth??auth;},
   access:async()=>({allowed:entitled}),generate:(async()=>{throw Error('AI must not run');}) as any,diagnostics:async()=>({}),
   checkoutPreflight:createPrivateCheckoutPreflight({db,entitled:async()=>entitled,env:configured,requestFor,storefrontFetch})});
 }
 mount();
 async function call(body:any={},patch:any={}){let code=200,data:any;const res:any={set:()=>res,status:(n:number)=>{code=n;return res;},json:(d:any)=>{data=d;return res;}};
  await handlers['POST /api/ai/test-chat/:id/checkout-preflight']({params:{id:session.id},sessionID:'authenticated-fixture-session',body,is:()=>true,get:()=>undefined,...patch},res);
  return {code,data};}
 return {...f,db,session,source,save,call,mount,configured,headers,state:()=>state,reads:()=>reads,creates:()=>creates,
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
  await f.db.update(users).set({email:'marketing@whachatcrm.com'}).where(eq(users.id,id));
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
