import test from "node:test";
import assert from "node:assert/strict";
import { intelligenceFixture } from "./shopping-intelligence-fixture";
import { writeFile } from "node:fs/promises";

// Opt-in: real provider calls with synthetic, isolated merchant data only.
// CI executes deterministic journeys; this suite records actual answer evidence.
test("AI Brain model-backed merchant shopping acceptance in EN/ES/HE",{skip:process.env.RUN_SHOPPING_MODEL_ACCEPTANCE!=="1",timeout:600_000},async()=>{
 const { shoppingModel }=await import("../server/shopping/intelligenceRuntime");
 const records:Array<Record<string,unknown>>=[];
 const f=await intelligenceFixture(async(system,input:any)=>{const output=await shoppingModel(system,input);records.push({phase:system.includes("shopping interpreter")?"plan":"answer",text:input.text,output});return output;});
 try{
  for(const userId of ["tenant-a","tenant-b"] as const)for(const locale of ["en","es","he"] as const){
   const c=f.conversation(userId,locale);
   const messages=userId==="tenant-a"?{
    en:["I'm a beginner, weigh 180 pounds and want a snowboard under $750. What would you recommend?","Compare the first and second. Which is lighter?","Do you have the first one in blue, and can I return it?","I'll take the first one","What about a smaller size?"],
    es:["Soy principiante, peso 180 libras y busco una tabla de snowboard hasta $750. Que recomiendas?","Compara el primero y el segundo. Cual pesa menos?","Tienes el primero en azul, y puedo devolverlo?","Elijo la primera","Y una talla mas pequena?"],
    he:["אני מתחיל, שוקל 180 פאונד ומחפש סנובורד מתחת $750. מה מומלץ?","השוו בין הראשון והשני. מי קל יותר?","יש את הראשון בכחול, ומה מדיניות ההחזרות?","אקח את הראשון","יש מידה קטנה יותר?"],
   }:{
    en:["I have dry skin. Which moisturizer would you recommend under $50?","Compare the first and second. What are the ingredient differences?","Do you have the first one in blue, and can I return it?","I'll take the first one","What about a smaller size?"],
    es:["Tengo piel seca. Busco una crema moisturizer hasta $50. Que recomiendas?","Compara el primero y el segundo. Cuales son las diferencias entre sus ingredientes?","Tienes el primero en azul, y puedo devolverlo?","Elijo la primera","Y una talla mas pequena?"],
    he:["יש לי עור יבש. מחפש moisturizer מתחת $50. מה מומלץ?","השוו בין הראשון והשני. מה ההבדל במרכיבים?","יש את הראשון בכחול, ומה מדיניות ההחזרות?","אקח את הראשון","יש מידה קטנה יותר?"],
   };
   const turn=async(text:string)=>{const result=await c.turn(text);records.push({userId,locale,text,reply:result?.reply,choices:result?.state.choices.map(c=>({productId:c.productId,variantId:c.variantId})),selected:result?.state.selected?.variantId,model:result?.modelGenerationSucceeded});return result;};
   const initial=(await turn(messages[locale][0]))!;
   assert.ok(initial.modelGenerationSucceeded,`${userId}/${locale} model interpretation unavailable`);
   assert.ok([`${userId}-p1`,`${userId}-p4`].includes(initial.state.choices[0]?.productId),initial.reply);
   assert.equal(new Set(initial.state.choices.map(c=>c.productId)).size,initial.state.choices.length);
   assert.ok(initial.state.choices.length>=2,initial.reply);
   assert.match(initial.reply,userId==="tenant-a"?/Designed for beginners/:/Formulated for dry skin/);
   assert.doesNotMatch(initial.reply,/cures|treats|guaranteed/iu);
   const compared=(await turn(messages[locale][1]))!;
   if(userId==="tenant-a") {
    const weights:Record<string,string>={"tenant-a-p1":"2.4 kg","tenant-a-p2":"2.8 kg","tenant-a-p4":"3.1 kg"};
    for(const choice of initial.state.choices.slice(0,2)) assert.ok(compared.reply.includes(weights[choice.productId]),compared.reply);
   } else assert.match(compared.reply,/glycerin/);
   const mixed=(await turn(messages[locale][2]))!;
   assert.match(mixed.reply,userId==="tenant-a"?/14 days/:/7 days/);
   assert.ok(mixed.state.choices.some(c=>c.options.some(o=>o.value==="Blue")),mixed.reply);
   const selected=(await turn(messages[locale][3]))!.state.selected!;
   assert.ok(selected);
   const smaller=(await turn(messages[locale][4]))!;
   assert.equal(smaller.state.selected?.variantId,selected.variantId);
   assert.ok(smaller.state.choices.some(c=>c.options.some(o=>o.value==="S")),smaller.reply);
  }
 }finally{
  if(process.env.SHOPPING_ACCEPTANCE_REPORT)await writeFile(process.env.SHOPPING_ACCEPTANCE_REPORT,JSON.stringify(records,null,2));
  await f.cleanup();
 }
});

test("AI Brain sparse snowboard acceptance retains context without invented fit",{skip:process.env.RUN_SHOPPING_MODEL_ACCEPTANCE!=="1",timeout:600_000},async()=>{
 const { shoppingModel }=await import("../server/shopping/intelligenceRuntime");
 const records:Array<Record<string,unknown>>=[];
 const f=await intelligenceFixture(async(system,input:any)=>{const output=await shoppingModel(system,input);records.push({phase:system.includes("shopping interpreter")?"plan":"answer",text:input.text,output});return output;},true);
 try {
  for(const locale of ["en","es","he"] as const) {
   const c=f.conversation("tenant-a",locale);
   const messages={
    en:["I'm a beginner looking for a snowboard under $750.","Compare the first and second. Which is better for me?","Which is lighter, and can I return it?"],
    es:["Soy principiante y busco un snowboard hasta $750.","Compara el primero y el segundo. ¿Cuál me conviene más?","¿Cuál pesa menos y puedo devolverlo?"],
    he:["אני מתחיל ומחפש סנובורד מתחת $750.","השוו בין הראשון והשני. מה מתאים לי יותר?","מי קל יותר ומה מדיניות ההחזרות?"]
   }[locale];
   let saved:string[]=[];
   for(const [i,text] of messages.entries()) {
    const r=(await c.turn(text))!;
    records.push({locale,text,reply:r?.reply,model:r?.modelGenerationSucceeded,choices:r?.state.choices.map(c=>c.productId)});
    assert.ok(r?.modelGenerationSucceeded,JSON.stringify(records.at(-1)));
    assert.ok(r.state.choices.length>=2,r.reply);
    assert.ok(r.state.choices.every(c=>c.productId.startsWith("tenant-a")));
    assert.doesNotMatch(r.reply,/Designed for beginners|strongest match|Formulated|WhachatCRM|2\.4 kg/);
    assert.ok((r.reply.match(/\?/g)??[]).length<=1,r.reply);
    if(i===0)saved=r.state.choices.map(c=>c.variantId);
    else assert.deepEqual(r.state.choices.map(c=>c.variantId),saved);
    if(i===1) {assert.match(r.reply,/USD 500/);assert.match(r.reply,/USD 650/);}
    if(i===2)assert.match(r.reply,/14 days/);
   }
  }
 } finally {
  if(process.env.SHOPPING_ACCEPTANCE_REPORT)await writeFile(process.env.SHOPPING_ACCEPTANCE_REPORT.replace(/\.json$/,"-sparse.json"),JSON.stringify(records,null,2));
  await f.cleanup();
 }
});
