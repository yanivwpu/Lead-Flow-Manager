import { eq } from "drizzle-orm";
import { catalogProducts, catalogVariants } from "../shared/schema";
import { intelligenceFixture } from "./shopping-intelligence-fixture";
import type { ShoppingModel } from "../server/shopping/intelligence";
import type { ShoppingAnswerDiagnostic } from "../server/shopping/diagnostics";

/** Production-style partial sparsity, not a copy of private merchant records. */
export async function liveReasoningFixture(model:ShoppingModel, diagnostic?:(event:ShoppingAnswerDiagnostic)=>void) {
 const f=await intelligenceFixture(model,false,diagnostic);
 for(const [i,title,price] of [[1,"Multi-location","729.95"],[2,"Multi-managed","700"],[4,"Hydrogen","600"]] as const) {
  const id=`tenant-a-p${i}`;
  await f.database.update(catalogProducts).set({title,description:i===2?"A snowboard from the merchant's current collection.":"",aiGuidance:null,merchantTags:[]}).where(eq(catalogProducts.id,id));
  await f.database.update(catalogVariants).set({price}).where(eq(catalogVariants.productId,id));
 }
 return {...f,documented:async()=>{
  await f.database.update(catalogProducts).set({description:"Designed for beginners. Weight 2.4 kg. Core: wood.",aiGuidance:"Suitable for beginner riders."}).where(eq(catalogProducts.id,"tenant-a-p1"));
  await f.database.update(catalogProducts).set({description:"Designed for experienced riders. Weight 2.8 kg. Core: composite.",aiGuidance:"Suitable for experienced riders."}).where(eq(catalogProducts.id,"tenant-a-p2"));
  await f.database.update(catalogProducts).set({merchantTags:["shopping:exclude"]}).where(eq(catalogProducts.id,"tenant-a-p4"));
  // Independent merchant's own catalog and policy remain unchanged.
 }};
}
export const liveMessages={
 en:["I'm looking for a snowboard under $750. What options do you have?","Compare option 1 and option 3. What are the main differences, and which would you recommend for a beginner?","Which of those is suitable for me?","Compare option 1 and option 3. Can I return it?"],
 es:["Busco un snowboard hasta $750. ¿Qué opciones tienes?","Compara la opción 1 y la opción 3. ¿Cuáles son las diferencias y cuál recomiendas para un principiante?","¿Cuál de esas opciones me conviene?","Compara la opción 1 y la opción 3. ¿Puedo devolverlo?"],
 he:["אני מחפש סנובורד מתחת $750. אילו אפשרויות יש?","השוו בין אפשרות 1 ואפשרות 3. מה ההבדלים ומה מומלץ למתחיל?","איזו מהאפשרויות מתאימה לי?","השוו בין אפשרות 1 ואפשרות 3. מה מדיניות ההחזרות?"]
} as const;
