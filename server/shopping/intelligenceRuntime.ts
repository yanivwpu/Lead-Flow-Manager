import { aiProvider } from "../aiProvider";
import { storage } from "../storage";
import { buildTurnGrounding } from "../websiteKnowledge/factContext";
import { createShoppingIntelligence, type ShoppingKnowledge, type ShoppingModel } from "./intelligence";
import type { AiBusinessKnowledge } from "@shared/schema";
import { resolveAiRouting, routingShouldTriggerHandoff } from "@shared/aiRouting";
import { extractWebsiteKnowledgeSummaryText } from "../websiteKnowledgeSummaryNormalize";

export const shoppingModel: ShoppingModel = async (system, input) => {
  const serialized=JSON.stringify(input);
  if(serialized.length>64_000)throw Error("shopping_model_input_limit");
  const response = await aiProvider.complete(system.includes("shopping interpreter") ? "extraction" : "reply", [
    { role: "system", content: system },
    { role: "user", content: serialized },
  ], { jsonMode: true, maxTokens: 1600, timeoutMs: 10_000 });
  const content = typeof response === "string" ? response : response.content;
  if (content.length > 16_000) throw Error("shopping_model_output_limit");
  return JSON.parse(content);
};

/** Reuse AI Brain's owned row and published-fact retrieval. Published V2 facts
 * are authoritative; stale/conflicted facts cannot become a fresh policy quote.
 * Instructions influence style/ranking but are never themselves policy facts. */
export async function shoppingKnowledge(userId: string, text: string, row?: AiBusinessKnowledge): Promise<ShoppingKnowledge> {
  const knowledge = row ?? await storage.getAiBusinessKnowledge(userId);
  if (!knowledge || knowledge.userId !== userId) return { instructions: "", evidence: [] };
  const evidence: ShoppingKnowledge["evidence"] = [];
  if (knowledge.knowledgeV2Enabled) {
    const grounded = await buildTurnGrounding({ userId, message: text, knowledgeRow: knowledge, freshnessPolicyRaw: knowledge.knowledgeFreshnessPolicy });
    for (const entry of grounded.retrieved) {
      if (entry.fact.userId !== userId || entry.freshness.tier !== "fresh" || grounded.conflictingKeys.includes(entry.fact.factKey)) continue;
      if(!["policy","faq","business_hours","location","service_area","contact_method"].includes(entry.fact.factType))continue;
      evidence.push({ id: `fact:${entry.fact.id}`, text: JSON.stringify(entry.fact.data) });
    }
  } else {
    // Existing explicit merchant FAQ answers and website knowledge are V1's
    // factual sources. Never fall back to platform facts or other workspaces.
    if (Array.isArray(knowledge.faqs)) for (const [i, faq] of knowledge.faqs.slice(0, 15).entries()) {
      if (faq && typeof faq === "object" && typeof faq.answer === "string")
        evidence.push({ id: `faq:${i}`, text: `${typeof faq.question === "string" ? faq.question : ""}: ${faq.answer}` });
    }
    if (knowledge.websiteKnowledgeSummary) {
      const chunks=extractWebsiteKnowledgeSummaryText(knowledge.websiteKnowledgeSummary).split(/(?<=[.!?])\s+|\n/u).filter(s=>/\b(?:returns?|shipping|delivery|warranty|devoluciones|env[ií]os?|garant[ií]a)\b|החזרות|משלוח|אחריות/iu.test(s));
      chunks.slice(0,10).forEach((text,i)=>evidence.push({id:`website:${i}`,text}));
    }
    if(knowledge.businessHours)evidence.push({id:"hours",text:knowledge.businessHours});
    if(knowledge.locations)evidence.push({id:"locations",text:knowledge.locations});
    // Legacy merchants also keep explicit policy declarations in instructions.
    // Reuse only declarative policy sentences, never operational model commands.
    const policySentences=(knowledge.customInstructions??"").split(/(?<=[.!?])\s+|\n/u).filter(s=>
      /\b(?:returns?|shipping|delivery|warranty|devoluciones|envios?|garantia)\b|החזרות|משלוח|אחריות/iu.test(s) &&
      !/\b(?:always|never|ignore|instructions?|assistant|prompt|system|must|should)\b|תמיד|לעולם|הוראות/iu.test(s));
    policySentences.slice(0,4).forEach((text,i)=>evidence.push({id:`merchant-policy:${i}`,text}));
  }
  return { instructions: [knowledge.customInstructions, knowledge.salesGoals].filter(Boolean).join("\n"), evidence:evidence.filter(e=>
    !/\b(?:stock|inventory|sku|product price|precio del producto|inventario)\b|מלאי|מחיר המוצר/iu.test(e.text) &&
    (!/[$€£₪]|\b(?:USD|EUR|ILS|GBP)\b/iu.test(e.text)||/\b(?:shipping|delivery|env[ií]os?)\b|משלוח/iu.test(e.text))) };
}

export const shoppingIntelligence = createShoppingIntelligence({ model: shoppingModel, knowledge: shoppingKnowledge });
export async function shoppingHandoffRequested(userId:string,text:string) {
  const config=await storage.getAiSettings(userId);
  return routingShouldTriggerHandoff(resolveAiRouting({inbound:text,handoffKeywords:config?.handoffKeywords??undefined}));
}
