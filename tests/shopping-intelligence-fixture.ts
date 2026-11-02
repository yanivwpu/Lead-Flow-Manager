import { eq } from "drizzle-orm";
import * as schema from "../shared/schema";
import { catalogFixture } from "./shopify-catalog-fixture";
import { ensureCatalogSource } from "../server/salesCatalog/shopify/installation";
import { fixtureInventoryRequest, inventoryDue } from "./shopify-inventory-fixture";
import { createCommerceStore } from "../server/salesCatalog/commerceStore";
import { createShoppingIntelligence, type ShoppingModel } from "../server/shopping/intelligence";
import { createShoppingService, type ShoppingSessionStore } from "../server/shopping/service";
import { shoppingSettings, type ShoppingState } from "../shared/shoppingAssistant";

export async function intelligenceFixture(model:ShoppingModel, sparse = false) {
 const f=await catalogFixture();const sources:Record<string,string>={};
 const merchant = {
  "tenant-a": {category:"Snowboard",prices:["500","650","50","350"],policy:"Unridden boards can be returned within 14 days.",descriptions:["Designed for beginners. Weight 2.4 kg. Rider weight range 160–200 pounds.","Designed for experienced riders. Weight 2.8 kg.","Excluded display board.","Designed for beginners. Weight 3.1 kg. Rider weight range 160–200 pounds."]},
  "tenant-b": {category:"Moisturizer",prices:["20","30","2","12"],policy:"Unopened skincare can be returned within 7 days.",descriptions:["Formulated for dry skin. Contains glycerin and ceramides. Fragrance free.","Contains glycerin and shea butter. Fragranced.","Excluded sample.","Formulated for dry skin. Contains glycerin. Fragrance free."]},
 };
 for(const [m,[userId,info]] of Object.entries(merchant).entries()){
  const source=(await ensureCatalogSource(f.database,userId))!;sources[userId]=source.id;
  await f.database.update(schema.catalogSources).set({status:"ready",currency:"USD",initialSyncCompletedAt:new Date(),grantedScopes:["read_products","read_inventory"]}).where(eq(schema.catalogSources.id,source.id));
  for(let i=1;i<=4;i++){
   const id=`${userId}-p${i}`,external=(m+1)*100+i;
   await f.database.insert(schema.catalogProducts).values({id,userId,sourceId:source.id,externalId:`gid://shopify/Product/${external}`,title:sparse&&userId==="tenant-a"?(["Hydrogen","Multi-location","Display","Budget Snowboard"][i-1]):`${info.category} ${i}`,productType:info.category,description:sparse&&userId==="tenant-a"?"":info.descriptions[i-1],aiGuidance:!sparse&&i===1?"Recommend only when the documented customer requirements match.":null,merchantTags:i===3||sparse&&userId==="tenant-a"&&i===4?["shopping:exclude"]:i===2?["shopping:prefer"]:[],searchText:info.category.toLowerCase(),status:"ACTIVE",published:true,complete:true,variantCount:4,providerUpdatedAt:new Date()});
   for(const [j,[color,size]] of [["Red","M"],["Blue","M"],["Blue","S"],["Black","M"]].entries()) await f.database.insert(schema.catalogVariants).values({id:`${id}-v${j+1}`,userId,sourceId:source.id,productId:id,externalId:`gid://shopify/ProductVariant/${external*10+j}`,inventoryItemId:`gid://shopify/InventoryItem/${external*10+j}`,title:`${color} / ${size}`,options:[{name:"Color",value:color},{name:"Size",value:size}],price:info.prices[i-1],currency:"USD",tracked:true,quantity:userId==="tenant-a"?7:4,inventoryPolicy:"DENY",availableForSale:true,requiresComponents:false,verifiedAt:new Date(),providerUpdatedAt:new Date(),generation:"fixture"});
  }
 }
 const commerce=createCommerceStore(f.database,fixtureInventoryRequest(f.database));
 let missingPolicy=false;
 const intelligence=createShoppingIntelligence({model,knowledge:async id=>({instructions:"Prefer supported customer suitability over soft preferred tags. Never claim higher price proves quality.",evidence:missingPolicy?[]:[{id:"returns",text:merchant[id as keyof typeof merchant].policy}]})});
 function conversation(userId:"tenant-a"|"tenant-b",locale="en"){
  let state:ShoppingState|null=null,event=0;
  const sessions:ShoppingSessionStore={withTurn:async(_turn,run)=>run(state,async next=>{state=next;})};
  const service=createShoppingService({commerce,sessions,intelligence,settings:async()=>shoppingSettings({enabled:true,maxRecommendations:3}),entitled:async()=>true});
  return {state:()=>state,service,sessions,turn:async(text:string,extra={})=>{await inventoryDue(f.database,sources[userId]);return service.turn({userId,conversationId:`${userId}-${locale}`,eventId:`event${++event}`,text,channel:"webchat",locale,...extra});}};
 }
 return {...f,merchant,sources,commerce,intelligence,conversation,missingPolicy:(v:boolean)=>{missingPolicy=v;}};
}

// Routing/evidence stub, deliberately NOT evidence of model answer quality.
export const fixtureShoppingModel:ShoppingModel=async(system,input:any)=>{
 if(system.includes("shopping interpreter")){
  const text=input.text.toLowerCase(),previous=input.saved;
  const references=/first.*third|primero.*tercero|הראשון.*השלישי/u.test(text)?[1,3]:/second|segund|השני/u.test(text)?[2]:/first|primer|הראשון/u.test(text)?[1]:[];
  const policy=/return|devol|החזר/u.test(text);
  const optionValues=/blue|azul|כחול/u.test(text)?["Blue"]:/black|negro|שחור/u.test(text)?["Black"]:[];
  const relativeSize=/smaller|peque|קטנה|קטן/u.test(text)?"smaller":null;
  const action=optionValues.length||relativeSize?"variant":/compar|difference|lighter|better|why|השו|קל יותר|מתחיל/u.test(text)&&previous?"compare":previous&&/under|hasta|מתחת|lightweight|ligero|קל משקל|expensive|caro|יקר/u.test(text)?"refine":"search";
  return {action,query:previous?.query??(/snowboard|tabla|סנובורד/u.test(text)?"Snowboard":"Moisturizer"),references,optionValues,relativeSize,preference:previous?.preference??input.text,moreExpensive:/expensive|caro|יקר/u.test(text),policy};
 }
 const ranked=input.choices.map((_:unknown,i:number)=>i+1).sort((a:number,b:number)=>Number(!input.choices[a-1].productTitle.endsWith(" 1"))-Number(!input.choices[b-1].productTitle.endsWith(" 1")));
 const variantIds=input.variants.filter((v:any)=>v.productId===(input.choices[input.plan.references.length?0:0]?.productId)&&Array.isArray(v.options)&&v.options.some((o:any)=>input.plan.relativeSize?o.name==="Size"&&o.value==="S":o.name==="Color"&&o.value===input.plan.optionValues[0])).map((v:any)=>v.id);
 return {ranked,reasons:input.choices.map((_:unknown,i:number)=>({choice:i+1,evidenceIds:input.facts.filter((f:any)=>f.choice===i+1).map((f:any)=>f.id).slice(0,3)})),policyIds:input.plan.policy?input.business.map((b:any)=>b.id):[],missing:/rating|calificacion|דירוג/u.test(input.text)||input.plan.policy&&!input.business.length,variantIds};
};
