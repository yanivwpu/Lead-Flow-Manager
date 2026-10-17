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
async function fixture(){
 const f=await catalogFixture(), db=f.database;
 try{
  for(const table of [schema.contacts,schema.conversations,schema.messages,schema.activityEvents]){
   const c=getTableConfig(table);await f.pg.exec(`CREATE TABLE "${c.name}" (${c.columns.map(col=>`"${col.name}" ${col.enumValues?.length?"text":col.getSQLType()}${col.name==="id"?" PRIMARY KEY DEFAULT gen_random_uuid()":""}`).join(",")})`);
  }
  await f.pg.exec(readFileSync("migrations/0110_checkout_preparation_attempts.sql","utf8"));
  await f.pg.exec(readFileSync("migrations/0110_checkout_preparation_attempts.sql","utf8"));
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
test("runtime stays disabled and private Test Chat has no checkout operation",()=>{
 assert.equal(shoppingSettingsSchema.parse({}).checkoutEnabled,false);assert.equal(shoppingSettingsSchema.safeParse({checkoutEnabled:true}).success,false);
 for(const path of ["server/shopping/runtime.ts","server/aiTestChat/generate.ts"])assert.doesNotMatch(readFileSync(path,"utf8"),/checkout\/|cartCreate|createShopifyCheckoutProvider/);
});
