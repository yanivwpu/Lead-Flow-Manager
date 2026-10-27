import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { catalogFixture } from "./shopify-catalog-fixture";
import { aiTestSessions,catalogProducts,catalogSources,catalogVariants,users,integrations } from "../shared/schema";
import { AI_TEST_CHAT_SCHEMA_SQL } from "../server/aiTestChat/schemaSql";
import { createTestChatSessions } from "../server/aiTestChat/sessions";
import { ensureCatalogSource } from "../server/salesCatalog/shopify/installation";
import { createAgenticCompatibilityProbe, minorUnits, PROBE_VARIANTS_QUERY } from "../server/aiTestChat/agenticProbe";
import { AGENTIC_META_QUERY,runAgenticProbe,agentProfile } from "../server/salesCatalog/shopify/agenticProbe";
import { registerTestChatRoutes } from "../server/aiTestChat/routes";

const shop="fixture-a.myshopify.com",profile="https://agent.example.invalid/ucp.json";
const auth={workspaceUserId:"tenant-a",actorUserId:"tenant-a"};
const products=[{id:"gid://shopify/Product/1",variants:[{id:"gid://shopify/ProductVariant/2",price:{amount:1234,currency:"USD"},availability:{available:true}}]}];
const json=(value:unknown)=>new Response(JSON.stringify(value),{headers:{"content-type":"application/json"}});
const ucp={ucp:{version:"2026-08-25",capabilities:{"dev.ucp.shopping.catalog.search":[{version:"2026-08-25"}]}}};
function provider(options:{password?:boolean;status?:number;foreign?:boolean;badId?:boolean;extra?:boolean;badSchema?:boolean;during?:()=>Promise<void>}={}) {
  const calls:Array<{url:string;body:any;init:any}>=[];
  const fetcher=(async(url:any,init:any)=>{
    const body=init.body?JSON.parse(init.body):null;calls.push({url,body,init});
    assert.equal(new URL(url).hostname,shop);assert.equal(init.redirect,"manual");assert.equal(init.credentials,"omit");
    assert.doesNotMatch(JSON.stringify(init.headers),/token|authorization|cookie/i);
    if(options.password)return new Response(null,{status:302,headers:{location:"/password"}});
    if(options.status)return new Response("secret provider error",{status:options.status});
    if(!body)return json(ucp);
    assert.deepEqual(body.params.arguments?.meta??body.params.arguments?.meta,{"ucp-agent":{profile}});
    if(body.method==="tools/list")return json({jsonrpc:"2.0",id:body.id,result:{tools:[{name:"search_catalog",inputSchema:{type:"object",properties:options.badSchema?{}:{catalog:{type:"object"},meta:{type:"object"}}}},
      ...(options.extra?[{name:"create_cart",inputSchema:{type:"object",properties:{}}}]:[])]}});
    assert.equal(body.method,"tools/call");assert.equal(body.params.name,"search_catalog");assert.equal(body.params.arguments.catalog.pagination.limit,5);
    await options.during?.();
    return json({jsonrpc:"2.0",id:options.badId?999:body.id,result:{structuredContent:{...ucp,products:options.foreign?[{...products[0],id:"gid://shopify/Product/999"}]:products}}});
  }) as typeof fetch;
  return {fetcher,calls};
}
const meta=()=>({shop:{myshopifyDomain:shop,currencyCode:"USD",plan:{partnerDevelopment:true}},currentAppInstallation:{accessScopes:[{handle:"read_products"},{handle:"read_inventory"}]}});
const base=(fetcher:typeof fetch)=>({shop,query:"Board",currency:"USD",profile,existing:[{externalId:products[0].id}],
  request:async()=>meta(),fetcher,owns:async()=>true,verify:async()=>({price:true,availability:true})});

test("fixed read-only MCP binding compares identity, currency and inventory; discovered mutations are never called",async()=>{
  const p=provider({extra:true}),result=await runAgenticProbe(base(p.fetcher));
  assert.deepEqual(result.comparison,{existingProducts:1,standardProducts:1,overlappingProducts:1});
  for(const capability of ["merchant_identity","currency_price","availability","product_variant_identity","standard_discovery"])
    assert.equal(result.diagnostics.find(d=>d.capability===capability)?.status,"supported");
  assert.equal(result.diagnostics.find(d=>d.capability==="exact_inventory_quantity")?.status,"unsupported");
  assert.equal(result.cartCreationEnabled,false);assert.equal(result.checkoutEnabled,false);
  assert.equal(p.calls.length,3);assert.doesNotMatch(JSON.stringify(result),/checkoutUrl|fixture-token|secret provider/);
});
test("password, authentication, endpoint absence and temporary outage have distinct sanitized diagnostics",async()=>{
  for(const [options,status,reason] of [[{password:true},"configuration_required","password_protected"],
    [{status:403},"configuration_required","authentication_or_store_access_required"],
    [{status:404},"unsupported","endpoint_not_available"],[{status:429},"unavailable","throttled"]] as const){
    const p=provider(options),result=await runAgenticProbe(base(p.fetcher));
    assert.ok(result.diagnostics.some(d=>d.status===status && d.reason===reason));
    assert.equal(result.comparison,undefined);assert.ok(p.calls.length<=2); // no redirect or retry
  }
  const p=provider(),result=await runAgenticProbe({...base(p.fetcher),profile:undefined});
  assert.equal(p.calls.length,1);assert.ok(result.diagnostics.some(d=>d.reason==="server_agent_profile_required"));
});
test("wrong merchant/development identity prevents public requests; malformed schema, foreign catalog and RPC IDs fail closed",async()=>{
  for(const patch of [{myshopifyDomain:"other.myshopify.com"},{plan:{partnerDevelopment:false}},{currencyCode:"EUR"}]){
    const p=provider(),result=await runAgenticProbe({...base(p.fetcher),request:async()=>({...meta(),shop:{...meta().shop,...patch}})});
    assert.equal(p.calls.length,0);assert.equal(result.comparison,undefined);
  }
  for(const options of [{badSchema:true},{badId:true},{foreign:true}]){
    const p=provider(options),result=await runAgenticProbe({...base(p.fetcher),owns:async ps=>ps.every(p=>p.id===products[0].id)});
    assert.equal(result.comparison,undefined);assert.equal(result.diagnostics.at(-1)?.status,"unavailable");
    assert.doesNotMatch(JSON.stringify(result),/Product\/999/);
  }
});
test("decimal conversion preserves minor units across zero, two and three decimal currencies",()=>{
  assert.equal(minorUnits("12.34","USD"),1234n);assert.equal(minorUnits("120.00","JPY"),120n);
  assert.equal(minorUnits("1.234","KWD"),1234n);assert.equal(minorUnits("1.234","USD"),null);
  for(const input of ["1e3","NaN",-1,null])assert.equal(minorUnits(input,"USD"),null);
  assert.equal(agentProfile("http://agent.example/ucp"),null);assert.equal(agentProfile("https://user:pass@agent.example/"),null);
});
async function fixture(){
  const f=await catalogFixture(),db=f.database;
  await f.pg.exec(AI_TEST_CHAT_SCHEMA_SQL);
  const source=(await ensureCatalogSource(db,auth.workspaceUserId))!;
  await db.update(catalogSources).set({status:"ready",currency:"USD",initialSyncCompletedAt:new Date(),grantedScopes:["read_products","read_inventory"]}).where(eq(catalogSources.id,source.id));
  await db.insert(catalogProducts).values({id:"p",userId:"tenant-a",sourceId:source.id,externalId:products[0].id,title:"Board",searchText:"Board",status:"ACTIVE",published:true,complete:true,variantCount:1,providerUpdatedAt:new Date()});
  await db.insert(catalogVariants).values({id:"v",userId:"tenant-a",sourceId:source.id,productId:"p",externalId:products[0].variants[0].id,title:"Default",price:"12.34",currency:"USD",providerUpdatedAt:new Date(),verifiedAt:new Date(),generation:"fixture"});
  const session=await createTestChatSessions(db).create(auth);
  await db.update(aiTestSessions).set({shoppingState:{version:1,sourceId:source.id,selected:{productId:"p",variantId:"v"}}}).where(eq(aiTestSessions.id,session.id));
  const env:NodeJS.ProcessEnv={SHOPIFY_AGENTIC_PROBE_WORKSPACE_ID:"tenant-a",SHOPIFY_AGENTIC_PROBE_OWNER_EMAIL:"a@example.invalid",SHOPIFY_AGENTIC_PROBE_SHOP:shop,SHOPIFY_AGENTIC_PROBE_AGENT_PROFILE:profile};
  let reads=0;
  const requestFor=()=>async(query:string)=>{reads++;assert.ok([AGENTIC_META_QUERY,PROBE_VARIANTS_QUERY].includes(query));
    return query===AGENTIC_META_QUERY?meta():{shop:{myshopifyDomain:shop,currencyCode:"USD"},nodes:[{id:products[0].variants[0].id,product:{id:products[0].id},price:"12.34",availableForSale:true,inventoryQuantity:10,inventoryPolicy:"DENY",inventoryItem:{tracked:true}}]};};
  const p=provider(),deps={db,env,entitled:async()=>true,requestFor,fetcher:p.fetcher};
  return {...f,db,env,source,session,deps,p,reads:()=>reads};
}
test("default source gate performs zero database/provider work even with complete configuration",async()=>{
  const probe=createAgenticCompatibilityProbe({db:new Proxy({},{get(){throw Error("DB FORBIDDEN");}}) as any,entitled:async()=>{throw Error("FORBIDDEN");}});
  const result=await probe(auth,"00000000-0000-4000-8000-000000000001","fixture-session");
  assert.equal(result.enabled,false);assert.equal(result.diagnostics[0].reason,"source_gate_disabled");
});
test("real tenant-scoped discovery and owned pairs compare without writing session, catalog or cart fence",async()=>{
  const f=await fixture();try{
    // Include durable consumed evidence; the compatibility probe must neither require nor reset it.
    await f.pg.exec(readFileSync("migrations/0112_shopify_checkout_admin_tests.sql","utf8"));
    await f.pg.exec(`INSERT INTO shopify_checkout_admin_tests
      (request_id,workspace_id,operator_id,session_digest,shop,integration_id,installation_digest,selection,selection_digest,expires_at,claimed_at)
      VALUES ('00000000-0000-4000-8000-000000000001','tenant-a','tenant-a','fixture','whachatcrm.myshopify.com','integration-a','fixture','{}','fixture',now()+interval '10 minutes',now())`);
    const fenceBefore=await f.db.execute('SELECT * FROM shopify_checkout_admin_tests');
    const indexBefore=await f.db.execute("SELECT indexdef FROM pg_indexes WHERE indexname='shopify_checkout_admin_one_dispatch'");
    const before=await f.db.select().from(aiTestSessions),catalog=await f.db.select().from(catalogVariants);
    const run=createAgenticCompatibilityProbe({...f.deps,enabled:()=>true});
    const result=await run(auth,f.session.id,"fixture-session");
    assert.deepEqual(result.comparison,{existingProducts:1,standardProducts:1,overlappingProducts:1});
    assert.equal(f.reads(),2);assert.deepEqual(await f.db.select().from(aiTestSessions),before);assert.deepEqual(await f.db.select().from(catalogVariants),catalog);
    assert.deepEqual((await f.db.execute('SELECT * FROM shopify_checkout_admin_tests')).rows,fenceBefore.rows);
    assert.deepEqual((await f.db.execute("SELECT indexdef FROM pg_indexes WHERE indexname='shopify_checkout_admin_one_dispatch'")).rows,indexBefore.rows);
    await assert.rejects(()=>run(auth,f.session.id,"fixture-session"),/probe_cooldown/);
  }finally{await f.cleanup();}
});
test("authorization, installation/source/variant scope and expiry reject before provider IO",async()=>{
  const f=await fixture();try{
    const run=(patch:any={})=>createAgenticCompatibilityProbe({...f.deps,enabled:()=>true,...patch});
    await assert.rejects(()=>run()({...auth,actorUserId:"tenant-b"},f.session.id,"s"),/not_found/);
    await assert.rejects(()=>run()({workspaceUserId:"tenant-b",actorUserId:"tenant-b"},f.session.id,"s"),/not_found/);
    await assert.rejects(()=>run({entitled:async()=>false})(auth,f.session.id,"s"),/shopping_entitlement_required/);
    f.env.SHOPIFY_AGENTIC_PROBE_OWNER_EMAIL="wrong@example.invalid";
    await assert.rejects(()=>run()(auth,f.session.id,"s"),/not_found/);f.env.SHOPIFY_AGENTIC_PROBE_OWNER_EMAIL="a@example.invalid";
    await f.db.update(aiTestSessions).set({shoppingState:{sourceId:f.source.id,selected:{productId:"p",variantId:"foreign-v"}}}).where(eq(aiTestSessions.id,f.session.id));
    await assert.rejects(()=>run()(auth,f.session.id,"s"),/selected_variant_required/);
    await f.db.update(aiTestSessions).set({shoppingState:{sourceId:f.source.id,selected:{productId:"p",variantId:"v"}}}).where(eq(aiTestSessions.id,f.session.id));
    await f.db.update(integrations).set({config:{shopUrl:"fixture-b.myshopify.com"}}).where(eq(integrations.id,"integration-a"));
    await assert.rejects(()=>run()(auth,f.session.id,"s"),/probe_installation_changed/);
    await f.db.update(integrations).set({config:{shopUrl:shop}}).where(eq(integrations.id,"integration-a"));
    await f.db.update(aiTestSessions).set({expiresAt:new Date(0)}).where(eq(aiTestSessions.id,f.session.id));
    await assert.rejects(()=>run()(auth,f.session.id,"s"),/session_expired/);
    assert.equal(f.reads(),0);assert.equal(f.p.calls.length,0);
  }finally{await f.cleanup();}
});
test("installation revocation during read discards diagnostics and comparison",async()=>{
  const f=await fixture();try{
    const p=provider({during:async()=>{await f.db.update(users).set({shopifyAccessToken:"rotated-fixture"}).where(eq(users.id,"tenant-a"));}});
    await assert.rejects(()=>createAgenticCompatibilityProbe({...f.deps,enabled:()=>true,fetcher:p.fetcher})(auth,f.session.id,"s"),/probe_context_changed/);
  }finally{await f.cleanup();}
});
test("HTTP route retains auth/Brain/session/same-origin JSON and strict empty input gates",async()=>{
  const f=await fixture();try{
    const handlers:any={};let allowed=true,authorized=true,invocations=0;
    const app=Object.fromEntries(["get","post","delete"].map(m=>[m,(p:string,h:any)=>{handlers[m+" "+p]=h;}]));
    registerTestChatRoutes(app as any,{db:f.db,authorize:async(req,res)=>{if(!authorized){res.status(401).json({error:"unauthorized"});return null;}return req.auth??auth;},access:async()=>({allowed}),generate:null as any,diagnostics:async()=>({}),agenticProbe:async()=>{invocations++;return {enabled:false};}});
    async function call(patch:any={}){let status=200;const res:any={set:()=>res,status:(s:number)=>{status=s;return res;},json:()=>res};await handlers['post /api/ai/test-chat/:id/agentic-compatibility']({params:{id:f.session.id},sessionID:"s",is:()=>true,get:(name:string)=>name==="origin"?"https://app.whachatcrm.com":undefined,body:{},...patch},res);return status;}
    authorized=false;assert.equal(await call(),401);authorized=true;allowed=false;assert.equal(await call(),403);allowed=true;
    for(const patch of [{sessionID:null},{is:()=>false},{get:()=>"cross-site"}])assert.equal(await call(patch),403);
    assert.equal(await call({body:{shop:"other.myshopify.com",tool:"create_cart"}}),400);
    assert.equal(await call({auth:{...auth,actorUserId:"tenant-b"}}),404);assert.equal(invocations,0);
    assert.equal(await call(),200);assert.equal(invocations,1);
    const cart=readFileSync("server/aiTestChat/cartHandoff.ts","utf8");assert.match(cart,/PRIVATE_CART_EXECUTION_ENABLED = false/);
    assert.doesNotMatch(readFileSync("server/aiTestChat/agenticProbe.ts","utf8"),/deps\.db\.(insert|update|delete)\(|consume\(/);
  }finally{await f.cleanup();}
});
test("a real second merchant catalog cannot satisfy returned MCP identity membership",async()=>{
  const f=await fixture();try{
    const other=(await ensureCatalogSource(f.db,"tenant-b"))!;
    await f.db.insert(catalogProducts).values({id:"foreign-p",userId:"tenant-b",sourceId:other.id,externalId:"gid://shopify/Product/999",title:"Board",searchText:"Board",status:"ACTIVE",published:true,complete:true,variantCount:1,providerUpdatedAt:new Date()});
    await f.db.insert(catalogVariants).values({id:"foreign-v",userId:"tenant-b",sourceId:other.id,productId:"foreign-p",externalId:products[0].variants[0].id,title:"Default",price:"12.34",currency:"USD",verifiedAt:new Date(),providerUpdatedAt:new Date(),generation:"fixture"});
    const p=provider({foreign:true});
    const result=await createAgenticCompatibilityProbe({...f.deps,enabled:()=>true,fetcher:p.fetcher})(auth,f.session.id,"s");
    assert.equal(result.comparison,undefined);
    assert.ok(result.diagnostics.some(d=>d.reason==="catalog_identity_outside_owned_source"));
    assert.equal(f.reads(),1); // no Admin variant lookup for the other merchant
    assert.doesNotMatch(JSON.stringify(result),/foreign-p|foreign-v|Product\/999|fixture-token/);
  }finally{await f.cleanup();}
});
test("provider redirects, oversized bodies and non-JSON responses never become usable discovery",async()=>{
  for(const response of [()=>new Response(null,{status:302,headers:{location:"https://other.myshopify.com/api/ucp/mcp"}}),
    ()=>new Response("x".repeat(256001),{headers:{"content-type":"application/json"}}),()=>new Response("<html>private-password-page</html>",{headers:{"content-type":"text/html"}})]){
    let calls=0;const fetcher=(async()=>{calls++;return response();}) as typeof fetch;
    const result=await runAgenticProbe(base(fetcher));assert.equal(result.comparison,undefined);
    assert.equal(calls,2);assert.ok(result.diagnostics.some(d=>d.status==="unavailable"));
    assert.doesNotMatch(JSON.stringify(result),/other.myshopify.com|private-password-page/);
  }
});
