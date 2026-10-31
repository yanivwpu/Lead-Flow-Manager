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

const question = "I'm looking for The Collection Snowboard: Liquid. Do you have it available, how much does it cost, and what is the inventory?";

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
    const generator=createTestChatGenerator({
      ai:{ suggestReply: async()=>{modelCalls++;throw Error("general AI must never answer a Shopify product question");} } as any,
      commerce,settings:async()=>shoppingSettings({enabled:false,allowedChannels:["webchat"]}),
      privateShoppingAllowed:async()=>true,entitled:async()=>true,
      knowledge:async()=>undefined,aiSettings:async()=>undefined,meter:async()=>{throw Error("model should not be metered")},
    });
    const sessions=createTestChatSessions(db);
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
