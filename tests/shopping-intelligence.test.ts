import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import * as schema from "../shared/schema";
import { createShoppingIntelligence, allowedVariantChange } from "../server/shopping/intelligence";
import { intelligenceFixture, fixtureShoppingModel } from "./shopping-intelligence-fixture";
import { compareMoney } from "../shared/shoppingAssistant";

const journeys={
 en:["I'm a beginner, weigh 180 pounds and want a snowboard under $750. What would you recommend?","Compare the first and third. Which is lighter?","Do you have the first one in blue, and can I return it?","I'll take the first one","What about a smaller size?","I'll take the first one","What is your return policy?","Compare the first. What are its ratings?","Actually, show me options under $750","I'll take the first one","Show me something cheaper.","I'll take the first one","What is its current price?","I need a human"],
 es:["Busco una tabla de snowboard para principiantes, peso 180 libras y tengo hasta $750. Que recomiendas?","Compara el primero y el tercero. Cual es mas ligero?","Tienes el primero en azul, y puedo devolverlo?","Elijo la primera","Y una talla mas pequena?","Elijo la primera","Cual es la politica de devoluciones?","Compara el primero. Que calificacion tiene?","Muestrame opciones hasta $750","Elijo la primera","Muestrame algo mas barato","Elijo la primera","What is its current price?","Quiero una persona"],
 he:["אני מתחיל במשקל 180 פאונד, מחפש סנובורד מתחת $750. מה מומלץ?","השוו בין הראשון והשלישי. מי קל יותר?","יש את הראשון בכחול, ומה מדיניות ההחזרות?","אקח את הראשון","יש מידה קטנה יותר?","אקח את הראשון","מה מדיניות ההחזרות שלכם?","השוו את הראשון. מה הדירוג?","אפשרויות מתחת $750","אקח את הראשון","יש משהו זול יותר","אקח את הראשון","What is its current price?","אפשר נציג"],
};

test("two native-catalog merchants complete separate fourteen-message EN/ES/HE journeys",async()=>{
 const f=await intelligenceFixture(fixtureShoppingModel);
 try{
  for(const userId of ["tenant-a","tenant-b"] as const)for(const locale of ["en","es","he"] as const){
   const c=f.conversation(userId,locale),category=f.merchant[userId].category;
   const texts=[...journeys[locale]];
   if(userId==="tenant-b"){
    texts[0]=locale==="en"?"I have dry skin. Which moisturizer would you recommend under $50?":locale==="es"?"Tengo piel seca. Busco una crema moisturizer hasta $50. Que recomiendas?":"יש לי עור יבש. מחפש moisturizer מתחת $50. מה מומלץ?";
    texts[8]=texts[8].replace("750","50");
   }
   const initial=(await c.turn(texts[0]))!;
   assert.ok(initial.state.choices.length>=3,initial.reply);
   assert.equal(initial.state.choices[0].productId,`${userId}-p1`);
   assert.match(initial.reply,/Designed for beginners|Formulated for dry skin/);
   assert.ok(initial.state.preference?.length);
   if(locale==="he")assert.match(initial.reply,/^[\u0590-\u05ff]/u,"dir=auto must start with Hebrew before Latin product titles");
   for(const choice of initial.state.choices){assert.ok(choice.productId.startsWith(userId));assert.notEqual(choice.productId,`${userId}-p3`);}
   const order=initial.state.choices.map(c=>c.variantId);
   const compared=(await c.turn(texts[1]))!;
   assert.deepEqual(compared.state.choices.map(c=>c.variantId),order);
   assert.match(compared.reply,/2\.4 kg|glycerin/);
   const mixed=(await c.turn(texts[2]))!;
   assert.match(mixed.reply,new RegExp(f.merchant[userId].policy.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
   assert.doesNotMatch(mixed.reply,userId==="tenant-a"?/skincare/:/boards/);
   assert.ok(mixed.state.choices.every(c=>c.options.some(o=>o.value==="Blue")));
   const chosen=(await c.turn(texts[3]))!;const selected=chosen.state.selected!;
   assert.equal(selected.options.find(o=>o.name==="Size")?.value,"M");
   const smaller=(await c.turn(texts[4]))!;
   assert.equal(smaller.state.selected?.variantId,selected.variantId);
   assert.ok(smaller.state.choices.every(c=>c.options.some(o=>o.value==="S")));
   await c.turn(texts[5]);const before=structuredClone(c.state());
   assert.equal(await c.turn(texts[6]),null);assert.deepEqual(c.state(),before);
   const missing=(await c.turn(texts[7]))!;
   assert.match(missing.reply,/does not establish|no permite confirmar|אינו מבסס/);
   await c.turn(texts[8]);await c.turn(texts[9]);
   const cheaper=(await c.turn(texts[10]))!;
   assert.ok(cheaper.state.choices.every(choice=>compareMoney(choice.price,f.merchant[userId].prices[0])<0));
   assert.equal(cheaper.state.maxPrice,userId==="tenant-a"?"750":"50");
   await c.turn(texts[11]);const variant=c.state()!.selected!.variantId;
   await f.database.update(schema.catalogVariants).set({price:String(Number(c.state()!.selected!.price)+1)}).where(eq(schema.catalogVariants.id,variant));
   const changed=(await c.turn(texts[12]))!;assert.equal(changed.state.step,"confirming");assert.match(changed.reply,/changed|cambiaron|השתנו/);
   const handoff=(await c.turn(texts[13]))!;assert.equal(handoff.handoff,true);
   const interrupted=(await c.turn(texts[0]))!;assert.equal(interrupted.handoff,true);
   assert.ok(interrupted.state.choices.length===0);
   assert.ok(category);
  }
 }finally{await f.cleanup();}
});

test("hard exclusions apply to saved selections and verifier; preference is soft and native filters are strict",async()=>{
 const f=await intelligenceFixture(fixtureShoppingModel);
 try{
  const c=f.conversation("tenant-a");await c.turn(journeys.en[0]);await c.turn("option 1");const selected=c.state()!.selected!;
  await f.database.update(schema.catalogProducts).set({merchantTags:["shopping:exclude"]}).where(eq(schema.catalogProducts.id,selected.productId));
  assert.deepEqual(await f.commerce.verifyForPurchase("tenant-a",f.sources["tenant-a"],[selected.variantId]),[]);
  const result=(await c.turn("yes"))!;assert.equal(result.state.checkout,undefined);
  const products=await f.commerce.purchaseCandidates("tenant-a",{sourceId:f.sources["tenant-a"],query:"Snowboard",limit:8,filters:{currency:"USD",priceAbove:"350",maxPrice:"750"}});
  assert.ok(products.every(p=>p.id!==selected.productId&&p.id!=="tenant-a-p3"));
  assert.ok(products.flatMap(p=>p.variants).every(v=>compareMoney(v.price!,"350")>0));
  assert.equal(await c.turn("show Snowboard",{channel:"whatsapp"}),null);
 }finally{await f.cleanup();}
});

test("context guards preserve variants despite a mistaken search plan; budgets and relative prices remain server-owned",async()=>{
 const f=await intelligenceFixture(fixtureShoppingModel);
 try{
  const c=f.conversation("tenant-a");await c.turn(journeys.en[0]);await c.turn("option 1");
  const badPlan=createShoppingIntelligence({model:async()=>({action:"search",query:"unrelated product",references:[],optionValues:[],relativeSize:null,preference:null,moreExpensive:false,policy:false}),knowledge:async()=>({instructions:"",evidence:[]})});
  const turn={userId:"tenant-a",conversationId:"c",eventId:"e",channel:"webchat",text:"What about a smaller size?"};
  const guarded=await badPlan.plan(turn,c.state());
  assert.equal(guarded?.action,"variant");assert.equal(guarded?.query,"Snowboard");assert.equal(guarded?.relativeSize,"smaller");
  const expensive=(await c.turn("Anything a little more expensive but better?"))!;
  assert.equal(expensive.state.maxPrice,"750");assert.equal(expensive.state.dearerThan,"500");
  assert.ok(expensive.state.choices.every(choice=>compareMoney(choice.price,"500")>0));
  const budget=(await c.turn("Actually, show me options under $500"))!;
  assert.equal(budget.state.query,"Snowboard");assert.equal(budget.state.maxPrice,"500");assert.equal(budget.state.dearerThan,undefined);
  assert.ok(budget.state.choices.every(choice=>compareMoney(choice.price,"500")<=0));
  await c.turn("option 1");const selected=c.state()!.selected!;
  await f.database.update(schema.catalogVariants).set({quantity:0,availableForSale:false}).where(eq(schema.catalogVariants.id,selected.variantId));
  const soldOut=(await c.turn("What is its current price?"))!;
  assert.equal(soldOut.state.selected,undefined);assert.equal(soldOut.state.checkout,undefined);
 }finally{await f.cleanup();}
});

test("malformed or foreign model output is discarded; missing policies and ambiguous references preserve selection",async()=>{
 const f=await intelligenceFixture(fixtureShoppingModel);
 try{
  const c=f.conversation("tenant-a");await c.turn(journeys.en[0]);await c.turn("option 1");const before=c.state()!.selected!.variantId;
  f.missingPolicy(true);const mixed=(await c.turn(journeys.en[2]))!;
  assert.match(mixed.reply,/couldn't establish that policy/);assert.equal(mixed.state.selected?.variantId,before);
  const bad=createShoppingIntelligence({model:async(system,input:any)=>system.includes("shopping interpreter")?{action:"variant",query:null,references:[8],optionValues:["Blue"],relativeSize:null,preference:null,moreExpensive:false,policy:false}:{ranked:[1],reasons:[{choice:1,evidenceIds:["tenant-b-secret"]}],policyIds:["foreign"],missing:false,variantIds:["gid://foreign"]},knowledge:async()=>({instructions:"",evidence:[]})});
  const turn={userId:"tenant-a",conversationId:"c",eventId:"e",channel:"webchat",text:"second in blue"};
  assert.equal((await bad.plan(turn,c.state()))?.action,"clarify");
  const answer=await bad.answer({turn,state:c.state()!,plan:{action:"compare",query:null,references:[1],optionValues:[],relativeSize:null,preference:null,moreExpensive:false,policy:true},products:[],choices:c.state()!.choices});
  assert.match(answer.text,/does not establish/);assert.doesNotMatch(answer.text,/foreign|secret/);
  const modelFailure=createShoppingIntelligence({model:async()=>{throw Error("provider failure")},knowledge:async()=>({instructions:"",evidence:[]})});
  assert.equal(await modelFailure.plan(turn,c.state()),null);
  const current=c.state()!.selected!;
  assert.equal(allowedVariantChange(current,{options:[{name:"Color",value:"Blue"},{name:"Size",value:"S"}]} as any,["Blue"],null),false,"color request cannot also change size");
 }finally{await f.cleanup();}
});
