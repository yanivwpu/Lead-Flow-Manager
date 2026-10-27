import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eq,sql } from "drizzle-orm";
import { catalogFixture } from "./shopify-catalog-fixture";
import { AI_TEST_CHAT_SCHEMA_SQL } from "../server/aiTestChat/schemaSql";
import { registerTestChatRoutes } from "../server/aiTestChat/routes";
import { createTestChatSessions } from "../server/aiTestChat/sessions";
import { createAgenticCompatibilityProbe,PROBE_VARIANTS_QUERY } from "../server/aiTestChat/agenticProbe";
import { createProbeGrantJournal,probePrivateConfiguration,SHOPIFY_AGENTIC_PROBE_ONE_SHOT_APPROVED,PILOT_PROBE_SHOP } from "../server/aiTestChat/agenticProbeAuthorization";
import { AGENTIC_META_QUERY,SHOPIFY_AGENTIC_PROBE_ENABLED } from "../server/salesCatalog/shopify/agenticProbe";
import { ensureCatalogSource } from "../server/salesCatalog/shopify/installation";
import { aiTestSessions,users,integrations,catalogSources,catalogProducts,catalogVariants } from "../shared/schema";
const auth={workspaceUserId:"tenant-a",actorUserId:"tenant-a"},authorizationId="00000000-0000-4000-8000-000000000001";
const owner={id:"tenant-a",email:"owner@example.invalid"};
const env=()=>({SHOPIFY_AGENTIC_PROBE_WORKSPACE_ID:owner.id,SHOPIFY_AGENTIC_PROBE_OWNER_EMAIL:owner.email,
  SHOPIFY_AGENTIC_PROBE_SHOP:PILOT_PROBE_SHOP,SHOPIFY_AGENTIC_PROBE_AGENT_PROFILE:"https://agent.example.invalid/ucp.json",SHOPIFY_AGENTIC_PROBE_ONE_SHOT_ID:authorizationId});
const productId="gid://shopify/Product/1",variantId="gid://shopify/ProductVariant/2";
const json=(value:unknown)=>new Response(JSON.stringify(value),{headers:{"content-type":"application/json"}});
async function fixture(){
 const f=await catalogFixture(),db=f.database,configured:NodeJS.ProcessEnv=env();
 await f.pg.exec(AI_TEST_CHAT_SCHEMA_SQL);
 await f.pg.exec(readFileSync("migrations/0116_shopify_agentic_probe_one_shot.sql","utf8"));
 await db.update(users).set({email:owner.email,shopifyShop:PILOT_PROBE_SHOP}).where(eq(users.id,owner.id));
 await db.update(integrations).set({config:{shopUrl:PILOT_PROBE_SHOP}}).where(eq(integrations.id,"integration-a"));
 const source=(await ensureCatalogSource(db,owner.id))!;
 await db.update(catalogSources).set({status:"ready",currency:"USD",initialSyncCompletedAt:new Date(),grantedScopes:["read_products","read_inventory"]}).where(eq(catalogSources.id,source.id));
 await db.insert(catalogProducts).values({id:"p",userId:owner.id,sourceId:source.id,externalId:productId,title:"Board",searchText:"Board",status:"ACTIVE",published:true,complete:true,variantCount:1,providerUpdatedAt:new Date()});
 await db.insert(catalogVariants).values({id:"v",userId:owner.id,sourceId:source.id,productId:"p",externalId:variantId,title:"Default",price:"12.34",currency:"USD",providerUpdatedAt:new Date(),verifiedAt:new Date(),generation:"fixture"});
 const session=await createTestChatSessions(db).create(auth);
 await db.update(aiTestSessions).set({shoppingState:{version:1,sourceId:source.id,selected:{productId:"p",variantId:"v"}}}).where(eq(aiTestSessions.id,session.id));
 let reads=0,httpReads=0,mode:"success"|"password"|"lost"="success",onFetch:undefined|(()=>Promise<void>);
 const requestFor=()=>async(query:string)=>{reads++;assert.ok([AGENTIC_META_QUERY,PROBE_VARIANTS_QUERY].includes(query));
  return query===AGENTIC_META_QUERY?{shop:{myshopifyDomain:PILOT_PROBE_SHOP,currencyCode:"USD",plan:{partnerDevelopment:true}},currentAppInstallation:{accessScopes:[{handle:"read_products"},{handle:"read_inventory"}]}}:
   {shop:{myshopifyDomain:PILOT_PROBE_SHOP,currencyCode:"USD"},nodes:[{id:variantId,product:{id:productId},price:"12.34",availableForSale:true,inventoryQuantity:10,inventoryPolicy:"DENY",inventoryItem:{tracked:true}}]};};
 const fetcher=(async(url:any,init:any)=>{httpReads++;assert.equal(new URL(url).hostname,PILOT_PROBE_SHOP);assert.equal(init.redirect,"manual");
  assert.doesNotMatch(JSON.stringify(init.headers),/token|cookie|authorization/i);
  const claim=await db.execute(sql`SELECT claimed_at FROM shopify_agentic_probe_one_shot`);assert.ok(claim.rows[0]?.claimed_at); // committed before every HTTP request
  if(onFetch)await onFetch();
  if(mode==="password")return new Response(null,{status:302,headers:{location:"/password"}});
  if(mode==="lost")throw Error("private lost acknowledgement");
  const body=init.body?JSON.parse(init.body):null;
  if(!body)return json({ucp:{version:"2026-08-25",capabilities:{"dev.ucp.shopping.catalog.search":[{version:"2026-08-25"}]}}});
  if(body.method==="tools/list")return json({jsonrpc:"2.0",id:body.id,result:{tools:[{name:"search_catalog",inputSchema:{type:"object",properties:{meta:{type:"object"},catalog:{type:"object"}}}}]}});
  assert.equal(body.method,"tools/call");assert.equal(body.params.name,"search_catalog");
  return json({jsonrpc:"2.0",id:body.id,result:{structuredContent:{ucp:{version:"2026-08-25",capabilities:{}},products:[{id:productId,variants:[{id:variantId,price:{amount:1234,currency:"USD"},availability:{available:true}}]}]}}});
 }) as typeof fetch;
 const deps={db,env:configured,entitled:async()=>true,requestFor,fetcher,pilotAllowed:()=>true};
 const adapter=(approved=true)=>createAgenticCompatibilityProbe({...deps,oneShotApproved:()=>approved});
 const scope=await adapter().authorizationContext(auth,session.id,"http-session");
 async function grant(){await db.execute(sql`INSERT INTO shopify_agentic_probe_one_shot
  (singleton,authorization_id,workspace_id,operator_id,shop,integration_id,context_digest,authorized_at,expires_at)
  VALUES(1,${authorizationId}::uuid,${scope.workspaceUserId},${scope.actorUserId},${scope.shop},${scope.integrationId},${scope.contextDigest},now()-interval '1 second',now()+interval '5 minutes')`);}
 return {...f,db,configured,session,source,scope,grant,adapter,deps,reads:()=>reads,httpReads:()=>httpReads,mode:(m:typeof mode)=>mode=m,onFetch:(f:typeof onFetch)=>onFetch=f};
}
test("production source gates remain false and private configuration cannot broaden the existing pilot",()=>{
 assert.equal(SHOPIFY_AGENTIC_PROBE_ENABLED,false);assert.equal(SHOPIFY_AGENTIC_PROBE_ONE_SHOT_APPROVED,false);
 // Synthetic credentials/configuration cannot grant the real production pilot.
 assert.equal(probePrivateConfiguration(owner,auth,env()),"pilot_owner_required");
 assert.equal(probePrivateConfiguration(owner,auth,env(),()=>true),"ready");
 for(const patch of [{SHOPIFY_AGENTIC_PROBE_SHOP:"foreign.myshopify.com"},{SHOPIFY_AGENTIC_PROBE_WORKSPACE_ID:"tenant-b"},{SHOPIFY_AGENTIC_PROBE_OWNER_EMAIL:"wrong@example.invalid"}])
  assert.equal(probePrivateConfiguration(owner,auth,{...env(),...patch},()=>true),"probe_identity_configuration_required");
 assert.equal(probePrivateConfiguration(owner,{...auth,actorUserId:"tenant-b"},env(),()=>true),"pilot_owner_required");
 assert.equal(probePrivateConfiguration(owner,auth,{...env(),SHOPIFY_AGENTIC_PROBE_AGENT_PROFILE:"http://example.invalid"},()=>true),"agent_profile_required");
});
test("readiness and server-only scope preparation perform no provider IO, claim or activation",async()=>{
 const f=await fixture();try{
  const probe=f.adapter(false);await f.grant();
  const before=await f.db.execute(sql`SELECT * FROM shopify_agentic_probe_one_shot`);
  const ready=await probe.readiness(auth,f.session.id,"http-session");
  assert.deepEqual(ready.reasons,["separate_activation_approval_required"]);assert.equal(ready.liveProbePerformed,false);
  assert.equal((await probe(auth,f.session.id,"http-session")).enabled,false);
  assert.equal(f.reads(),0);assert.equal(f.httpReads(),0);
  assert.deepEqual((await f.db.execute(sql`SELECT * FROM shopify_agentic_probe_one_shot`)).rows,before.rows);
  delete f.configured.SHOPIFY_AGENTIC_PROBE_ONE_SHOT_ID;
  assert.ok((await probe.readiness(auth,f.session.id,"http-session")).reasons.includes("one_shot_authorization_required"));
  assert.doesNotMatch(JSON.stringify(ready),/contextDigest|fixture-token|authorizationId|owner@example/);
 }finally{await f.cleanup();}
});
test("one durable claim wins across independent adapters; reload/restart/session changes cannot repeat reads",async()=>{
 const f=await fixture();try{
  await f.grant();const sessionBefore=await f.db.select().from(aiTestSessions);
  await f.pg.exec(readFileSync("migrations/0112_shopify_checkout_admin_tests.sql","utf8"));
  await f.db.execute(sql`INSERT INTO shopify_checkout_admin_tests
    (request_id,workspace_id,operator_id,session_digest,shop,integration_id,installation_digest,selection,selection_digest,expires_at,claimed_at)
    VALUES('00000000-0000-4000-8000-000000000002','tenant-a','tenant-a','fixture',${PILOT_PROBE_SHOP},'integration-a','fixture','{}','fixture',now()+interval '5 minutes',now())`);
  const original=await f.db.execute(sql`SELECT * FROM shopify_checkout_admin_tests`);
  const index=await f.db.execute(sql`SELECT indexdef FROM pg_indexes WHERE indexname='shopify_checkout_admin_one_dispatch'`);
  const attempts=await Promise.allSettled([f.adapter()(auth,f.session.id,"http-session"),f.adapter()(auth,f.session.id,"http-session")]);
  assert.equal(attempts.filter(r=>r.status==="fulfilled").length,1);
  const result=(attempts.find(r=>r.status==="fulfilled") as PromiseFulfilledResult<any>).value;
  assert.deepEqual(result.comparison,{existingProducts:1,standardProducts:1,overlappingProducts:1});
  assert.equal(f.reads(),2);assert.equal(f.httpReads(),3);
  for(const session of ["http-session","another-http-session"])
   await assert.rejects(()=>f.adapter()(auth,f.session.id,session),/probe_authorization_unavailable_or_spent/);
  assert.equal(f.reads(),2);assert.equal(f.httpReads(),3);assert.deepEqual(await f.db.select().from(aiTestSessions),sessionBefore);
  assert.deepEqual((await f.db.execute(sql`SELECT * FROM shopify_checkout_admin_tests`)).rows,original.rows);
  assert.deepEqual((await f.db.execute(sql`SELECT indexdef FROM pg_indexes WHERE indexname='shopify_checkout_admin_one_dispatch'`)).rows,index.rows);
 }finally{await f.cleanup();}
});
test("password or ambiguous provider outcomes spend the grant and halt without fallback or retry",async()=>{
 for(const mode of ["password","lost"] as const){const f=await fixture();try{
  await f.grant();f.mode(mode);const result=await f.adapter()(auth,f.session.id,"http-session");
  assert.equal(f.reads(),1);assert.equal(f.httpReads(),1);assert.equal(result.comparison,undefined);
  assert.equal(result.diagnostics.at(-1)?.status,mode==="password"?"configuration_required":"unavailable");
  await assert.rejects(()=>f.adapter()(auth,f.session.id,"http-session"),/probe_authorization_unavailable_or_spent/);
  assert.equal(f.httpReads(),1);assert.doesNotMatch(JSON.stringify(result),/private lost acknowledgement/);
 }finally{await f.cleanup();}}
});
test("grant scope, expiry, revocation and immutable consumed evidence cannot be bypassed",async()=>{
 const f=await fixture();try{
  await f.grant();const journal=createProbeGrantJournal(f.db);
  for(const patch of [{authorizationId:"00000000-0000-4000-8000-000000000002"},{shop:"foreign.myshopify.com"},
   {workspaceUserId:"tenant-b"},{actorUserId:"tenant-b"},{integrationId:"integration-b"},{contextDigest:"0".repeat(64)}])
   await assert.rejects(()=>journal.claim({...f.scope,...patch}),/probe_authorization_unavailable_or_spent/);
  await journal.claim(f.scope);
  for(const query of [sql`DELETE FROM shopify_agentic_probe_one_shot`,sql`UPDATE shopify_agentic_probe_one_shot SET claimed_at=NULL`,
    sql`UPDATE shopify_agentic_probe_one_shot SET context_digest=${"1".repeat(64)}`])await assert.rejects(()=>f.db.execute(query));
  await f.db.execute(sql`UPDATE shopify_agentic_probe_one_shot SET revoked_at=now()`);
  await assert.rejects(()=>f.db.execute(sql`UPDATE shopify_agentic_probe_one_shot SET revoked_at=NULL`));
  await assert.rejects(()=>journal.claim(f.scope),/probe_authorization_unavailable_or_spent/);
  assert.equal(f.reads(),0);assert.equal(f.httpReads(),0);
 }finally{await f.cleanup();}
 for(const state of ["expired","revoked"]){const f=await fixture();try{
  if(state==="expired")await f.db.execute(sql`INSERT INTO shopify_agentic_probe_one_shot(singleton,authorization_id,workspace_id,operator_id,shop,integration_id,context_digest,authorized_at,expires_at)
   VALUES(1,${authorizationId}::uuid,'tenant-a','tenant-a',${f.scope.shop},${f.scope.integrationId},${f.scope.contextDigest},now()-interval '10 minutes',now()-interval '5 minutes')`);
  else {await f.grant();await f.db.execute(sql`UPDATE shopify_agentic_probe_one_shot SET revoked_at=now()`);}
  await assert.rejects(()=>f.adapter()(auth,f.session.id,"http-session"),/probe_authorization_unavailable_or_spent/);
  assert.equal(f.reads(),0);assert.equal(f.httpReads(),0);
 }finally{await f.cleanup();}}
});
test("owner, scope and installation changes reject before IO or discard an in-flight result without permitting reuse",async()=>{
 const f=await fixture();try{
  await f.grant();
  await assert.rejects(()=>f.adapter()({...auth,actorUserId:"tenant-b"},f.session.id,"http-session"),/not_found/);
  await assert.rejects(()=>createAgenticCompatibilityProbe({...f.deps,oneShotApproved:()=>true,pilotAllowed:()=>false})(auth,f.session.id,"http-session"),/pilot_owner_required/);
  await assert.rejects(()=>f.adapter()(auth,f.session.id,"changed-http-session"),/probe_authorization_unavailable_or_spent/);
  assert.equal(f.reads(),0);assert.equal(f.httpReads(),0);
  f.onFetch(async()=>{f.configured.SHOPIFY_AGENTIC_PROBE_AGENT_PROFILE="https://agent.example.invalid/changed.json";});
  await assert.rejects(()=>f.adapter()(auth,f.session.id,"http-session"),/probe_context_changed/);
  const before=f.httpReads();await assert.rejects(()=>f.adapter()(auth,f.session.id,"http-session"),/probe_authorization_unavailable_or_spent/);
  assert.equal(f.httpReads(),before);
 }finally{await f.cleanup();}
});
test("a missing journal or disabled immutability trigger cannot authorize a live read",async()=>{
 const f=await fixture();try{
  await f.grant();await f.pg.exec("ALTER TABLE shopify_agentic_probe_one_shot DISABLE TRIGGER preserve_agentic_probe_one_shot");
  await assert.rejects(()=>f.adapter()(auth,f.session.id,"http-session"),/probe_authorization_setup_required/);
  assert.equal(f.reads(),0);assert.equal(f.httpReads(),0);
  await f.pg.exec("ALTER TABLE shopify_agentic_probe_one_shot ENABLE TRIGGER preserve_agentic_probe_one_shot");
  await f.pg.exec("ALTER TABLE shopify_agentic_probe_one_shot DROP CONSTRAINT shopify_agentic_probe_one_shot_pkey");
  await assert.rejects(()=>f.adapter()(auth,f.session.id,"http-session"),/probe_authorization_setup_required/);
  assert.equal(f.reads(),0);assert.equal(f.httpReads(),0);
 }finally{await f.cleanup();}
});
test("mid-run revocation stops further provider reads and never permits a second attempt",async()=>{
 const f=await fixture();try{
  await f.grant();f.onFetch(async()=>{await f.db.execute(sql`UPDATE shopify_agentic_probe_one_shot SET revoked_at=now()`);});
  await assert.rejects(()=>f.adapter()(auth,f.session.id,"http-session"),/probe_authorization_expired_or_revoked/);
  assert.equal(f.reads(),1);assert.equal(f.httpReads(),1);
  await assert.rejects(()=>f.adapter()(auth,f.session.id,"http-session"),/probe_authorization_unavailable_or_spent/);
  assert.equal(f.httpReads(),1);
 }finally{await f.cleanup();}
});

test("private readiness HTTP requires the existing Brain/admin/session gates and never probes Shopify",async()=>{
 const f=await fixture();try{
  const handlers:any={};let allowed=true,authorized=true;
  const app=Object.fromEntries(["get","post","delete"].map(method=>[method,(path:string,handler:any)=>{handlers[method+" "+path]=handler;}]));
  registerTestChatRoutes(app as any,{db:f.db,authorize:async(req,res)=>{if(!authorized){res.status(401).json({error:"unauthorized"});return null;}return req.auth??auth;},
   access:async()=>({allowed}),generate:null as any,diagnostics:async()=>({}),agenticProbeReadiness:f.adapter(false).readiness});
  async function call(patch:any={}){let status=200,data:any;const res:any={set:()=>res,status:(code:number)=>{status=code;return res;},json:(value:any)=>{data=value;return res;}};
   await handlers["get /api/ai/test-chat/:id/agentic-compatibility"]({params:{id:f.session.id},sessionID:"http-session",get:()=>undefined,...patch},res);return {status,data};}
  authorized=false;assert.equal((await call()).status,401);authorized=true;allowed=false;assert.equal((await call()).status,403);allowed=true;
  for(const patch of [{sessionID:null},{get:()=>"cross-site"}])assert.equal((await call(patch)).status,403);
  assert.equal((await call({auth:{...auth,actorUserId:"tenant-b"}})).status,404);
  const result=await call();assert.equal(result.status,200);assert.equal(result.data.capability,"local_activation_readiness");assert.equal(result.data.liveProbePerformed,false);
  assert.equal(f.reads(),0);assert.equal(f.httpReads(),0);
 }finally{await f.cleanup();}
});
