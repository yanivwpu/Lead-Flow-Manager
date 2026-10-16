import test from "node:test";
import assert from "node:assert/strict";
import { getTableConfig } from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";
import { catalogFixture } from "./shopify-catalog-fixture";
import { fixtureInventoryRequest, inventoryDue } from "./shopify-inventory-fixture";
import * as schema from "../shared/schema";
import { ensureCatalogSource } from "../server/salesCatalog/shopify/installation";
import { createCommerceStore } from "../server/salesCatalog/commerceStore";
import { createShoppingSessions } from "../server/shopping/sessions";
import { createShoppingService } from "../server/shopping/service";
import { shoppingSettings } from "../shared/shoppingAssistant";
import { registerShoppingRoutes } from "../server/shopping/routes";
import { SHOPPING_SCHEMA_SQL } from "../server/shopping/schemaSql";
import { readFileSync } from "node:fs";

test("PostgreSQL shopping integration: persisted inbound, live catalog, dedup, tenant and pause/handoff isolation",async()=>{
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
