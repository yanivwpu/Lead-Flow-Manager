import { shoppingCopy, shoppingLocale, type ShoppingSettings } from "@shared/shoppingAssistant";
import type { ShoppingResult, ShoppingTurn } from "./service";
export type ShoppingSuggestionInput={userId:string;conversationId:string;text:string;channel?:string|null;locale?:string};
/** Builder prepares the same persisted turn that AI Brain reads. This entry point never sends. */
export function createShoppingSuggestion(deps:{settings:(id:string)=>Promise<ShoppingSettings>;latestInbound:(userId:string,conversationId:string)=>Promise<{id:string;content:string|null}|undefined>;turn:(turn:ShoppingTurn)=>Promise<ShoppingResult|null>}) {
 return async(input:ShoppingSuggestionInput)=>{
  let config;
  try {config=await deps.settings(input.userId);} catch {return null;}
  if(!config.enabled||!input.channel||!config.allowedChannels.includes(input.channel as any))return null;
  try {
   const inbound=await deps.latestInbound(input.userId,input.conversationId);
   if(!inbound||inbound.content!==input.text)return null;
   return await deps.turn({...input,channel:input.channel,eventId:inbound.id});
  } catch {
   // Lease contention/outages must not imply missing stock or force a handoff.
   return {reply:shoppingCopy[shoppingLocale(input.locale)].busy,handoff:false,modelGenerationSucceeded:false,intelligenceReview:false};
  }
 };
}
