import type { createCommerceStore } from "../salesCatalog/commerceStore";
import type { ShoppingChoice, ShoppingState, ShoppingSettings } from "@shared/shoppingAssistant";
import { shoppingIntent, shoppingFilters, matchShoppingChoice, compareMoney, shoppingCopy, shoppingLocale } from "@shared/shoppingAssistant";
export type CommerceShoppingProvider = Pick<ReturnType<typeof createCommerceStore>, "source"|"purchaseCandidates"|"verifyForPurchase"|"lookupVariant">;
export type ShoppingTurn = {userId:string; conversationId:string; eventId:string; text:string; channel:string; locale?:string};
export type ShoppingResult = {reply:string; state:ShoppingState; handoff:boolean};
export interface ShoppingSessionStore {
  // Must serialize per owned conversation, verify persisted inbound and commit state atomically.
  withTurn<T>(turn:ShoppingTurn, run:(state:ShoppingState|null, save:(next:ShoppingState)=>Promise<void>)=>Promise<T>):Promise<T|null>;
}
const SESSION_MS=30*60_000;
const REPLAY_MS=60_000;
function safeLabel(s:string) { return s.replace(/https?:\/\/\S+/gi,"").replace(/[\r\n\u0000-\u001f]/g," ").slice(0,180); }
function line(c:ShoppingChoice) {return `${safeLabel(c.productTitle)} / ${safeLabel(c.variantTitle)} — ${c.currency} ${c.price}`;}
function options(raw:unknown):ShoppingChoice["options"] {return Array.isArray(raw)?raw.filter(o=>typeof o?.name==="string"&&typeof o?.value==="string").map(o=>({name:o.name,value:o.value})):[];}
export function createShoppingService(deps:{commerce:CommerceShoppingProvider; sessions:ShoppingSessionStore; settings:(userId:string)=>Promise<ShoppingSettings>; entitled:(userId:string)=>Promise<boolean>; now?:()=>number}) {
 const now=deps.now??Date.now;
 return { async turn(turn:ShoppingTurn):Promise<ShoppingResult|null> {
  const config=await deps.settings(turn.userId);
  if(!config.enabled || !config.allowedChannels.includes(turn.channel as any) || !await deps.entitled(turn.userId)) return null;
  return deps.sessions.withTurn(turn,async(stored,save)=>{
   const copy=shoppingCopy[shoppingLocale(turn.locale)], stamp=now();
   const intent=shoppingIntent(turn.text);
   const expired=stored && (stamp-new Date(stored.updatedAt).getTime()>SESSION_MS || !Number.isFinite(new Date(stored.updatedAt).getTime()));
   const source=await deps.commerce.source(turn.userId);
   if(!source) return null;
   if(stored?.sourceId===source.id && stored?.consumedEventIds.includes(turn.eventId)) {
    // Never replay an older turn or a stock claim beyond its short response lifetime.
    const reply=stored.lastEventId===turn.eventId && stamp-new Date(stored.updatedAt).getTime()<REPLAY_MS ? stored.reply:copy.unavailable;
    return {reply,state:stored,handoff:stored.step==="handoff"};
   }
   if(!stored && intent==="other") return null;
   const previous=!expired && stored?.sourceId===source.id?stored:null;
   let state:ShoppingState=previous?{...previous,choices:[...previous.choices]}:{version:1,sourceId:source.id,step:"discovering",intent,choices:[],quantity:1,updatedAt:new Date(stamp).toISOString(),lastEventId:turn.eventId,reply:"",consumedEventIds:[]};
   async function finish(reply:string, step=state.step):Promise<ShoppingResult> {
    state={...state,step,intent,reply,lastEventId:turn.eventId,updatedAt:new Date(stamp).toISOString(),consumedEventIds:[...(stored?.consumedEventIds??[]),turn.eventId].slice(-50)};
    await save(state); return {reply,state,handoff:step==="handoff"};
   }
   async function unavailable() {
    state.selected=undefined; state.choices=[];
    return finish(copy.unavailable,config.handoffOnFailure?"handoff":"discovering");
   }
   if(intent==="cancel"||intent==="restart") {state.choices=[];state.selected=undefined;state.quantity=1;state.query=undefined;state.maxPrice=undefined;state.minPrice=undefined;return finish(intent==="cancel"?copy.cancel:copy.clarify,intent==="cancel"?"cancelled":"discovering");}
   if(intent==="handoff"||intent==="order") {state.selected=undefined;state.choices=[];return finish(intent==="order"?copy.order:copy.handoff,"handoff");}
   // A handoff is sticky until a human resumes shopping or the customer restarts.
   if(previous?.step==="handoff") return finish(copy.handoff,"handoff");
   if(!source.currency) return unavailable();
   const filters=shoppingFilters(turn.text,source.currency);
   if(filters.currency!==source.currency) return finish(copy.currency,"discovering");
   const quantity=turn.text.match(/(?:quantity|cantidad|כמות)\s*[:=]?\s*(\d+)/iu);
   if(quantity) {
    const n=Number(quantity[1]);
    if(!Number.isSafeInteger(n)||n<1||n>99) return unavailable();
    state.quantity=n;
   }
   const chosen=quantity?undefined:matchShoppingChoice(turn.text,state.choices);
   const selection=chosen??((intent==="confirm"||quantity)?state.selected:undefined);
   if(selection) {
    const live=await deps.commerce.verifyForPurchase(turn.userId,source.id,[selection.variantId]);
    const v=live.find(v=>v.variant.id===selection.variantId && v.product.id===selection.productId);
    if(!v || !["available","not_tracked"].includes(v.availability) || !v.product.published || v.product.status!=="ACTIVE" || v.variant.currency!==source.currency || v.variant.price===null ||
      !Number.isFinite(new Date(v.variant.verifiedAt).getTime()) || stamp-new Date(v.variant.verifiedAt).getTime()>REPLAY_MS ||
      (v.variant.tracked && v.variant.inventoryPolicy!=="CONTINUE" && (v.variant.quantity===null || v.variant.quantity<state.quantity))) return unavailable();
    const current:ShoppingChoice={productId:v.product.id,variantId:v.variant.id,productTitle:v.product.title,variantTitle:v.variant.title,options:options(v.variant.options),price:v.variant.price,currency:v.variant.currency,verifiedAt:new Date(v.variant.verifiedAt).toISOString()};
    const changed=compareMoney(current.price,selection.price)!==0 || JSON.stringify(current.options)!==JSON.stringify(selection.options) || current.variantTitle!==selection.variantTitle;
    state.selected=current;state.choices=state.choices.map(c=>c.variantId===current.variantId?current:c);state.currency=current.currency;
    if(changed) return finish(`${copy.changed}\n${line(current)} × ${state.quantity}`,"confirming");
    if(intent==="confirm" && previous?.step==="confirming" && !chosen && !quantity) return finish(copy.disabled,"confirmed");
    return finish(`${line(current)} × ${state.quantity}\n${copy.confirm}`,"confirming");
   }
   if(intent==="confirm" && !state.query) return finish(copy.options,"selecting");
   // Variant/availability follow-ups reuse the last discovery query; never use a model ID.
   const query=["variants","availability","confirm","compare"].includes(intent) && state.query?state.query:filters.query;
   if(!query) return finish(copy.clarify,"discovering");
   if(intent==="search" || intent==="select" || !state.query) {state.maxPrice=filters.maxPrice;state.minPrice=filters.minPrice;}
   state.query=query;state.currency=source.currency;state.selected=undefined;state.quantity=1;
   const products=await deps.commerce.purchaseCandidates(turn.userId,{sourceId:source.id,query,limit:8,filters:{currency:source.currency,...(state.maxPrice?{maxPrice:state.maxPrice}:{}),...(state.minPrice?{minPrice:state.minPrice}:{})}});
   const candidates=products.flatMap(p=>p.variants.map(v=>({p,v}))).slice(0,8);
   const live=await deps.commerce.verifyForPurchase(turn.userId,source.id,candidates.map(c=>c.v.id));
   state.choices=live.filter(v=>candidates.some(c=>c.v.id===v.variant.id&&c.p.id===v.product.id) &&
     ["available","not_tracked"].includes(v.availability) && v.product.published && v.product.status==="ACTIVE" &&
     v.variant.currency===source.currency && v.variant.price!==null && Number.isFinite(new Date(v.variant.verifiedAt).getTime()) &&
     stamp-new Date(v.variant.verifiedAt).getTime()<=REPLAY_MS &&
     (!state.maxPrice || compareMoney(v.variant.price,state.maxPrice)<=0) && (!state.minPrice || compareMoney(v.variant.price,state.minPrice)>=0))
    .slice(0,config.maxRecommendations).map(v=>({productId:v.product.id,variantId:v.variant.id,productTitle:v.product.title,variantTitle:v.variant.title,options:options(v.variant.options),price:v.variant.price!,currency:v.variant.currency!,verifiedAt:new Date(v.variant.verifiedAt).toISOString()}));
   if(!state.choices.length) return unavailable();
   return finish(state.choices.map((c,i)=>`${i+1}. ${line(c)}`).join("\n")+`\n${copy.choose}`,"selecting");
  });
 }};
}
