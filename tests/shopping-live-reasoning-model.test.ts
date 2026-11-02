import test from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { liveReasoningFixture,liveMessages } from "./shopping-live-reasoning-fixture";
import { beginnerQualification } from "../server/shopping/intelligence";
import type { ShoppingAnswerDiagnostic } from "../server/shopping/diagnostics";

test("actual AI Brain partial-sparse, documented and independent merchant conversations EN/ES/HE",{skip:process.env.RUN_SHOPPING_MODEL_ACCEPTANCE!=="1",timeout:600_000},async()=>{
 const { shoppingModel }=await import("../server/shopping/intelligenceRuntime");
 const diagnostics:ShoppingAnswerDiagnostic[]=[];
 const records:Array<Record<string,unknown>>=[];
 const f=await liveReasoningFixture(async(system,input:any)=>{
  const output=await shoppingModel(system,input);records.push({phase:system.includes("shopping interpreter")?"plan":"answer",text:input.text,output});return output;
 },e=>diagnostics.push(e));
 try {
  for(const locale of ["en","es","he"] as const){
   const c=f.conversation("tenant-a",locale);
   const first=(await c.turn(liveMessages[locale][0]))!;
   records.push({kind:"sparse",locale,text:liveMessages[locale][0],reply:first?.reply});
   assert.ok(first?.modelGenerationSucceeded);
   assert.equal(first.state.choices.length,3,first.reply);
   assert.doesNotMatch(first.reply,/finish evaluating|does not establish|no permite confirmar|אינו מבסס/);
   const saved=first.state.choices.map(c=>c.variantId);
   const second=(await c.turn(liveMessages[locale][1]))!;
   records.push({kind:"sparse",locale,text:liveMessages[locale][1],reply:second?.reply});
   assert.ok(second?.modelGenerationSucceeded);
   assert.match(second.reply,/729.95/);assert.match(second.reply,/600/);
   assert.match(second.reply,/beginner suitability|principiantes|למתחילים/);
   assert.match(second.reply,/store team|equipo de la tienda|צוות החנות/);
   assert.doesNotMatch(second.reply,/finish evaluating|strongest match|How do you plan/);
   assert.equal((second.reply.match(/\?/g)??[]).length,0);
   assert.equal(beginnerQualification(second.state.preference??""),true);
   assert.equal(second.state.maxPrice,"750");assert.deepEqual(second.state.choices.map(c=>c.variantId),saved);
   // Repeat the same need without repeating beginner or budget.
   const followup={en:"Compare option 1 and option 3 again. Which would you recommend for me?",es:"Compara la opción 1 y la opción 3 otra vez. ¿Cuál me recomiendas?",he:"השוו שוב בין אפשרות 1 ואפשרות 3. מה מומלץ לי?"}[locale];
   const third=(await c.turn(followup))!;records.push({kind:"sparse",locale,text:followup,reply:third?.reply});
   assert.equal(beginnerQualification(third.state.preference??""),true);
   assert.match(third.reply,/beginner suitability|principiantes|למתחילים/);
   assert.ok((third.reply.match(/\?/g)??[]).length<=1);
   const policy=(await c.turn(liveMessages[locale][3]))!;records.push({kind:"sparse",locale,text:liveMessages[locale][3],reply:policy?.reply});
   assert.match(policy.reply,/14 days/);assert.doesNotMatch(policy.reply,/7 days|skincare/);
  }
  await f.documented();
  for(const userId of ["tenant-a","tenant-b"] as const)for(const locale of ["en","es","he"] as const){
   const c=f.conversation(userId,locale);
   const initial=userId==="tenant-a"?liveMessages[locale][0]:{en:"I have dry skin and want a moisturizer under $50. What would you recommend?",es:"Tengo piel seca y busco moisturizer hasta $50. ¿Qué recomiendas?",he:"יש לי עור יבש ומחפש moisturizer מתחת $50. מה מומלץ?"}[locale];
   const first=(await c.turn(initial))!;records.push({kind:"documented",userId,locale,text:initial,reply:first?.reply});
   assert.ok(first?.modelGenerationSucceeded);assert.ok(first.state.choices.length>=2);
   assert.ok(first.state.choices.every(c=>c.productId.startsWith(userId)));
   const comparison=userId==="tenant-a"?{en:"Compare option 1 and option 2. Which is lighter, and which would you recommend for a beginner?",es:"Compara la opción 1 y la opción 2. ¿Cuál pesa menos y cuál recomiendas para un principiante?",he:"השוו בין אפשרות 1 ואפשרות 2. מי קל יותר ומה מומלץ למתחיל?"}[locale]:{en:"Compare option 1 and option 2. What are the ingredient differences, and can I return it?",es:"Compara la opción 1 y la opción 2. ¿Qué ingredientes tienen y puedo devolverlo?",he:"השוו בין אפשרות 1 ואפשרות 2. מה ההבדל במרכיבים ומה מדיניות ההחזרות?"}[locale];
   const second=(await c.turn(comparison))!;records.push({kind:"documented",userId,locale,text:comparison,reply:second?.reply});
   assert.ok(second?.modelGenerationSucceeded);
   assert.match(second.reply,userId==="tenant-a"?/2\.4 kg/:/glycerin/);
   if(userId==="tenant-a")assert.match(second.reply,/strongest match|mejor coincidencia|ההתאמה המובילה/);
   if(userId==="tenant-b"){assert.match(second.reply,/7 days/);assert.doesNotMatch(second.reply,/14 days|Snowboard|Hydrogen/);}
   assert.doesNotMatch(second.reply,/finish evaluating/);
  }
  assert.ok(diagnostics.some(e=>e.outcome==="catalog_only"));assert.ok(diagnostics.some(e=>e.outcome==="insufficient_evidence"));assert.ok(diagnostics.some(e=>e.outcome==="grounded"));
  assert.ok(diagnostics.every(e=>e.outcome!=="failure"),JSON.stringify(diagnostics.filter(e=>e.outcome==="failure")));
 }finally{
  if(process.env.SHOPPING_ACCEPTANCE_REPORT)await writeFile(process.env.SHOPPING_ACCEPTANCE_REPORT,JSON.stringify({records,diagnostics},null,2));
  await f.cleanup();
 }
});
