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
   assert.equal(initial.state.choices[0]?.productId,`${userId}-p1`,initial.reply);
   assert.ok(initial.state.choices.length>=2,initial.reply);
   assert.match(initial.reply,userId==="tenant-a"?/Designed for beginners/:/Formulated for dry skin/);
   assert.doesNotMatch(initial.reply,/cures|treats|guaranteed/iu);
   const compared=(await turn(messages[locale][1]))!;
   assert.match(compared.reply,userId==="tenant-a"?/2\.4 kg/:/glycerin/);
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
