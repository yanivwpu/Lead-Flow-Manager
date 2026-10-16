import test from "node:test";
import assert from "node:assert/strict";
import { getTableConfig } from "drizzle-orm/pg-core";
import { and, desc, eq } from "drizzle-orm";
import { catalogFixture } from "./shopify-catalog-fixture";
import { fixtureInventoryRequest, inventoryDue } from "./shopify-inventory-fixture";
import * as schema from "../shared/schema";
import { ensureCatalogSource } from "../server/salesCatalog/shopify/installation";
import { createCommerceStore } from "../server/salesCatalog/commerceStore";
import { createShoppingSessions } from "../server/shopping/sessions";
import { storage } from "../server/storage";
import { withAutomationSendGuard } from "../server/automationSendGuard";
import { webchatAutoSendIdempotencyKey } from "../shared/webchatAiPolicy";
import { createShoppingSuggestion } from "../server/shopping/suggestion";
import { CatalogApiError } from "../server/salesCatalog/shopify/api";
import { createShoppingService } from "../server/shopping/service";
import { shoppingSettings } from "../shared/shoppingAssistant";
import { registerShoppingRoutes } from "../server/shopping/routes";
import { SHOPPING_SCHEMA_SQL } from "../server/shopping/schemaSql";
import { readFileSync } from "node:fs";

async function shoppingFixture() {
 const f=await catalogFixture(),db=f.database;
 try {
  for(const table of [schema.contacts,schema.conversations,schema.messages,schema.activityEvents,schema.aiSettings]) {
   const c=getTableConfig(table);
   await f.pg.exec(`CREATE TABLE "${c.name}" (${c.columns.map(col=>`"${col.name}" ${col.enumValues?.length?"text":col.getSQLType()}${col.name==="id"?" PRIMARY KEY DEFAULT gen_random_uuid()":col.name==="created_at"?" DEFAULT now()":""}`).join(",")})`);
  }
  await f.pg.exec(SHOPPING_SCHEMA_SQL);await f.pg.exec(readFileSync("migrations/0108_conversation_shopping.sql","utf8"));
  await db.insert(schema.contacts).values({id:"contact-a",userId:"tenant-a",name:"Fixture",automationsPaused:false});
  await db.insert(schema.conversations).values({id:"conv-a",userId:"tenant-a",contactId:"contact-a",channel:"webchat",status:"open",aiControl:{},shoppingState:{}});
  const source=(await ensureCatalogSource(db,"tenant-a"))!;
  await db.update(schema.catalogSources).set({status:"ready",currency:"USD",allowedHosts:["fixture-a.myshopify.com"],initialSyncCompletedAt:new Date(),grantedScopes:["read_products","read_inventory"]}).where(eq(schema.catalogSources.id,source.id));
  await db.insert(schema.catalogProducts).values({id:"product-a",userId:"tenant-a",sourceId:source.id,externalId:"gid://shopify/Product/1",title:"Snowboard",searchText:"snowboard",status:"ACTIVE",published:true,complete:true,variantCount:2,providerUpdatedAt:new Date()});
  await db.insert(schema.catalogVariants).values(["Ice","Fire"].map((title,i)=>({id:`variant-${i}`,userId:"tenant-a",sourceId:source.id,productId:"product-a",externalId:`gid://shopify/ProductVariant/${i+1}`,inventoryItemId:`gid://shopify/InventoryItem/${i+1}`,title,options:[{name:"Color",value:title}],price:"699.95",currency:"USD",tracked:true,quantity:5,inventoryPolicy:"DENY",availableForSale:true,requiresComponents:false,verifiedAt:new Date(0),providerUpdatedAt:new Date(),generation:"fixture"})));
  return {...f,db,source};
 }catch(error){await f.cleanup();throw error;}
}

test("PostgreSQL shopping integration: persisted inbound, live catalog, dedup, tenant and pause/handoff isolation",async()=>{
 const f=await shoppingFixture(),{db,source}=f;
 try {
  let calls=0;
  const request=fixtureInventoryRequest(db);
  const commerce=createCommerceStore(db,(shop,token)=>async(q,v)=>{calls++;return request(shop,token)(q,v);});
  const service=createShoppingService({commerce,sessions:createShoppingSessions(db),settings:async()=>shoppingSettings({enabled:true}),entitled:async()=>true});
  let n=0;
  async function turn(text:string,overrides={}) {
   const id=`in-${++n}`;
   await db.insert(schema.messages).values({id,userId:"tenant-a",conversationId:"conv-a",contactId:"contact-a",direction:"inbound",content:text,contentType:"text",createdAt:new Date(Date.now()+n*1000)});
   await inventoryDue(db,source.id);
   return service.turn({userId:"tenant-a",conversationId:"conv-a",eventId:id,text,channel:"webchat",...overrides});
  }
  const first=await turn("show snowboard under 750");assert.equal(first!.state.choices.length,2);assert.equal(calls,1);
  const retry=await service.turn({userId:"tenant-a",conversationId:"conv-a",eventId:"in-1",text:"show snowboard under 750",channel:"webchat"});assert.equal(retry!.reply,first!.reply);assert.equal(calls,1);
  assert.equal((await turn("Ice"))!.state.selected?.variantId,"variant-0");
  assert.equal((await turn("yes"))!.state.step,"confirmed");
  assert.equal(await turn("Ice",{userId:"tenant-b"}),null);assert.equal(await turn("Ice",{eventId:"forged"}),null);
  assert.equal(await service.turn({userId:"tenant-a",conversationId:"conv-a",eventId:"in-1",text:"show snowboard under 750",channel:"webchat"}),null,"older inbound cannot revert selection");
  // A concurrent worker cannot enter a held lease; a newer inbound fences the original worker.
  const sessions=createShoppingSessions(db);
  let release!:()=>void, entered!:()=>void;
  const waiting=new Promise<void>(r=>{release=r;});const acquired=new Promise<void>(r=>{entered=r;});
  const turnContext={userId:"tenant-a",conversationId:"conv-a",eventId:`in-${n}`,text:"Ice",channel:"webchat"};
  const pending=sessions.withTurn(turnContext,async(state,save)=>{entered();await waiting;await save({...state!,step:"cancelled"});return true;});
  await acquired;
  await assert.rejects(sessions.withTurn(turnContext,async()=>true),/shopping_busy/);
  const superseding=`in-${++n}`;
  await db.insert(schema.messages).values({id:superseding,userId:"tenant-a",conversationId:"conv-a",contactId:"contact-a",direction:"inbound",content:"new request",contentType:"text",createdAt:new Date(Date.now()+n*1000)});
  release();await assert.rejects(pending,/shopping_turn_superseded/);
  await db.update(schema.conversations).set({aiControl:{paused:true}}).where(eq(schema.conversations.id,"conv-a"));
  assert.equal(await turn("show snowboard"),null);
  await db.update(schema.conversations).set({aiControl:{}}).where(eq(schema.conversations.id,"conv-a"));
  assert.equal((await turn("human please"))!.handoff,true);
  assert.equal(await turn("Ice"),null,"existing handoff gate blocks further processing");
  const events=await db.select().from(schema.activityEvents);
  assert.equal(events.filter(e=>e.eventType==="ai_handoff").length,1);
  assert.equal(events.filter(e=>e.eventType==="shopping_activity").length,4);
  const outbound=await db.select().from(schema.messages);assert.equal(outbound.some(m=>m.direction==="outbound"),false);
  const contacts=await db.select().from(schema.contacts);assert.equal(contacts.length,1);
  const handlers=new Map<string,Function>();
  registerShoppingRoutes({get:(path:string,fn:Function)=>handlers.set("GET "+path,fn),patch:(path:string,fn:Function)=>handlers.set("PATCH "+path,fn)} as any,db,async()=>false,async()=>({workspaceUserId:"tenant-a",actorUserId:"tenant-a"}));
  async function routeRequest(method:string,path:string,body:any={},user="tenant-a") {
   let status=200,data:any;const res:any={set:()=>res,status:(n:number)=>{status=n;return res;},json:(d:any)=>{data=d;return res;}};
   await handlers.get(`${method} ${path}`)!({user:{id:user},params:{id:"conv-a"},body},res);return {status,data};
  }
  assert.equal((await routeRequest("PATCH","/api/ai/shopping-settings",{enabled:true})).status,403);
  assert.equal((await routeRequest("PATCH","/api/ai/shopping-settings",{checkoutEnabled:true})).status,400);
  assert.equal((await routeRequest("PATCH","/api/ai/shopping-settings",{enabled:false})).status,200);
  const settings=await routeRequest("GET","/api/ai/shopping-settings");assert.equal(settings.data.checkoutReady,false);
  const activity=await routeRequest("GET","/api/conversations/:id/shopping");assert.equal(activity.data.state.step,"handoff");
  assert.equal(activity.data.state.consumedEventIds,undefined);assert.equal(activity.data.state.reply,undefined);assert.equal(activity.data.state._lease,undefined);
  assert.equal((await routeRequest("GET","/api/conversations/:id/shopping",{},"tenant-b")).status,404);

 }finally {await f.cleanup();}
});


test("fast real inventory cooldown turns preserve choices/quantity and Builder + AI Brain share one prepared turn",async()=>{
 const f=await shoppingFixture(),{db,source}=f;
 try {
  let calls=0,price="699.95",throttled=false;
  const request=fixtureInventoryRequest(db,n=>({...n,price}));
  const commerce=createCommerceStore(db,(shop,token)=>async(q,v)=>{
   calls++;if(throttled)throw new CatalogApiError("throttled",60_000);
   return request(shop,token)(q,v);
  });
  const settings=async()=>shoppingSettings({enabled:true,handoffOnFailure:true});
  const service=createShoppingService({commerce,sessions:createShoppingSessions(db),settings,entitled:async()=>true});
  const entry=createShoppingSuggestion({settings,turn:t=>service.turn(t),latestInbound:async()=>{
   const [m]=await db.select({id:schema.messages.id,content:schema.messages.content}).from(schema.messages).where(and(eq(schema.messages.conversationId,"conv-a"),eq(schema.messages.direction,"inbound"))).orderBy(desc(schema.messages.createdAt)).limit(1);return m;
  }});
  let n=0;
  const input=(text:string)=>({userId:"tenant-a",conversationId:"conv-a",channel:"webchat",text});
  async function inbound(text:string){
   await db.insert(schema.messages).values({id:`fast-${++n}`,userId:"tenant-a",conversationId:"conv-a",contactId:"contact-a",direction:"inbound",content:text,contentType:"text",createdAt:new Date(Date.now()+n*1000)});
   return input(text);
  }
  const discovery=await inbound("show snowboard under 750");
  const prepared=await entry(discovery); // Chatbot Builder prepares, never sends.
  const draft=await entry(discovery); // AI Brain reads the exact same session/event.
  assert.equal(draft!.reply,prepared!.reply);assert.equal(calls,1);
  assert.equal((await db.select().from(schema.activityEvents)).length,1);
  // Exercise the existing AI Brain send boundary with an injected local sender only.
  // The Builder preparation above did not send; two AI delivery attempts share one durable key.
  await f.pg.exec("CREATE TABLE automation_send_dedup (dedup_key text PRIMARY KEY,user_id varchar,contact_id varchar,status text,created_at timestamp DEFAULT now())");
  const original={getContact:storage.getContact,getConversation:storage.getConversation,tryAcquireAutomationSendDedup:storage.tryAcquireAutomationSendDedup,completeAutomationSendDedup:storage.completeAutomationSendDedup};
  let sends=0;
  try {
   storage.getContact=async id=>(await db.select().from(schema.contacts).where(eq(schema.contacts.id,id)))[0];
   storage.getConversation=async id=>(await db.select().from(schema.conversations).where(eq(schema.conversations.id,id)))[0];
   storage.tryAcquireAutomationSendDedup=async(dedupKey,userId,contactId)=>!!(await db.insert(schema.automationSendDedup).values({dedupKey,userId,contactId}).onConflictDoNothing().returning()).length;
   storage.completeAutomationSendDedup=async(dedupKey,status)=>{await db.update(schema.automationSendDedup).set({status}).where(eq(schema.automationSendDedup.dedupKey,dedupKey));};
   const delivery={userId:"tenant-a",contactId:"contact-a",conversationId:"conv-a",channel:"webchat",source:"ai_auto" as const,idempotencyKey:webchatAutoSendIdempotencyKey("tenant-a","fast-1")};
   const delivered=await Promise.all([withAutomationSendGuard(delivery,async()=>{sends++;return draft!.reply;}),withAutomationSendGuard(delivery,async()=>{sends++;return draft!.reply;})]);
   assert.equal(sends,1);assert.equal(delivered.filter(d=>d.ok).length,1);assert.equal(delivered.filter(d=>!d.ok&&d.reason==="duplicate").length,1);
  }finally{Object.assign(storage,original);}

  // Do NOT reset #90's cooldown before this selection. It must not mean out of stock.
  const selection=await inbound("Ice");
  const pending=await entry(selection);
  assert.equal((pending as any).state.step,"pending");assert.equal(pending!.handoff,false);assert.equal(calls,1);
  assert.equal((pending as any).state.selected.variantId,"variant-0");assert.equal((pending as any).state.choices.length,2);
  assert.doesNotMatch(pending!.reply,/available now|out of stock|team member|699\.95/i);
  const again=await entry(selection);assert.equal(again!.reply,pending!.reply);assert.equal(calls,1);
  assert.equal((await db.select().from(schema.activityEvents)).length,2,"pending Builder/AI replay must not create another activity");
  await entry(await inbound("quantity 3"));
  // Move to the recovery boundary only after asserting the unmodified real cooldown above.
  await inventoryDue(db,source.id);
  const recovered=await entry(await inbound("retry"));
  assert.equal((recovered as any).state.step,"confirming");assert.equal((recovered as any).state.quantity,3);
  const confirm=await entry(await inbound("yes"));assert.equal((confirm as any).state.step,"pending");
  price="710.00";
  await inventoryDue(db,source.id);
  const changed=await entry(await inbound("retry"));assert.equal((changed as any).state.step,"confirming");assert.match(changed!.reply,/changed/);
  await inventoryDue(db,source.id);
  const confirmed=await entry(await inbound("yes"));assert.equal((confirmed as any).state.step,"confirmed");
  // Shopify 429/backoff retains a valid selection even with handoff-on-failure enabled.
  throttled=true;await inventoryDue(db,source.id);
  const rateLimited=await entry(await inbound("Ice"));assert.equal((rateLimited as any).state.step,"pending");
  assert.equal((rateLimited as any).state.selected.variantId,"variant-0");assert.equal(rateLimited!.handoff,false);
  const after429=calls;
  await entry(await inbound("retry"));assert.equal(calls,after429,"durable throttle must prevent another API request");
  throttled=false;await inventoryDue(db,source.id);
  assert.equal(((await entry(await inbound("retry"))) as any).state.step,"confirming");
  // Source-lease contention is also pending, not an unavailable variant.
  await db.update(schema.catalogSources).set({leaseToken:"worker",leaseExpiresAt:new Date(Date.now()+60_000)}).where(eq(schema.catalogSources.id,source.id));
  const leased=await entry(await inbound("yes"));assert.equal((leased as any).state.step,"pending");assert.equal(leased!.handoff,false);
  const [saved]=await db.select().from(schema.conversations).where(eq(schema.conversations.id,"conv-a"));
  assert.equal((saved.shoppingState as any).selected.variantId,"variant-0");
  // Temporary conversation-lease contention uses the shared entry point's recoverable busy reply.
  const savedState=saved.shoppingState as any;
  await db.update(schema.conversations).set({shoppingState:{...savedState,_lease:{token:"other-generator",until:Date.now()+60_000}}}).where(eq(schema.conversations.id,"conv-a"));
  const beforeBusy=calls;
  const busy=await entry(input("yes"));assert.equal(busy!.handoff,false);assert.match(busy!.reply,/repeat your latest request/);assert.doesNotMatch(busy!.reply,/out of stock|team member|selection is saved/i);
  assert.equal(calls,beforeBusy);
  const [afterBusy]=await db.select().from(schema.conversations).where(eq(schema.conversations.id,"conv-a"));
  assert.deepEqual(afterBusy.shoppingState,{...savedState,_lease:{token:"other-generator",until:(afterBusy.shoppingState as any)._lease.until}});
  await db.update(schema.conversations).set({shoppingState:savedState}).where(eq(schema.conversations.id,"conv-a"));
  await db.update(schema.catalogSources).set({leaseToken:null,leaseExpiresAt:null}).where(eq(schema.catalogSources.id,source.id));await inventoryDue(db,source.id);
  assert.equal(((await entry(await inbound("retry"))) as any).state.step,"confirmed");
  const events=await db.select().from(schema.activityEvents);assert.equal(events.some(e=>e.eventType==="ai_handoff"),false);
  const messages=await db.select().from(schema.messages);assert.equal(messages.some(m=>m.direction==="outbound"),false,"neither commerce entry point is a sender");
 }finally{await f.cleanup();}
});
