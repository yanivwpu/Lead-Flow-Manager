import { and, desc, eq } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { aiSettings, messages } from "@shared/schema";
import { shoppingSettings, shoppingCopy, shoppingLocale } from "@shared/shoppingAssistant";
import { salesCatalog } from "../salesCatalog";
import { subscriptionService } from "../subscriptionService";
import { createShoppingService } from "./service";
import { createShoppingSessions } from "./sessions";
export async function shoppingEntitled(userId:string) {
 const limits=await subscriptionService.getUserLimits(userId);
 return !!limits?.growthEngineEligible && !!limits?.effectiveHasAIBrain;
}
export async function readShoppingSettings(userId:string) {
 const [row]=await db.select({config:aiSettings.shoppingAssistant}).from(aiSettings).where(eq(aiSettings.userId,userId)).limit(1);
 return shoppingSettings(row?.config);
}
export const shoppingAssistant=createShoppingService({commerce:salesCatalog.commerce,sessions:createShoppingSessions(db),settings:readShoppingSettings,entitled:shoppingEntitled});
/** Uses the persisted latest inbound as authority, never caller history or model IDs. No send API. */
export async function shoppingSuggestion(input:{userId:string;conversationId:string;text:string;channel?:string|null;locale?:string}) {
 let config;
 try {config=await readShoppingSettings(input.userId);} catch {return null;}
 if(!config.enabled||!input.channel||!config.allowedChannels.includes(input.channel as any))return null;
 try {
  const [inbound]=await db.select({id:messages.id,content:messages.content}).from(messages).where(and(eq(messages.userId,input.userId),eq(messages.conversationId,input.conversationId),eq(messages.direction,"inbound"))).orderBy(desc(messages.createdAt),desc(messages.id)).limit(1);
  if(!inbound||inbound.content!==input.text) return null;
  return await shoppingAssistant.turn({...input,channel:input.channel,eventId:inbound.id});
 } catch {
  // Once shopping is enabled, do not let a failed commerce operation fall through to creative generation.
  return {reply:shoppingCopy[shoppingLocale(input.locale)].unavailable,handoff:true};
 }
}
