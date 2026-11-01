import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import * as schema from "../shared/schema";
import { createUcpCatalogClient,UCP_CATALOG_VERSION,ucpAgentProfile,type UcpBinding } from "../server/salesCatalog/shopify/ucpCatalog";
import { createUcpShoppingProvider } from "../server/shopping/ucpProvider";
import { createCommerceStore } from "../server/salesCatalog/commerceStore";
import { createShoppingService,type ShoppingSessionStore } from "../server/shopping/service";
import { createTestChatGenerator } from "../server/aiTestChat/generate";
import { shoppingSettings,type ShoppingState } from "../shared/shoppingAssistant";
import { detectConversationLanguage } from "../shared/conversationLanguage";
import { catalogFixture } from "./shopify-catalog-fixture";
import { ensureCatalogSource } from "../server/salesCatalog/shopify/installation";
import { fixtureInventoryRequest,inventoryDue } from "./shopify-inventory-fixture";

const pid=(id:number)=>`gid://shopify/Product/${id}`;
const vid=(id:number)=>`gid://shopify/ProductVariant/${id}`;
const binding:UcpBinding={userId:"tenant-a",sourceId:"source-a",integrationId:"integration-a",shop:"fixture-a.myshopify.com",currency:"USD"};
const profile="https://agent.example.com/ucp/catalog.json";
const refs=(id=1)=>[{id:pid(id),variants:[{id:vid(id*10),price:{amount:999999,currency:"USD"},availability:{available:true}}]}];
function fakeClient(options:{binding?:UcpBinding;products?:any[];enabled?:boolean;authorized?:boolean;revokeAfter?:number;status?:number;location?:string;version?:string;extra?:object;wrongId?:boolean;onCall?:()=>void}={}) {
 const calls:any[]=[];let authorizations=0;
 const bound=options.binding??binding;
 const client=createUcpCatalogClient({binding:bound,profile,
  ...(options.enabled===undefined?{}:{enabled:()=>options.enabled!}),
  authorize:async b=>{assert.equal(b.shop,bound.shop);authorizations++;return options.authorized!==false && (options.revokeAfter===undefined||authorizations<=options.revokeAfter);},
  fetcher:(async(url,init)=>{
   options.onCall?.();
   assert.equal(url,`https://${bound.shop}/api/ucp/mcp`);
   assert.equal(init!.redirect,"manual");assert.equal(init!.credentials,"omit");
   assert.deepEqual(Object.keys(init!.headers!),["Accept","Content-Type"]);
   const body=JSON.parse(init!.body as string);calls.push(body);
   assert.equal(body.params.arguments.meta["ucp-agent"].profile,profile);
   if(options.status)return new Response("provider private text",{status:options.status,headers:{location:options.location??"/password"}});
   const tool=body.params.name;
   const capability=tool==="search_catalog"?"dev.ucp.shopping.catalog.search":"dev.ucp.shopping.catalog.lookup";
   const products=options.products??refs();
   const result=body.method==="tools/list"?{tools:["search_catalog","lookup_catalog","get_product","create_cart","ask_business"].map(name=>({name,inputSchema:{type:"object",properties:{meta:{},catalog:{}}}}))}:
    {structuredContent:{ucp:{version:options.version??UCP_CATALOG_VERSION,capabilities:{[capability]:[{version:UCP_CATALOG_VERSION}]}},...(tool==="get_product"?{product:products[0]}:{products}),...options.extra}};
   return new Response(JSON.stringify({jsonrpc:"2.0",id:body.id+(options.wrongId?1:0),result}),{headers:{"content-type":"application/json"}});
  }) as typeof fetch,
 });
 return {client,calls,authorizations:()=>authorizations};
}

test("prepared UCP source is disabled by default and denied/spent authorization performs zero IO",async()=>{
 for(const options of [{},{enabled:true,authorized:false}]) {
  const f=fakeClient(options);await assert.rejects(f.client.search("snowboard"),/source_disabled|read_authorization_required/);assert.equal(f.calls.length,0);
 }
 for(const url of ["http://agent.example.com/profile","https://127.0.0.1/profile","https://[::1]/p","https://agent.example.com/p?token=private","https://localhost.local/p"]) assert.throws(()=>ucpAgentProfile(url));
 const revoked=fakeClient({enabled:true,revokeAfter:1});
 await assert.rejects(revoked.client.search("snowboard"),/read_authorization_required/);assert.equal(revoked.calls.length,1);
});

test("current search/lookup/get_product envelopes are bounded, profile negotiated and identity-only",async()=>{
 const f=fakeClient({enabled:true});
 assert.deepEqual(await f.client.search("beginner snowboard",5),[{id:pid(1),variants:[{id:vid(10)}]}]);
 await f.client.lookup([vid(10)]);
 await f.client.getProduct(pid(1),[{name:"Color",label:"Blue"}]);
 assert.equal(f.calls.length,6);assert.equal(f.authorizations(),12);
 assert.deepEqual(f.calls[1].params.arguments.catalog,{query:"beginner snowboard",pagination:{limit:5},context:{currency:"USD"}});
 assert.deepEqual(f.calls[3].params.arguments.catalog.ids,[vid(10)]);
 assert.deepEqual(f.calls[5].params.arguments.catalog.selected,[{name:"Color",label:"Blue"}]);
 assert.ok(f.calls.filter(c=>c.method==="tools/call").every(c=>["search_catalog","lookup_catalog","get_product"].includes(c.params.name)));
 assert.equal((f.client as any).askBusiness,undefined);assert.equal((f.client as any).createCart,undefined);
});

test("password, denied access, throttles, unknown schema/version and unrequested identities fail without retry",async()=>{
 for(const options of [{status:302},{status:403},{status:429},{status:404},{version:"draft"},{wrongId:true},{products:[...refs(),...refs()]},{products:[{id:pid(1),variants:[{id:vid(10),quantity_unit:{unit:"LBR"}}]}]},{products:[{id:pid(1),variants:[{id:vid(10),requires:{selling_plan:true}}]}]}]) {
  const f=fakeClient({enabled:true,...options});await assert.rejects(f.client.search("snowboard"));assert.ok(f.calls.length<=2);
  if("status" in options)assert.equal(f.calls.length,1);
 }
 const lookup=fakeClient({enabled:true,products:refs(2)});await assert.rejects(lookup.client.lookup([pid(1)]),/unrequested_identity/);
 const huge=fakeClient({enabled:true,extra:{privatePadding:"x".repeat(260_000)}});await assert.rejects(huge.client.search("snowboard"),/response_too_large/);
});

test("two catalog-backed merchants use UCP identities but only owned catalog and live Admin facts; provider errors preserve fallback",async()=>{
 const f=await catalogFixture();
 try {
  const sources:any[]=[];
  for(const [index,userId,title,price] of [[1,"tenant-a","Beginner Snowboard","100.00"],[2,"tenant-b","Lightweight Helmet","25.00"]] as const) {
   const source=(await ensureCatalogSource(f.database,userId))!;
   await f.database.update(schema.catalogSources).set({status:"ready",currency:"USD",initialSyncCompletedAt:new Date(),grantedScopes:["read_products","read_inventory"]}).where(eq(schema.catalogSources.id,source.id));
   await f.database.insert(schema.catalogProducts).values({id:`p${index}`,userId,sourceId:source.id,externalId:pid(index),title,description:`Verified description for ${title}`,searchText:title.toLowerCase(),status:"ACTIVE",published:true,complete:true,variantCount:1,providerUpdatedAt:new Date()});
   await f.database.insert(schema.catalogVariants).values({id:`v${index}`,userId,sourceId:source.id,productId:`p${index}`,externalId:vid(index*10),inventoryItemId:`gid://shopify/InventoryItem/${index*10}`,title:"Blue",options:[{name:"Color",value:"Blue"}],price,currency:"USD",tracked:true,quantity:index===1?7:3,inventoryPolicy:"DENY",availableForSale:true,requiresComponents:false,verifiedAt:new Date(),providerUpdatedAt:new Date(),generation:"fixture"});
   sources.push({...source,status:"ready",currency:"USD"});await inventoryDue(f.database,source.id);
  }
  const inventory=fixtureInventoryRequest(f.database);
  const commerce=createCommerceStore(f.database,(shop,token)=>inventory(shop,token));
  let mode:"owned"|"foreign"|"error"="owned",ucpCalls=0;const diagnostics:string[]=[];
  const hybrid=createUcpShoppingProvider({database:f.database,commerce,enabled:()=>true,diagnostic:r=>diagnostics.push(r),client:b=>{
   ucpCalls++;const index=b.userId==="tenant-a"?1:2;
   return fakeClient({binding:b,enabled:true,products:refs(mode==="foreign"?3-index:index),...(mode==="error"?{status:403}:{})}).client;
  }});
  const knowledge={"tenant-a":{userId:"tenant-a",businessName:"Snow Merchant",customInstructions:"Returns require merchant A approval"},"tenant-b":{userId:"tenant-b",businessName:"Helmet Merchant",customInstructions:"Merchant B offers a warranty only when configured"}};
  for(const [index,userId,query] of [[1,"tenant-a","Snowboard"],[2,"tenant-b","Helmet"]] as const) {
   let state:ShoppingState|null=null;
   const sessions:ShoppingSessionStore={withTurn:async(_turn,run)=>run(state,async next=>{state=next;})};
   const service=createShoppingService({commerce:hybrid,sessions,settings:async()=>shoppingSettings({enabled:true}),entitled:async()=>true});
   let event=0;
   const turn=(text:string,locale="en")=>service.turn({userId,conversationId:`c${index}`,eventId:`event-${++event}`,text,channel:"webchat",locale});
   for(const [text,locale] of [[`show ${query}`,"en"],[`Busco ${query}`,"es"],[`מחפש ${query}`,"he"]]) {
    await inventoryDue(f.database,sources[index-1].id);
    const result=(await turn(text,locale))!;
    assert.equal(result.state.choices[0].productId,`p${index}`);
    assert.equal(result.state.choices[0].price,index===1?"100.00":"25.00");
    assert.doesNotMatch(result.reply,/999999|Returns|Merchant B/);
   }
   await inventoryDue(f.database,sources[index-1].id);await turn("option 1");
   const before=structuredClone(state);
   for(const text of ["What is your return policy?","Cual es la politica de devoluciones?","מה מדיניות ההחזרות שלכם?"]) {
    assert.equal(await turn(text),null);assert.deepEqual(state,before);
   }
   const generator=createTestChatGenerator({commerce:hybrid,
    ai:{suggestReply:async(id:string,_c:string,_h:any,k:any)=>{assert.equal(k,knowledge[id as keyof typeof knowledge]);return {suggestion:k.customInstructions,modelGenerationSucceeded:false};}} as any,
    settings:async()=>shoppingSettings({enabled:false}),entitled:async()=>true,
    knowledge:async id=>knowledge[id as keyof typeof knowledge] as any,aiSettings:async()=>undefined,meter:async()=>{},
   });
   const policy=await generator({userId,sessionId:randomUUID(),history:[{id:randomUUID(),role:"user",content:"What is your return policy?",at:new Date().toISOString()}],sessions});
   assert.equal(policy,knowledge[userId].customInstructions);
   assert.equal(detectConversationLanguage(`Busco ${query}`).code,"es");
   const standard=await commerce.purchaseCandidates(userId,{sourceId:sources[index-1].id,query,limit:8,filters:{currency:"USD"}});
   const combined=await hybrid.purchaseCandidates(userId,{sourceId:sources[index-1].id,query,limit:8,filters:{currency:"USD"}});
   assert.deepEqual(combined.map(p=>p.id),standard.map(p=>p.id));
   for(const failure of ["foreign","error"] as const) {
    mode=failure;const fallback=await hybrid.purchaseCandidates(userId,{sourceId:sources[index-1].id,query,limit:8,filters:{currency:"USD"}});
    assert.deepEqual(fallback.map(p=>p.id),[`p${index}`]);
   }
   mode="owned";
  }
  assert.ok(diagnostics.includes("identity_not_in_owned_catalog"));assert.ok(diagnostics.includes("store_access_required"));
  const disabled=createUcpShoppingProvider({database:f.database,commerce,client:()=>{throw Error("disabled source must not create a client")}});
  const before=ucpCalls;assert.equal((await disabled.purchaseCandidates("tenant-a",{sourceId:sources[0].id,query:"Snowboard",limit:8})).length,1);assert.equal(ucpCalls,before);
 } finally {await f.cleanup();}
});
