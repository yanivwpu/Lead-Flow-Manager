import { and, desc, eq } from "drizzle-orm";
import { conversations, messages, activityEvents, contacts } from "@shared/schema";
import { readConversationAiControl } from "@shared/webchatAiPolicy";
import { isConversationHandoffActive } from "@shared/handoffActivity";
import type { CatalogDb } from "../salesCatalog/commerceStore";
import type { ShoppingState } from "@shared/shoppingAssistant";
import type { ShoppingSessionStore, ShoppingTurn } from "./service";
/** Short DB transactions fence a lease around external catalog calls. No outbound sender. */
export function createShoppingSessions(database:CatalogDb):ShoppingSessionStore {
 async function owned(tx:any,turn:ShoppingTurn) {
  const [conv]=await tx.select().from(conversations).where(and(eq(conversations.id,turn.conversationId),eq(conversations.userId,turn.userId))).for("update").limit(1);
  if(!conv || conv.channel!==turn.channel || ["closed","resolved"].includes(conv.status))return null;
  const [contact]=await tx.select().from(contacts).where(and(eq(contacts.id,conv.contactId),eq(contacts.userId,turn.userId))).limit(1);
  if(!contact||contact.automationsPaused||readConversationAiControl(conv.aiControl).paused)return null;
  const events=await tx.select({eventType:activityEvents.eventType,conversationId:activityEvents.conversationId}).from(activityEvents).where(and(eq(activityEvents.userId,turn.userId),eq(activityEvents.contactId,conv.contactId))).orderBy(desc(activityEvents.createdAt)).limit(120);
  if(isConversationHandoffActive(events,conv.id))return null;
  const [inbound]=await tx.select().from(messages).where(and(eq(messages.userId,turn.userId),eq(messages.conversationId,conv.id),eq(messages.contactId,conv.contactId),eq(messages.direction,"inbound"))).orderBy(desc(messages.createdAt),desc(messages.id)).limit(1);
  return inbound?.id===turn.eventId&&inbound.content===turn.text&&inbound.contentType==="text"?conv:null;
 }
 return {async withTurn(turn,run) {
  const token=crypto.randomUUID();
  const claim=await database.transaction(async tx=>{
   const conv=await owned(tx,turn);if(!conv)return null;
   const raw=conv.shoppingState as any;
   if(raw?._lease?.until>Date.now())throw Error("shopping_busy");
   const state=raw?.version===1&&Array.isArray(raw.choices)&&Array.isArray(raw.consumedEventIds)?raw as ShoppingState:null;
   await tx.update(conversations).set({shoppingState:{...raw,_lease:{token,until:Date.now()+120_000}}}).where(and(eq(conversations.id,conv.id),eq(conversations.userId,turn.userId)));
   return {state};
  });
  if(!claim)return null;
  let next:ShoppingState|undefined;
  try {
   const result=await run(claim.state,async s=>{next=s;});
   if(!next)return result;
   await database.transaction(async tx=>{
    const conv=await owned(tx,turn);
    if(!conv||(conv.shoppingState as any)?._lease?.token!==token||(conv.shoppingState as any)?._lease?.until<Date.now())throw Error("shopping_turn_superseded");
    await tx.update(conversations).set({shoppingState:next,updatedAt:new Date()}).where(and(eq(conversations.id,conv.id),eq(conversations.userId,turn.userId)));
    await tx.insert(activityEvents).values({userId:turn.userId,contactId:conv.contactId,conversationId:conv.id,eventType:"shopping_activity",actorType:"system",eventData:{intent:next!.intent,step:next!.step,recommendedProducts:next!.choices.map(c=>({productId:c.productId,variantId:c.variantId})),selectedVariantId:next!.selected?.variantId??null,quantity:next!.quantity,checkoutCreated:false}});
    if(next!.step==="handoff"&&claim.state?.step!=="handoff")await tx.insert(activityEvents).values({userId:turn.userId,contactId:conv.contactId,conversationId:conv.id,eventType:"ai_handoff",actorType:"system",eventData:{reason:"shopping_assistance",shoppingIntent:next!.intent}});
   });
   return result;
  } finally {
   await database.transaction(async tx=>{
    const [conv]=await tx.select({state:conversations.shoppingState}).from(conversations).where(and(eq(conversations.id,turn.conversationId),eq(conversations.userId,turn.userId))).for("update").limit(1);
    const raw=conv?.state as any;
    if(raw?._lease?.token===token) {
     const {_lease,...rest}=raw;
     await tx.update(conversations).set({shoppingState:rest}).where(and(eq(conversations.id,turn.conversationId),eq(conversations.userId,turn.userId)));
    }
   });
  }
 }};
}
