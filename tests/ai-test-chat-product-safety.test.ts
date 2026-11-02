import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import * as schema from "../shared/schema";
import { shoppingSettings, shoppingFilters } from "../shared/shoppingAssistant";
import { privateMerchantCatalogPreviewAllowed } from "../server/aiTestChat/previewEligibility";
import { createTestChatGenerator } from "../server/aiTestChat/generate";
import { explicitStoreProductQuestion, guardedProductFallback } from "../shared/shopperProductGuard";
import { createTestChatSessions } from "../server/aiTestChat/sessions";
import { createCommerceStore } from "../server/salesCatalog/commerceStore";
import { fixtureInventoryRequest, inventoryDue } from "./shopify-inventory-fixture";
import { catalogFixture } from "./shopify-catalog-fixture";
import { ensureCatalogSource } from "../server/salesCatalog/shopify/installation";
import { AI_TEST_CHAT_SCHEMA_SQL } from "../server/aiTestChat/schemaSql";
import { readFileSync } from "node:fs";
import { shoppingBusinessQuestion } from "../shared/shoppingBusinessRouting";

const question = "I'm looking for The Collection Snowboard: Liquid. Do you have it available, how much does it cost, and what is the inventory?";

test("mixed named-product facts and policy never fall through to general AI when Shopping is disabled",async()=>{
 const generator=createTestChatGenerator({
  ai:{suggestReply:async()=>{throw Error("mixed Shopify facts must not reach general AI")}} as any,
  commerce:{source:async()=>({id:"owned-source"})} as any,
  settings:async()=>shoppingSettings({enabled:false}),entitled:async()=>true,
  knowledge:async()=>undefined,aiSettings:async()=>undefined,meter:async()=>{},
 });
 for(const text of ["What is the Liquid snowboard price and your return policy?", "¿Cuál es el precio de Liquid y la política de devoluciones?", "מה מחיר הסנובורד ומה מדיניות ההחזרות?", "Is product SKU ABC in stock and how long does shipping take?", "Do you have product SKU ABC, and what is your return policy?", "Do you sell Liquid snowboards, and what is your return policy?", "Do you carry Liquid and offer warranties?", "¿Cuál es la disponibilidad del producto ABC y la política de devoluciones?", "Show me products and explain your return policy", "Recommend products and explain your return policy", "¿Cuánto vale el producto ABC y cuál es la política de devoluciones?", "What is the price of the Liquid snowboard, and does your warranty plan cover it?"]) {
  assert.equal(explicitStoreProductQuestion(text),true,text);
  assert.ok(await guardedProductFallback(text,"en",async()=>true),text);
  const reply=await generator({userId:"tenant-a",sessionId:randomUUID(),history:[{id:randomUUID(),role:"user",content:text,at:new Date().toISOString()}],sessions:{withTurn:async()=>{throw Error("disabled Shopping cannot run")}} as any});
  assert.doesNotMatch(reply,/749\.95|30 days|free shipping|USD/);
  assert.match(reply,/couldn't verify|No pude verificar|לא הצלחתי לאמת/);
 }
});

test("business-only product policies delegate but mixed product facts and human requests stay guarded",async()=>{
 for(const text of ["What is your return policy for this product?", "¿Cuál es la política de devoluciones de este producto?", "מה מדיניות ההחזרות של המוצר?", "How much does shipping cost?", "What is the price of delivery?", "What are your shipping costs?", "Do you have warranties?", "¿Cuánto cuesta el envío?", "כמה עולה המשלוח?", "What is the price of your Featured Business package and your return policy?", "What is the WhachatCRM Pro plan price and your return policy?", "How can I manage inventory in Shopify and configure shipping?", "Do you have free shipping?", "Is international shipping available?"]) {
  assert.equal(shoppingBusinessQuestion(text),true,text);
  assert.equal(explicitStoreProductQuestion(text),false,text);
  assert.equal(await guardedProductFallback(text,"en",async()=>{throw Error("business questions must not query Shopify")}),null);
 }
 for(const text of ["Which is lighter, and can I return it?", "¿Cuál pesa menos y puedo devolverlo?", "מי קל יותר ומה מדיניות ההחזרות?", "What is this product's price and return policy?", "Is this product in stock and how long does shipping take?", "¿Está disponible este producto y cuánto tarda el envío?", "מה מחיר המוצר ומה מדיניות ההחזרות?", "Cancel my order and refund it", "Can a human explain your return policy?"]) {
  assert.equal(shoppingBusinessQuestion(text),false,text);
 }
});

test("private policy delegation retains the exact workspace knowledge and conversation history",async()=>{
 const rows={"tenant-a":{userId:"tenant-a",businessName:"Merchant A",customInstructions:"Returns require merchant A approval"},"tenant-b":{userId:"tenant-b",businessName:"Merchant B",customInstructions:"Returns require merchant B approval"}};
 let calls=0;
 const generator=createTestChatGenerator({
  ai:{suggestReply:async(userId:string,_session:string,history:any,knowledge:any)=>{
   calls++;
   assert.equal(knowledge,rows[userId as keyof typeof rows]);
   assert.equal(history.at(-1).content,"What is your return policy for this product?");
   return {suggestion:knowledge.customInstructions,modelGenerationSucceeded:false};
  }} as any,
  commerce:{source:async()=>{throw Error("policy delegation must not probe catalog")}} as any,
  settings:async()=>shoppingSettings({enabled:true}),entitled:async()=>true,
  knowledge:async id=>rows[id as keyof typeof rows] as any,
  aiSettings:async()=>undefined,meter:async()=>{throw Error("stub did not generate a model reply")},
 });
 for(const userId of ["tenant-a","tenant-b"]) {
  const reply=await generator({userId,sessionId:randomUUID(),history:[{id:randomUUID(),role:"user",content:"What is your return policy for this product?",at:new Date().toISOString()}],sessions:{withTurn:async()=>{throw Error("must not enter Shopping")}} as any});
  assert.equal(reply,rows[userId as keyof typeof rows].customInstructions);
 }
 assert.equal(calls,2);
});

test("activated Shopify catalog is eligible for private shopping preview only with verified readiness", () => {
  const eligible = { activated:true, eligible:true, connected:true, planEligible:true };
  assert.equal(privateMerchantCatalogPreviewAllowed(eligible,{status:"ready"}),true);
  for (const state of [{...eligible,activated:false},{...eligible,eligible:false},
    {...eligible,connected:false},{...eligible,planEligible:false},null]) {
    assert.equal(privateMerchantCatalogPreviewAllowed(state,{status:"ready"}),false);
  }
  for (const status of ["syncing","permission_required","error","disconnected"]) {
    assert.equal(privateMerchantCatalogPreviewAllowed(eligible,{status}),false);
  }
  assert.equal(privateMerchantCatalogPreviewAllowed(eligible,null),false);
});

test("product parsing strips conversational follow-up but keeps exact Shopify title", () => {
  assert.equal(explicitStoreProductQuestion(question),true);
  assert.equal(explicitStoreProductQuestion("What is the WhachatCRM Pro plan price?"),false);
  assert.equal(explicitStoreProductQuestion("I am looking for a rental property in Miami"),false);
  assert.equal(shoppingFilters(question,"USD").query.toLowerCase(),"collection snowboard liquid");
});


test("product guard leaves Shopify setup, checkout policy and ordinary knowledge with AI Brain", () => {
  for (const q of [
    "How do I connect Shopify to my CRM?",
    "Can I use discount codes at checkout?",
    "Does Shopify support checkout links?",
    "How do I add products to Shopify?",
    "How can I manage inventory in Shopify?",
    "What is the WhachatCRM Pro plan price?",
    "I'm looking for a rental apartment in Miami",
  ]) assert.equal(explicitStoreProductQuestion(q),false,q);
  for (const q of [
    question,
    "What is the price of product SKU ABC?",
    "What are the prices of your products?",
    "¿Cuáles son los precios de los productos?",
    "¿Qué productos están disponibles?",
    "Can I add product SKU ABC to my cart, and is it in stock?",
    "Can I add product SKU ABC to my cart?",
    "Is SKU ABC in stock?",
    "Do you have item ABC available?",
    "¿Está disponible el producto ABC?",
    "מה המחיר של מוצר ABC?",
  ]) assert.equal(explicitStoreProductQuestion(q),true,q);
});

test("private Test Chat delegates non-Shopify product questions and Shopify setup to AI Brain", async () => {
  let modelCalls=0, sourceChecks=0;
  const generator=createTestChatGenerator({
    ai:{suggestReply:async()=>{modelCalls++;return {suggestion:"Use your configured business knowledge",modelGenerationSucceeded:false};}} as any,
    commerce:{source:async()=>{sourceChecks++;return null;}} as any,
    settings:async()=>shoppingSettings({enabled:false}),
    privateShoppingAllowed:async()=>false,entitled:async()=>true,
    knowledge:async()=>undefined,aiSettings:async()=>undefined,meter:async()=>{},
  });
  const sessions={withTurn:async()=>null} as any;
  const respond=async(content:string)=>generator({
    userId:"non-shopify-tenant",sessionId:randomUUID(),
    history:[{id:randomUUID(),role:"user",content,at:new Date().toISOString()}],
    sessions,
  });
  assert.equal(await respond("What is the price of product SKU ABC?"),"Use your configured business knowledge");
  assert.equal(modelCalls,1);
  assert.equal(sourceChecks,1);
  assert.equal(await respond("How do I connect Shopify to my CRM?"),"Use your configured business knowledge");
  assert.equal(modelCalls,2);
  assert.equal(sourceChecks,1,"setup questions must not probe the catalog");
});

test("customer-facing Shopify product guard never fabricates product facts or routes to business plans", async () => {
  assert.match((await guardedProductFallback(question,"en",async()=>true))!,/can't verify this product/i);
  assert.equal(await guardedProductFallback("What is the WhachatCRM Pro plan price?","en",async()=>true),null);
  assert.equal(await guardedProductFallback("I'm looking for an apartment in Miami","en",async()=>true),null);
  assert.equal(await guardedProductFallback(question,"en",async()=>false),null);
  assert.match((await guardedProductFallback(question,"es",async()=>{throw Error("provider offline")}))!,/No puedo verificar/i);
});

test("private activated merchant can verify catalog prices and inventory with live shopping channels OFF", async () => {
  const f=await catalogFixture();
  try {
    const db=f.database;
    await f.pg.exec(AI_TEST_CHAT_SCHEMA_SQL);
    await f.pg.exec(readFileSync("migrations/0109_private_ai_test_chat.sql","utf8"));
    const source=(await ensureCatalogSource(db,"tenant-a"))!;
    await db.update(schema.catalogSources).set({
      status:"ready",currency:"USD",allowedHosts:["fixture-a.myshopify.com"],
      initialSyncCompletedAt:new Date(),grantedScopes:["read_products","read_inventory"],
    }).where(eq(schema.catalogSources.id,source.id));
    await db.insert(schema.catalogProducts).values({
      id:"liquid-product",userId:"tenant-a",sourceId:source.id,
      externalId:"gid://shopify/Product/1",title:"The Collection Snowboard: Liquid",
      searchText:"the collection snowboard liquid",status:"ACTIVE",published:true,
      complete:true,variantCount:1,providerUpdatedAt:new Date(),
    });
    await db.insert(schema.catalogVariants).values({
      id:"liquid-variant",userId:"tenant-a",sourceId:source.id,productId:"liquid-product",
      externalId:"gid://shopify/ProductVariant/1",inventoryItemId:"gid://shopify/InventoryItem/1",
      title:"Default Title",options:[{name:"Title",value:"Default Title"}],
      price:"749.95",currency:"USD",tracked:true,quantity:50,
      inventoryPolicy:"DENY",availableForSale:true,requiresComponents:false,
      verifiedAt:new Date(0),providerUpdatedAt:new Date(),generation:"fixture",
    });
    await inventoryDue(db,source.id);
    const inventory=fixtureInventoryRequest(db);
    const commerce=createCommerceStore(db,(shop,token)=>async(q,v)=>inventory(shop,token)(q,v));
    let modelCalls=0;
    const merchantKnowledge={userId:"tenant-a",businessName:"Snow Merchant",customInstructions:"Returns require merchant approval."};
    const generator=createTestChatGenerator({
      ai:{ suggestReply: async(...args:any[])=>{
        const action=await args[10].shoppingSuggestion({userId:args[0],conversationId:args[1],text:args[2].at(-1).content,channel:"webchat",locale:args[6]});
        if(action)return {suggestion:action.reply,modelGenerationSucceeded:false};
        modelCalls++;
        assert.equal(args[3],merchantKnowledge);
        assert.equal(args[2].at(-1).content,"What is your return policy for this product?");
        return {suggestion:merchantKnowledge.customInstructions,modelGenerationSucceeded:false};
      } } as any,
      commerce,settings:async()=>shoppingSettings({enabled:false,allowedChannels:["webchat"]}),
      privateShoppingAllowed:async()=>true,entitled:async()=>true,
      knowledge:async()=>merchantKnowledge as any,aiSettings:async()=>undefined,meter:async()=>{throw Error("model should not be metered")},
    });
    let clock=Date.now();
    const sessions=createTestChatSessions(db,()=>clock);
    const owner={workspaceUserId:"tenant-a",actorUserId:"tenant-a"};
    const chat=await sessions.create(owner);
    const result=await sessions.turn(owner,chat.id,randomUUID(),question,({history,sessions:adapter})=>
      generator({userId:"tenant-a",sessionId:chat.id,history,sessions:adapter}));
    const response=result.transcript.at(-1)!.content;
    assert.match(response,/The Collection Snowboard: Liquid/);
    assert.match(response,/749\.95/);
    assert.match(response,/stock|units/i);
    assert.doesNotMatch(response,/Free and Pro plans/i);
    assert.equal(modelCalls,0);
    assert.equal(result.state.step,"selecting");

    const turn=(text:string)=>{
      clock+=1500;
      return sessions.turn(owner,chat.id,randomUUID(),text,({history,sessions:adapter})=>generator({userId:"tenant-a",sessionId:chat.id,history,sessions:adapter}));
    };
    await inventoryDue(db,source.id);
    await turn("option 1");
    const readState=async()=> (await db.select({state:schema.aiTestSessions.shoppingState}).from(schema.aiTestSessions).where(eq(schema.aiTestSessions.id,chat.id)))[0].state as any;
    const selected=await readState();
    assert.equal(selected.selected.variantId,"liquid-variant");
    const policy=await turn("What is your return policy for this product?");
    assert.equal(policy.transcript.at(-1)!.content,merchantKnowledge.customInstructions);
    assert.deepEqual(await readState(),selected,"policy delegation must preserve exact durable Shopping state");
    assert.equal(modelCalls,1);
    await inventoryDue(db,source.id);
    await turn("What is its current price?");
    assert.equal((await readState()).selected.variantId,"liquid-variant");
    assert.equal(modelCalls,1,"product follow-up resumes verified Shopping after policy detour");

    const unavailable=createTestChatGenerator({
      ai:{suggestReply:async()=>{throw Error("unrelated general AI fallback forbidden");}} as any,
      commerce,settings:async()=>shoppingSettings({enabled:false}),
      privateShoppingAllowed:async()=>false,entitled:async()=>true,
      knowledge:async()=>undefined,aiSettings:async()=>undefined,meter:async()=>{},
    });
    const chatOff=await sessions.create({workspaceUserId:"tenant-a",actorUserId:"tenant-b"});
    const skipped=await sessions.turn({workspaceUserId:"tenant-a",actorUserId:"tenant-b"},chatOff.id,randomUUID(),question,
      ({history,sessions:adapter})=>unavailable({userId:"tenant-a",sessionId:chatOff.id,history,sessions:adapter}));
    assert.match(skipped.transcript.at(-1)!.content,/couldn't verify a Shopify product match/i);
    assert.doesNotMatch(skipped.transcript.at(-1)!.content,/Free and Pro plans/i);
    assert.equal(skipped.state.step,undefined);
  } finally {await f.cleanup();}
});
