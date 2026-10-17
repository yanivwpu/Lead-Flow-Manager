import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getTableConfig } from "drizzle-orm/pg-core";
import { eq, sql } from "drizzle-orm";
import * as schema from "../shared/schema";
import { catalogFixture } from "./shopify-catalog-fixture";
import { fixtureInventoryRequest, inventoryDue } from "./shopify-inventory-fixture";
import { ensureCatalogSource } from "../server/salesCatalog/shopify/installation";
import { createCommerceStore } from "../server/salesCatalog/commerceStore";
import { checkoutEligibility } from "../server/shopping/checkout/eligibility";
import { createCheckoutAttempts, checkoutReceiptCodec, checkoutRequestKey } from "../server/shopping/checkout/attempts";
import { CheckoutError } from "../server/shopping/checkout/contract";
import { shoppingSettingsSchema } from "../shared/shoppingAssistant";
import { shoppingSettings, type ShoppingState } from "../shared/shoppingAssistant";
import { CHECKOUT_ROLLOUT_APPROVED, checkoutAuthorization } from "../server/shopping/checkout/authorization";
import { createCheckoutHandoff } from "../server/shopping/checkout/handoff";
import { cleanupShopifyCatalog } from "../server/salesCatalog/shopify/webhooks";
import { createShoppingSessions } from "../server/shopping/sessions";
import { createShoppingService } from "../server/shopping/service";
import { checkoutDomain } from "../server/shopping/checkout/domain";
async function fixture(){
 const f=await catalogFixture(), db=f.database;
 try{
  for(const table of [schema.contacts,schema.conversations,schema.messages,schema.activityEvents,schema.aiSettings]){
   const c=getTableConfig(table);await f.pg.exec(`CREATE TABLE "${c.name}" (${c.columns.map(col=>`"${col.name}" ${col.enumValues?.length?"text":col.getSQLType()}${col.name==="id"?" PRIMARY KEY DEFAULT gen_random_uuid()":""}`).join(",")})`);
  }
  await f.pg.exec(readFileSync("migrations/0110_checkout_preparation_attempts.sql","utf8"));
  await f.pg.exec(readFileSync("migrations/0110_checkout_preparation_attempts.sql","utf8"));
  await f.pg.exec(readFileSync("migrations/0111_checkout_provider_gates.sql","utf8"));
  await db.insert(schema.contacts).values({id:"contact-a",userId:"tenant-a",name:"Fixture"});
  const source=(await ensureCatalogSource(db,"tenant-a"))!;
  await db.update(schema.catalogSources).set({status:"ready",currency:"USD",allowedHosts:["fixture-a.myshopify.com"],initialSyncCompletedAt:new Date(),grantedScopes:["read_products","read_inventory"]}).where(eq(schema.catalogSources.id,source.id));
  await db.insert(schema.catalogProducts).values({id:"p",userId:"tenant-a",sourceId:source.id,externalId:"gid://shopify/Product/1",title:"Snowboard",searchText:"snowboard",status:"ACTIVE",published:true,complete:true,variantCount:1,providerUpdatedAt:new Date()});
  await db.insert(schema.catalogVariants).values({id:"v",userId:"tenant-a",sourceId:source.id,productId:"p",externalId:"gid://shopify/ProductVariant/2",inventoryItemId:"gid://shopify/InventoryItem/2",title:"Ice",options:[{name:"Color",value:"Ice"}],price:"699.95",currency:"USD",tracked:true,quantity:5,inventoryPolicy:"DENY",availableForSale:true,requiresComponents:false,verifiedAt:new Date(0),providerUpdatedAt:new Date(),generation:"fixture"});
  const state={version:1,sourceId:source.id,step:"confirmed",intent:"confirm",choices:[],selected:{productId:"p",variantId:"v",productTitle:"Snowboard",variantTitle:"Ice",options:[{name:"Color",value:"Ice"}],price:"699.95",currency:"USD",verifiedAt:new Date().toISOString()},quantity:2,updatedAt:new Date().toISOString(),lastEventId:"confirmation",reply:"",consumedEventIds:["confirmation"]};
  await db.insert(schema.conversations).values({id:"conv",userId:"tenant-a",contactId:"contact-a",channel:"webchat",status:"open",shoppingState:state});
  const commerce=createCommerceStore(db,fixtureInventoryRequest(db));
  return {...f,db,source,state,commerce};
 }catch(error){await f.cleanup();throw error;}
}
test("owned persisted confirmed selection resolves only backend variant IDs and live inventory",async()=>{
 const f=await fixture();try{
  await inventoryDue(f.db,f.source.id);
  const eligible=await checkoutEligibility(f.db,f.commerce,"tenant-a","conv");
  assert.equal(eligible.item.variantId,"gid://shopify/ProductVariant/2");assert.equal(eligible.item.productId,"gid://shopify/Product/1");assert.equal(eligible.item.quantity,2);
  await assert.rejects(checkoutEligibility(f.db,f.commerce,"tenant-b","conv"),/not_confirmed/);
  for(const patch of [{step:"confirming"},{intent:"select"},{quantity:100},{updatedAt:new Date(Date.now()-31*60_000).toISOString()},{_lease:{until:Date.now()+60_000}},{consumedEventIds:[]}]){
   await f.db.update(schema.conversations).set({shoppingState:{...f.state,...patch}}).where(eq(schema.conversations.id,"conv"));await assert.rejects(checkoutEligibility(f.db,f.commerce,"tenant-a","conv"));
  }
  for(const patch of [{price:"1"},{currency:"EUR"},{options:[]},{variantId:"other-tenant-variant"}]){
   await f.db.update(schema.conversations).set({shoppingState:{...f.state,selected:{...f.state.selected,...patch}}}).where(eq(schema.conversations.id,"conv"));await inventoryDue(f.db,f.source.id);await assert.rejects(checkoutEligibility(f.db,f.commerce,"tenant-a","conv"));
  }
  await f.db.update(schema.conversations).set({shoppingState:f.state}).where(eq(schema.conversations.id,"conv"));
  await f.db.update(schema.catalogVariants).set({quantity:1}).where(eq(schema.catalogVariants.id,"v"));await inventoryDue(f.db,f.source.id);
  await assert.rejects(checkoutEligibility(f.db,f.commerce,"tenant-a","conv"),/unavailable/);
  const contacts=await f.db.select().from(schema.contacts),messages=await f.db.select().from(schema.messages);assert.equal(contacts.length,1);assert.equal(messages.length,0);
 }finally{await f.cleanup();}
});
test("durable duplicate suppression across workers; encrypted reuse; no automatic timeout redispatch; local expiry",async()=>{
 const f=await fixture();try{
  const codec=checkoutReceiptCodec(Buffer.alloc(32,9)),attempts=createCheckoutAttempts(f.db,codec),other=createCheckoutAttempts(f.db,codec);
  const context={userId:"tenant-a",conversationId:"conv",sourceId:f.source.id,integrationId:"integration-a",confirmationId:"confirmation",item:{variantId:"v",quantity:2}};
  const receipt={checkoutUrl:"https://fixture-a.myshopify.com/cart/c/provider?key=secret",providerCartId:"gid://shopify/Cart/provider?key=secret",paymentStatus:"unknown" as const};
  let calls=0,release!:()=>void,entered!:()=>void;
  const wait=new Promise<void>(r=>{release=r;}),started=new Promise<void>(r=>{entered=r;});
  const first=attempts.run(context,async()=>{calls++;entered();await wait;return receipt;});await started;
  await assert.rejects(other.run(context,async()=>{calls++;return receipt;}),/already_preparing/);release();assert.deepEqual(await first,receipt);
  assert.deepEqual(await other.run(context,async()=>{calls++;return receipt;}),receipt);assert.equal(calls,1);
  const rows=await f.db.execute(sql`SELECT * FROM checkout_preparation_attempts`);assert.doesNotMatch(JSON.stringify(rows.rows),/key=secret|myshopify/);
  const changed={...context,confirmationId:"new-confirmation"};await assert.rejects(attempts.run(changed,async()=>{calls++;throw new CheckoutError("ambiguous");}),/ambiguous/);
  await assert.rejects(other.run(changed,async()=>{calls++;return receipt;}),/ambiguous/);assert.equal(calls,2);
  const key=checkoutRequestKey(context);await f.db.execute(sql`UPDATE checkout_preparation_attempts SET expires_at=NOW()-interval '1 second' WHERE request_key=${key}`);
  await assert.rejects(other.run(context,async()=>{calls++;return receipt;}),/expired/);assert.equal(calls,2);
  // Simulate process death after the committed claim, before recording a result.
  await f.db.execute(sql`UPDATE checkout_preparation_attempts SET status='preparing' WHERE request_key=${checkoutRequestKey(changed)}`);
  await assert.rejects(other.run(changed,async()=>{calls++;return receipt;}),/already_preparing/);assert.equal(calls,2);
  const safe={...context,confirmationId:"throttled"};await assert.rejects(attempts.run(safe,async()=>{throw new CheckoutError("throttled",60_000);}),/throttled/);
  await assert.rejects(other.run(safe,async()=>receipt),/already_preparing/);
  await f.db.execute(sql`UPDATE checkout_preparation_attempts SET retry_at=NOW()-interval '1 second' WHERE request_key=${checkoutRequestKey(safe)}`);
  assert.deepEqual(await other.run(safe,async()=>receipt),receipt);
 }finally{await f.cleanup();}
});
test("runtime rollout stays locked; private Test Chat has only a pure preview",()=>{
 assert.equal(shoppingSettingsSchema.parse({}).checkoutEnabled,false);
 assert.equal(CHECKOUT_ROLLOUT_APPROVED,false);
 assert.doesNotMatch(readFileSync("server/aiTestChat/generate.ts","utf8"),/checkout\/|cartCreate|createShopifyCheckoutProvider/);
});

test("tokenless merchant authorization depends on owned active installation and Pro; no credentials disclosed or subscriptions changed",async()=>{
 const f=await fixture();try {
  const before=await f.db.select().from(schema.users);
  assert.equal((await checkoutAuthorization(f.db,"tenant-a",true)).status,"awaiting_review");
  assert.equal((await checkoutAuthorization(f.db,"tenant-a",false,true)).status,"pro_required");
  assert.equal((await checkoutAuthorization(f.db,"missing",true,true)).status,"connect_shopify");
  const ready=await checkoutAuthorization(f.db,"tenant-a",true,true);
  assert.equal(ready.ready,true);assert.doesNotMatch(JSON.stringify(ready),/fixture-token|myshopify|integration/);
  assert.deepEqual(await f.db.select().from(schema.users),before);
 }finally {await f.cleanup();}
});

test("custom checkout host is attested through the owned installation, not supplied by a merchant; wrong shop and unsafe hosts fail closed",async()=>{
 const f=await fixture();try {
  let calls=0;
  const requestFor=(shop:string,token:string)=>async()=>{calls++;assert.equal(shop,"fixture-a.myshopify.com");assert.equal(token,"fixture-token-a");return {shop:{myshopifyDomain:shop,primaryDomain:{host:"store.example.invalid"}}};};
  assert.equal(await checkoutDomain(f.db,"tenant-a","fixture-a.myshopify.com",requestFor),"store.example.invalid");
  await assert.rejects(checkoutDomain(f.db,"tenant-b","fixture-a.myshopify.com",requestFor),/setup_required/);assert.equal(calls,1);
  for(const host of ["https://evil.invalid","evil.invalid:443","127.0.0.1","evil.invalid/path",""])await assert.rejects(checkoutDomain(f.db,"tenant-a","fixture-a.myshopify.com",()=>async()=>({shop:{myshopifyDomain:"fixture-a.myshopify.com",primaryDomain:{host}}})),/invalid_response/);
  await assert.rejects(checkoutDomain(f.db,"tenant-a","fixture-a.myshopify.com",()=>async()=>({shop:{myshopifyDomain:"fixture-b.myshopify.com",primaryDomain:{host:"evil.invalid"}}})),/invalid_response/);
 }finally {await f.cleanup();}
});

test("real Shopping session -> durable handoff -> existing reply; repeat confirmation reuses encrypted cart; safe Inbox activity and uninstall isolation",async()=>{
 const f=await fixture();try {
  const config=shoppingSettings({enabled:true,checkoutEnabled:true});let creates=0,checks=0;
  const receipt={checkoutUrl:"https://fixture-a.myshopify.com/cart/c/test?key=cart-secret",providerCartId:"gid://shopify/Cart/test?key=cart-secret",paymentStatus:"unknown" as const};
  const hook=createCheckoutHandoff({database:f.db,commerce:f.commerce,approved:()=>true,settings:async()=>config,entitled:async()=>true,codec:()=>checkoutReceiptCodec(Buffer.alloc(32,9)),provider:()=>({verify:async()=>{},prepare:async item=>{creates++;assert.equal(item.variantId,"gid://shopify/ProductVariant/2");assert.ok(item.inventoryProof);return receipt;},status:async()=>{checks++;return "available";}})});
  const service=createShoppingService({commerce:f.commerce,sessions:createShoppingSessions(f.db),settings:async()=>config,entitled:async()=>true,checkout:hook});
  await f.db.update(schema.conversations).set({shoppingState:{...f.state,step:"confirming"}}).where(eq(schema.conversations.id,"conv"));
  await f.db.update(schema.contacts).set({automationsPaused:false}).where(eq(schema.contacts.id,"contact-a"));
  let n=0;
  async function turn(text="confirm") {
   const id=`in-${++n}`;await f.db.insert(schema.messages).values({id,userId:"tenant-a",contactId:"contact-a",conversationId:"conv",direction:"inbound",contentType:"text",content:text,createdAt:new Date(Date.now()+n*1000)});
   await inventoryDue(f.db,f.source.id);
   return service.turn({userId:"tenant-a",conversationId:"conv",eventId:id,text,channel:"webchat"});
  }
  const first=await turn();assert.equal(first?.state.checkout?.status,"ready");assert.match(first!.reply,/cart-secret/);
  const replay=await service.turn({userId:"tenant-a",conversationId:"conv",eventId:"in-1",text:"confirm",channel:"webchat"});
  assert.equal(replay?.reply,first?.reply,"Builder and AI Brain read the same encrypted preparation");assert.equal(creates,1);assert.equal(checks,1);
  assert.equal((await f.db.select().from(schema.activityEvents)).length,1,"readers do not duplicate shopping activity");
  await f.db.execute(sql`UPDATE checkout_provider_gates SET next_request_at=NOW()-interval '1 second'`);
  const second=await turn();assert.equal(second?.state.checkout?.status,"ready");assert.equal(creates,1);assert.equal(checks,2);
  const [conv]=await f.db.select().from(schema.conversations);assert.doesNotMatch(JSON.stringify(conv.shoppingState),/cart-secret|https:/);
  const events=await f.db.select().from(schema.activityEvents);assert.equal(events.length,2);assert.equal((events[0].eventData as any).checkoutCreated,true);assert.doesNotMatch(JSON.stringify(events),/cart-secret|https:/);
  assert.equal((await f.db.select().from(schema.messages)).some(m=>m.direction==="outbound"),false);
  assert.equal((await f.db.select().from(schema.contacts)).length,1);
  const before=await f.db.select().from(schema.users);
  await f.db.execute(sql`INSERT INTO checkout_provider_gates VALUES ('tenant-b','fixture-b.myshopify.com',NOW())`);
  await f.db.transaction(tx=>cleanupShopifyCatalog(tx,"fixture-a.myshopify.com",false));
  assert.equal((await f.db.execute(sql`SELECT * FROM checkout_preparation_attempts`)).rows.length,0);
  assert.equal((await f.db.execute(sql`SELECT * FROM checkout_provider_gates`)).rows.length,1);
  assert.deepEqual(await f.db.select().from(schema.users),before);
 }finally {await f.cleanup();}
});

test("superseding inbound suppresses checkout reply; ambiguous provider failure keeps selection and never redispatches",async()=>{
 const f=await fixture();try {
  let creates=0,stale=false;const guard={token:"held",check:async()=>{if(stale)throw Error("shopping_turn_superseded");}};
  await f.db.update(schema.conversations).set({shoppingState:{...f.state,_lease:{token:"held",until:Date.now()+120_000}}}).where(eq(schema.conversations.id,"conv"));
  const state=f.state as ShoppingState;
  const inventory=(await (async()=>{await inventoryDue(f.db,f.source.id);return f.commerce.verifyForPurchase("tenant-a",f.source.id,["v"]);})())[0];
  const hook=createCheckoutHandoff({database:f.db,commerce:f.commerce,approved:()=>true,settings:async()=>shoppingSettings({enabled:true,checkoutEnabled:true}),entitled:async()=>true,codec:()=>checkoutReceiptCodec(Buffer.alloc(32,9)),provider:()=>({verify:async()=>{},prepare:async()=>{creates++;throw new CheckoutError("ambiguous");},status:async()=>"available"})});
  const turn={userId:"tenant-a",conversationId:"conv",eventId:"confirmation",text:"confirm",channel:"webchat"};
  assert.equal((await hook(turn,state,guard,inventory)).status,"pending");
  assert.equal((await hook(turn,state,guard,inventory)).status,"pending");assert.equal(creates,1);assert.equal(state.selected?.variantId,"v");
  stale=true;await assert.rejects(hook(turn,state,guard,inventory),/superseded/);assert.equal(creates,1);
  const disabled=createCheckoutHandoff({database:f.db,commerce:f.commerce,approved:()=>false,settings:async()=>{throw Error("must not read");},entitled:async()=>true,codec:()=>{throw Error("must not read");}});
  assert.equal((await disabled(turn,state,guard,inventory)).status,"setup_required");
 }finally {await f.cleanup();}
});

test("late cancellation suppresses a completed cart; expired provider carts and cooldowns never create a replacement",async()=>{
 const f=await fixture();try {
  let creates=0,stale=false,expired=false;
  await f.db.update(schema.conversations).set({shoppingState:{...f.state,_lease:{token:"held",until:Date.now()+120_000}}}).where(eq(schema.conversations.id,"conv"));
  await inventoryDue(f.db,f.source.id);const inventory=(await f.commerce.verifyForPurchase("tenant-a",f.source.id,["v"]))[0];
  const guard={token:"held",check:async()=>{if(stale)throw Error("shopping_turn_superseded");}};
  const receipt={checkoutUrl:"https://fixture-a.myshopify.com/cart/c/late",providerCartId:"gid://shopify/Cart/late",paymentStatus:"unknown" as const};
  const hook=createCheckoutHandoff({database:f.db,commerce:f.commerce,approved:()=>true,settings:async()=>shoppingSettings({enabled:true,checkoutEnabled:true}),entitled:async()=>true,codec:()=>checkoutReceiptCodec(Buffer.alloc(32,9)),provider:()=>({verify:async()=>{},prepare:async()=>{creates++;stale=true;return receipt;},status:async()=>expired?"expired":"available"})});
  const turn={userId:"tenant-a",conversationId:"conv",eventId:"confirmation",text:"confirm",channel:"webchat"};
  await assert.rejects(hook(turn,f.state as ShoppingState,guard,inventory),/superseded/);assert.equal(creates,1);
  stale=false;
  assert.equal((await hook(turn,f.state as ShoppingState,guard,inventory)).status,"pending","durable cooldown covers receipt status reads too");assert.equal(creates,1);
  await f.db.execute(sql`UPDATE checkout_provider_gates SET next_request_at=NOW()-interval '1 second'`);expired=true;
  assert.equal((await hook(turn,f.state as ShoppingState,guard,inventory)).status,"expired");assert.equal(creates,1);
  assert.equal((await f.db.select().from(schema.messages)).length,0);
 }finally {await f.cleanup();}
});
