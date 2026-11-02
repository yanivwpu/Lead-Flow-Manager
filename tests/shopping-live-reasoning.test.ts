import test from "node:test";
import assert from "node:assert/strict";
import { liveReasoningFixture,liveMessages } from "./shopping-live-reasoning-fixture";
import { fixtureShoppingModel } from "./shopping-intelligence-fixture";
import { createShoppingIntelligence,beginnerQualification } from "../server/shopping/intelligence";
import { ShoppingModelFailure,type ShoppingAnswerDiagnostic } from "../server/shopping/diagnostics";

test("production-style partially sparse discovery and exact comparison never enter failed reasoning",async()=>{
 const events:ShoppingAnswerDiagnostic[]=[];
 let answers=0;
 const f=await liveReasoningFixture(async(system,input:any)=>{
  if(!system.includes("shopping interpreter")){answers++;throw Error("private model response must not be logged");}
  const plan:any=await fixtureShoppingModel(system,input);
  if(/option 1 and option 3|opción 1.*opción 3|אפשרות 1.*אפשרות 3/u.test(input.text))return {...plan,action:"compare",references:[1,3],preference:null};
  return plan;
 },e=>events.push(e));
 try {for(const locale of ["en","es","he"] as const){
  const c=f.conversation("tenant-a",locale);
  const initial=(await c.turn(liveMessages[locale][0]))!;
  assert.equal(initial.state.choices.length,3,initial.reply);
  assert.match(initial.reply,/Multi-location/);assert.match(initial.reply,/Multi-managed/);assert.match(initial.reply,/Hydrogen/);
  assert.doesNotMatch(initial.reply,/finish evaluating|does not establish|no permite confirmar|אינו מבסס/);
  const saved=initial.state.choices.map(c=>c.variantId);
  const compared=(await c.turn(liveMessages[locale][1]))!;
  assert.match(compared.reply,/729.95/);assert.match(compared.reply,/600/);
  assert.match(compared.reply,/beginner suitability|principiantes|למתחילים/);
  assert.match(compared.reply,/store team|equipo de la tienda|צוות החנות/);
  assert.doesNotMatch(compared.reply,/finish evaluating|How do you plan|budget|¿Cómo|מה התקציב/);
  assert.equal((compared.reply.match(/\?/g)??[]).length,0);
  assert.equal(beginnerQualification(compared.state.preference??""),true);
  assert.deepEqual(compared.state.choices.map(c=>c.variantId),saved);
  assert.equal(compared.state.maxPrice,"750");
 }
 assert.equal(answers,0,"catalog listing and known merchant evidence gaps need no answer-model call");
 assert.ok(events.some(e=>e.outcome==="catalog_only"));assert.ok(events.some(e=>e.outcome==="insufficient_evidence"));
 assert.ok(events.every(e=>e.outcome!=="failure"));
 }finally{await f.cleanup();}
});

test("provider, JSON, schema, evidence, render and knowledge diagnostics are distinct and contain no private content",async()=>{
 const f=await liveReasoningFixture(fixtureShoppingModel);
 try {
  const c=f.conversation("tenant-a");await c.turn(liveMessages.en[0]);
  const state=c.state()!;
  const products=await f.commerce.products!("tenant-a",f.sources["tenant-a"],state.choices.map(c=>c.productId),{},true);
  const events:ShoppingAnswerDiagnostic[]=[];
  const valid={ranked:[1,2],reasons:[],policyIds:[],missing:true,variantIds:[]};
  const base={turn:{userId:"tenant-a",conversationId:"c",eventId:"e",channel:"webchat",text:"Compare these products private customer"},state,plan:{action:"compare" as const,query:null,references:[],optionValues:[],relativeSize:null,preference:null,moreExpensive:false,policy:false},products,choices:state.choices.slice(0,2)};
  for(const stage of ["provider","json","schema","evidence","render"] as const) {
   const smart=createShoppingIntelligence({knowledge:async()=>({instructions:"private merchant knowledge",evidence:[]}),diagnostic:e=>events.push(e),model:async()=>{
    if(stage==="provider")throw Error("private provider credential");
    if(stage==="json")throw new ShoppingModelFailure("json");
    if(stage==="schema")return {private:"raw private model response"};
    if(stage==="evidence")return {...valid,reasons:[{choice:1,evidenceIds:["private foreign citation"]}]};
    return valid;
   }});
   const result=await smart.answer({...base,choices:stage==="render"?base.choices.map(c=>({...c,price:null as any})):base.choices});
   assert.equal(events.at(-1)?.stage,stage);assert.equal(events.at(-1)?.outcome,"failure");
   assert.match(result.text,/couldn't finish evaluating/);
  }
  const nullModel=createShoppingIntelligence({knowledge:async()=>({instructions:"",evidence:[]}),diagnostic:e=>events.push(e),model:async()=>null});
  await nullModel.answer(base);assert.equal(events.at(-1)?.stage,"schema");
  const smart=createShoppingIntelligence({knowledge:async()=>{throw Error("private knowledge");},diagnostic:e=>events.push(e),model:async()=>valid});
  await smart.answer(base);assert.ok(events.some(e=>e.stage==="knowledge"));
  assert.doesNotMatch(JSON.stringify(events),/private|tenant-a|customer|credential|citation/);
  assert.ok(events.every(e=>Object.keys(e).every(k=>["event","outcome","stage","action","locale","choices","facts","policyFacts"].includes(k))));
 }finally{await f.cleanup();}
});

test("Shopping runtime classifies malformed JSON and limits, and suppresses provider message logging",async()=>{
 const { shoppingModel }=await import("../server/shopping/intelligenceRuntime");
 const { aiProvider,AIProvider }=await import("../server/aiProvider");
 const original=aiProvider.complete;
 try {
  aiProvider.complete=async()=>"private malformed response";
  await assert.rejects(shoppingModel("answer",{}),e=>e instanceof ShoppingModelFailure&&e.stage==="json");
  aiProvider.complete=async()=>"x".repeat(16_001);
  await assert.rejects(shoppingModel("answer",{}),e=>e instanceof ShoppingModelFailure&&e.stage==="output_limit");
  await assert.rejects(shoppingModel("answer",{private:"x".repeat(65_000)}),e=>e instanceof ShoppingModelFailure&&e.stage==="input_limit");
 }finally{aiProvider.complete=original;}
 const provider=new AIProvider();
 (provider as any).ensureOpenAiKey=()=>{};
 (provider as any).openaiClient={chat:{completions:{create:async()=>{throw Error("private provider credential and customer message");}}}};
 const logged:unknown[]=[];const log=console.error;
 try {
  console.error=(...args)=>{logged.push(args);};
  await assert.rejects(provider.complete("reply",[],{logErrors:false}));
  assert.deepEqual(logged,[]);
 }finally{console.error=log;}
});

test("labeled numeric references preserve comparisons and policies without treating budgets as selections",async()=>{
 const { shoppingEmbeddedChoiceNumbers }=await import("../shared/shoppingAssistant");
 const { shoppingBusinessQuestion }=await import("../shared/shoppingBusinessRouting");
 for(const text of ["Compare option 1 and option 3. Can I return it?","Compare option 1 and 3. Can I return it?","Compara la opción 1 y 3. ¿Cuál es la política de devoluciones?","השוו בין אפשרות 1 ו-3. מה מדיניות ההחזרות?","Compara la opción 1 y la opción 3. ¿Cuál es la política de devoluciones?","השוו בין אפשרות 1 ואפשרות 3. מה מדיניות ההחזרות?"]){
  assert.deepEqual(shoppingEmbeddedChoiceNumbers(text),[1,3]);assert.equal(shoppingBusinessQuestion(text),false);
 }
 assert.deepEqual(shoppingEmbeddedChoiceNumbers("I weigh 180 pounds and want a snowboard under $750"),[]);
 const f=await liveReasoningFixture(fixtureShoppingModel);
 try{
  const c=f.conversation("tenant-a");await c.turn(liveMessages.en[0]);
  const policy=(await c.turn(liveMessages.en[3]))!;
  assert.match(policy.reply,/14 days/);assert.match(policy.reply,/729.95/);assert.match(policy.reply,/600/);
  const before=policy.state.choices.map(c=>c.variantId);
  const invalid=(await c.turn("Compare option 1 and option 99"))!;
  assert.deepEqual(invalid.state.choices.map(c=>c.variantId),before);assert.equal(invalid.state.selected,undefined);
  await c.turn(liveMessages.en[1]);
  const changed=(await c.turn("Actually I am an experienced rider. Show me snowboard options."))!;
  assert.equal(beginnerQualification(changed.state.preference??""),false);
 }finally{await f.cleanup();}
});


test("Codex review: feature refinements rank evidence and negated experience retains beginner qualification",async()=>{
 for(const text of ["I'm a beginner, not an experienced rider","Soy principiante, no experto","אני מתחיל ולא מנוסה"])assert.equal(beginnerQualification(text),true,text);
 assert.equal(beginnerQualification("Not suitable for beginners."),false);
 const f=await liveReasoningFixture(fixtureShoppingModel);
 try {
  const c=f.conversation("tenant-a");await c.turn(liveMessages.en[0]);
  const state={...c.state()!,preference:"fragrance free"};
  const products=(await f.commerce.products!("tenant-a",f.sources["tenant-a"],state.choices.slice(0,2).map(c=>c.productId),{},true)).map((p,i)=>({...p,description:i===0?"Fragranced.":"Fragrance free."}));
  let called=false;
  const smart=createShoppingIntelligence({knowledge:async()=>({instructions:"",evidence:[]}),model:async()=>{called=true;return {ranked:[2,1],reasons:[{choice:2,evidenceIds:["c2f0"]}],policyIds:[],missing:false,variantIds:[]};}});
  const result=await smart.answer({turn:{userId:"tenant-a",conversationId:"c",eventId:"e",channel:"webchat",text:"I need fragrance free moisturizer"},state,plan:{action:"refine",query:null,references:[],optionValues:[],relativeSize:null,preference:"fragrance free",moreExpensive:false,policy:false},products,choices:state.choices.slice(0,2)});
  assert.equal(called,true);assert.deepEqual(result.ranked,[2,1]);assert.match(result.text,/Fragrance free/);
 }finally{await f.cleanup();}
});
