import { and, desc, eq } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { aiSettings, messages } from "@shared/schema";
import { shoppingSettings } from "@shared/shoppingAssistant";
import { salesCatalog } from "../salesCatalog";
import { subscriptionService } from "../subscriptionService";
import { createShoppingService } from "./service";
import { createShoppingSessions } from "./sessions";
import { createShoppingSuggestion } from "./suggestion";
import { CHECKOUT_ROLLOUT_APPROVED } from "./checkout/authorization";
import { createCheckoutHandoff } from "./checkout/handoff";
import { checkoutReceiptCodec } from "./checkout/attempts";
import { CheckoutError } from "./checkout/contract";
export async function shoppingEntitled(userId:string) {
 const limits=await subscriptionService.getUserLimits(userId);
 return !!limits?.growthEngineEligible && !!limits?.effectiveHasAIBrain;
}
export async function readShoppingSettings(userId:string) {
 const [row]=await db.select({config:aiSettings.shoppingAssistant}).from(aiSettings).where(eq(aiSettings.userId,userId)).limit(1);
 return shoppingSettings(row?.config);
}
const checkout=createCheckoutHandoff({database:db,commerce:salesCatalog.commerce,approved:()=>CHECKOUT_ROLLOUT_APPROVED,settings:readShoppingSettings,entitled:shoppingEntitled,codec:()=>{
 const encoded=process.env.SHOPPING_CHECKOUT_RECEIPT_KEY??"";
 if(!/^[A-Za-z0-9+/]{43}=$/.test(encoded))throw new CheckoutError("setup_required");
 return checkoutReceiptCodec(Buffer.from(encoded,"base64"));
}});
export const shoppingAssistant=createShoppingService({commerce:salesCatalog.commerce,sessions:createShoppingSessions(db),settings:readShoppingSettings,entitled:shoppingEntitled,checkout});
export const shoppingSuggestion=createShoppingSuggestion({
 settings:readShoppingSettings,
 latestInbound:async(userId,conversationId)=>{
  const [inbound]=await db.select({id:messages.id,content:messages.content}).from(messages).where(and(eq(messages.userId,userId),eq(messages.conversationId,conversationId),eq(messages.direction,"inbound"))).orderBy(desc(messages.createdAt),desc(messages.id)).limit(1);
  return inbound;
 },
 turn:turn=>shoppingAssistant.turn(turn),
});
