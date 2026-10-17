import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { catalogFixture } from './shopify-catalog-fixture';
import { users, integrations } from '../shared/schema';
import { configuredTestAccess, registerShopifyCheckoutAdminTest, TEST_PRODUCT, TEST_VARIANT } from '../server/shopping/checkout/adminTest';
import { SHOP, META } from '../server/shopping/checkout/controlledValidation';

const prefix='/api/sales-catalog/commerce/checkout-test/';
async function fixture(options:{missing?:boolean;ambiguous?:boolean}={}) {
 const f=await catalogFixture();
 await f.database.update(users).set({shopifyShop:SHOP}).where(eq(users.id,'tenant-a'));
 await f.database.update(integrations).set({config:{shopUrl:SHOP}}).where(eq(integrations.id,'integration-a'));
 if(!options.missing)await f.pg.exec(readFileSync('migrations/0112_shopify_checkout_admin_tests.sql','utf8'));
 let creates=0, reads=0, price='601.00', dev=true;
 const variant=()=>({id:TEST_VARIANT,price,selectedOptions:[{name:'Title',value:'Default Title'}],availableForSale:true,
   requiresComponents:false,inventoryQuantity:3,inventoryPolicy:'DENY',inventoryItem:{tracked:true},
   product:{id:TEST_PRODUCT,title:'The Collection Snowboard: Hydrogen',status:'ACTIVE',publishedAt:'2020-01-01T00:00:00Z',requiresSellingPlan:false}});
 const requestFor=()=>async(q:string)=>{reads++;return q===META?
   {shop:{myshopifyDomain:SHOP,plan:{partnerDevelopment:dev}},currentAppInstallation:{app:{apiKey:'e4585d4da1434c9e5649a2269e716076'},accessScopes:[{handle:'read_products'},{handle:'read_inventory'}]}}:
   {shop:{myshopifyDomain:SHOP,currencyCode:'USD'},nodes:[variant()]};};
 const storefrontFetch=(async(_url:unknown,init:any)=>{
   const {query}=JSON.parse(init.body);
   const cart={id:'gid://shopify/Cart/fixture?key=secret',checkoutUrl:`https://${SHOP}/cart/c/fixture?key=secret`,totalQuantity:1,
     lines:{nodes:[{quantity:1,merchandise:{id:TEST_VARIANT,product:{id:TEST_PRODUCT}},cost:{amountPerQuantity:{amount:price,currencyCode:'USD'}}}]}};
   let data;
   if(query.startsWith('mutation')){creates++;if(options.ambiguous)throw Error('secret provider diagnostic');data={cartCreate:{cart,userErrors:[],warnings:[]}};}
   else if(query.includes('CheckoutStatus'))data={cart};
   else data={node:{...variant(),price:{amount:price,currencyCode:'USD'},quantityRule:{minimum:1,maximum:null,increment:1}}};
   return new Response(JSON.stringify({data}),{headers:{'x-shopify-api-version':'2026-10'}});
 }) as typeof fetch;
 const handlers:Record<string,any>={};
 const app={get:(p:string,h:any)=>{handlers[p]=h;},post:(p:string,h:any)=>{handlers[p]=h;}};
 const authorize=async(req:any,res:any)=>{if(!req.actor){res.status(401).json({error:'Unauthorized'});return null;}return {workspaceUserId:req.workspace,actorUserId:req.actor};};
 registerShopifyCheckoutAdminTest(app as any,f.database,authorize,requestFor,storefrontFetch);
 async function call(action:string,body:any={},patch:any={}) {
   let status=200,data:any;
   const res={set:()=>res,status:(s:number)=>{status=s;return res;},json:(d:any)=>{data=d;return res;}};
   await handlers[prefix+action]({body,actor:'tenant-a',workspace:'tenant-a',sessionID:'session',is:()=>true,get:()=>undefined,...patch},res);
   return {status,data};
 }
 return {...f,call,creates:()=>creates,reads:()=>reads,changePrice:()=>{price='602.00';},badPlan:()=>{dev=false;}};
}
function config(){process.env.SHOPIFY_CHECKOUT_TEST_WORKSPACE_ID='tenant-a';process.env.SHOPIFY_CHECKOUT_TEST_OPERATOR_IDS='tenant-a';}
function identity(p:any){return {requestId:p.requestId,selectionSha256:p.selectionSha256};}
async function approve(f:Awaited<ReturnType<typeof fixture>>,p:any){return f.call('approve',{...identity(p),confirmation:'CREATE EXACTLY ONE DEVELOPMENT STORE CART'});}

test('configuration denies by default and pins both workspace and operator',()=>{
 const auth={workspaceUserId:'a',actorUserId:'b'};
 assert.equal(configuredTestAccess(auth,{}),false);
 assert.equal(configuredTestAccess(auth,{SHOPIFY_CHECKOUT_TEST_WORKSPACE_ID:'a',SHOPIFY_CHECKOUT_TEST_OPERATOR_IDS:'b'}),true);
 assert.equal(configuredTestAccess({...auth,workspaceUserId:'other'},{SHOPIFY_CHECKOUT_TEST_WORKSPACE_ID:'a',SHOPIFY_CHECKOUT_TEST_OPERATOR_IDS:'b'}),false);
});
test('unauthenticated/wrong workspace/operator and cross-site requests perform no Shopify reads',async()=>{
 config();const f=await fixture();try{
 for(const [patch,status] of [[{actor:null},401],[{workspace:'tenant-b'},404],[{actor:'tenant-b'},404],[{get:()=> 'cross-site'},403],[{is:()=>false},403]] as const)
   assert.equal((await f.call('preflight',{},patch)).status,status);
 assert.equal(f.reads(),0);assert.equal(f.creates(),0);
 }finally{await f.cleanup();}
});
test('missing durable table reports setup error without creating schema or reading Shopify',async()=>{
 config();const f=await fixture({missing:true});try{
 const r=await f.call('preflight');assert.equal(r.status,503);assert.match(r.data.error,/setup_required/);assert.equal(f.reads(),0);
 }finally{await f.cleanup();}
});
test('live preflight uses current price, never creates a cart, and requires separate session-bound approval',async()=>{
 config();const f=await fixture();try{
 const p=await f.call('preflight');assert.equal(p.status,200);assert.equal(p.data.selection.price,'601.00');assert.equal(p.data.cartCreated,false);assert.equal(f.creates(),0);
 assert.equal((await f.call('create',identity(p.data))).status,403);
 assert.equal((await f.call('approve',{...identity(p.data),confirmation:'yes'})).status,400);
 assert.equal((await f.call('approve',{...identity(p.data),confirmation:'CREATE EXACTLY ONE DEVELOPMENT STORE CART'},{sessionID:'other-session'})).status,409);
 assert.equal((await approve(f,p.data)).status,200);assert.equal(f.creates(),0);
 const results=await Promise.all([f.call('create',identity(p.data)),f.call('create',identity(p.data))]);
 assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(f.creates(),1);
 const rows=await f.pg.query('SELECT * FROM shopify_checkout_admin_tests');assert.doesNotMatch(JSON.stringify(rows.rows),/key=secret|fixture-token-a/);
 const next=await f.call('preflight');await approve(f,next.data);
 assert.equal((await f.call('create',identity(next.data))).status,409);assert.equal(f.creates(),1);
 }finally{await f.cleanup();}
});
test('expiry, live plan failure and price drift block mutation',async()=>{
 config();const f=await fixture();try{
 const p=(await f.call('preflight')).data;await approve(f,p);f.changePrice();
 assert.equal((await f.call('create',identity(p))).status,503);assert.equal(f.creates(),0);
 const fresh=(await f.call('preflight')).data;await approve(f,fresh);
 await f.pg.exec("UPDATE shopify_checkout_admin_tests SET expires_at=now()-interval '1 second'");
 assert.equal((await f.call('create',identity(fresh))).status,409);
 f.badPlan();assert.equal((await f.call('preflight')).status,503);assert.equal(f.creates(),0);
 }finally{await f.cleanup();}
});
test('ambiguous provider failure permanently consumes the durable claim, with no secrets in API error',async()=>{
 config();const f=await fixture({ambiguous:true});try{
 const p=(await f.call('preflight')).data;await approve(f,p);
 const r=await f.call('create',identity(p));assert.equal(r.status,503);assert.doesNotMatch(JSON.stringify(r),/secret|key=|https:/);
 assert.equal((await f.call('create',identity(p))).status,409);assert.equal(f.creates(),1);
 const next=(await f.call('preflight')).data;await approve(f,next);assert.equal((await f.call('create',identity(next))).status,409);assert.equal(f.creates(),1);
 }finally{await f.cleanup();}
});

test('partial schema without the unique dispatch index fails closed before Shopify reads',async()=>{
 config();const f=await fixture();try{
 await f.pg.exec('DROP INDEX shopify_checkout_admin_one_dispatch');
 const r=await f.call('preflight');assert.equal(r.status,503);assert.match(r.data.error,/setup_required/);assert.equal(f.reads(),0);
 }finally{await f.cleanup();}
});
