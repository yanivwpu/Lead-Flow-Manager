import { catalogSearchTerms } from "@shared/commerceCatalog";
import { shoppingBusinessQuestion, mixedShoppingBusinessQuestion } from "@shared/shoppingBusinessRouting";
import { allowedVariantChange, requestedShoppingOptions, excludedShoppingProduct, intelligenceCopy, type ShoppingIntelligence, type ShoppingPlan } from "./intelligence";
import type { CommerceProduct } from "@shared/commerceCatalog";
import type { createCommerceStore } from "../salesCatalog/commerceStore";
import type { ShoppingChoice, ShoppingState, ShoppingSettings } from "@shared/shoppingAssistant";
import { shoppingIntent, shoppingFilters, shoppingChoiceNumber, matchShoppingChoice, compareMoney, shoppingCopy, shoppingLocale, shoppingVerificationFollowup, shoppingCheaperFollowup } from "@shared/shoppingAssistant";
export type CommerceShoppingProvider = Pick<ReturnType<typeof createCommerceStore>, "source"|"purchaseCandidates"|"verifyForPurchase"|"lookupVariant"> & Partial<Pick<ReturnType<typeof createCommerceStore>, "products"|"variantPage"|"recommendationVocabulary">>;
export type ShoppingTurn = {userId:string; conversationId:string; eventId:string; text:string; channel:string; locale?:string};
export type ShoppingResult = {reply:string; state:ShoppingState; handoff:boolean; modelGenerationSucceeded?:boolean; intelligenceReview?:boolean};
export type ShoppingTurnGuard = { token: string; check: () => Promise<void> };
export type ShoppingInventory = Awaited<ReturnType<CommerceShoppingProvider["verifyForPurchase"]>>[number];
export type ShoppingCheckout = ((turn: ShoppingTurn, state: ShoppingState, guard?: ShoppingTurnGuard, inventory?: ShoppingInventory) => Promise<{url?: string; requestKey?:string; installationId?:string; status: NonNullable<ShoppingState["checkout"]>["status"]}>) & { replay?:(turn:ShoppingTurn,state:ShoppingState,guard?:ShoppingTurnGuard)=>Promise<string|undefined> };
export interface ShoppingSessionStore {
  // Must serialize per owned conversation, verify persisted inbound and commit state atomically.
  withTurn<T>(turn:ShoppingTurn, run:(state:ShoppingState|null, save:(next:ShoppingState)=>Promise<void>, guard?:ShoppingTurnGuard)=>Promise<T>):Promise<T|null>;
}
const SESSION_MS=30*60_000;
const REPLAY_MS=60_000;
function safeLabel(s:string) { return s.replace(/https?:\/\/\S+/gi,"").replace(/[\r\n\u0000-\u001f]/g," ").slice(0,180); }
function line(c:ShoppingChoice) {return `${safeLabel(c.productTitle)} / ${safeLabel(c.variantTitle)} — ${c.currency} ${c.price}`;}
function inventoryProof(v:ShoppingInventory): Pick<ShoppingChoice,"inventoryQuantity"> {
 return v.variant.tracked === true && Number.isSafeInteger(v.variant.quantity) && v.variant.quantity! >= 0
   ? {inventoryQuantity:v.variant.quantity!} : {};
}
function stockNote(c:ShoppingChoice,template:string) {return c.inventoryQuantity===undefined?"":`\n${template.replace("{quantity}",String(c.inventoryQuantity))}`;}
function options(raw:unknown):ShoppingChoice["options"] {return Array.isArray(raw)?raw.filter(o=>typeof o?.name==="string"&&typeof o?.value==="string").map(o=>({name:o.name,value:o.value})):[];}
export function createShoppingService(deps:{commerce:CommerceShoppingProvider; sessions:ShoppingSessionStore; settings:(userId:string)=>Promise<ShoppingSettings>; entitled:(userId:string)=>Promise<boolean>; checkout?: ShoppingCheckout; checkoutPreview?: boolean; catalogTitleDiscovery?: boolean; intelligence?: ShoppingIntelligence; handoffRequested?:(userId:string,text:string)=>Promise<boolean>; now?:()=>number}) {
 const now=deps.now??Date.now;
 return { async turn(turn:ShoppingTurn):Promise<ShoppingResult|null> {
  const config=await deps.settings(turn.userId);
  if(!config.enabled || !config.allowedChannels.includes(turn.channel as any) || !await deps.entitled(turn.userId)) return null;
  // Delegate before the state machine can consume a policy question or mistake
  // Hebrew shipping/returns for an order handoff. Preserve the saved selection.
  const businessQuestion=shoppingBusinessQuestion(turn.text);
  return deps.sessions.withTurn(turn,async(stored,save,guard)=>{
   // A supported explicit named selection must still be resolved against this
   // owned conversation's choices before a policy clause can delegate the turn.
   if(businessQuestion && !(shoppingIntent(turn.text)==="select" && matchShoppingChoice(turn.text,stored?.choices??[]))) return null;
   const copy=shoppingCopy[shoppingLocale(turn.locale)], stamp=now();
   const numberedSelection=shoppingChoiceNumber(turn.text);
   const verificationFollowup=shoppingVerificationFollowup(turn.text,stored?.selected);
   const cheaper=shoppingCheaperFollowup(turn.text);
   let requestedIntent=cheaper?"search":verificationFollowup?"availability":shoppingIntent(turn.text);
   const retryTurn=!!stored && (requestedIntent==="retry" || (!!stored.pending && stored.lastEventId===turn.eventId));
   let intent=retryTurn ? stored?.pending?.action==="confirm"?"confirm":stored?.pending?.action==="select"||(!stored?.pending&&stored?.selected)?"select":"search" : requestedIntent;
   const expired=stored && (stamp-new Date(stored.updatedAt).getTime()>SESSION_MS || !Number.isFinite(new Date(stored.updatedAt).getTime()));
   const source=await deps.commerce.source(turn.userId);
   if(!source) return null;
   if(!expired && stored?.sourceId===source.id && stored.pending && stored.lastEventId===turn.eventId) {
    return {reply:copy.pending,state:stored,handoff:false};
   }
   if(!expired && stored?.sourceId===source.id && stored?.consumedEventIds.includes(turn.eventId)) {
    if(config.checkoutEnabled && stored.checkout?.status==="ready" && stored.lastEventId===turn.eventId && stamp-new Date(stored.updatedAt).getTime()<REPLAY_MS && deps.checkout?.replay) {
     const url=await deps.checkout.replay(turn,stored,guard);
     return {reply:url?`${copy.checkoutReady}\n${url}`:copy.checkoutPending,state:stored,handoff:false};
    }
    // Never replay an older turn or a stock claim beyond its short response lifetime.
    const reply=stored.lastEventId===turn.eventId && stamp-new Date(stored.updatedAt).getTime()<REPLAY_MS ? stored.reply:copy.busy;
    return {reply,state:stored,handoff:stored.step==="handoff",intelligenceReview:stored.intelligenceReview??false,modelGenerationSucceeded:false};
   }
   const ownedPrevious=!expired && stored?.sourceId===source.id ? stored : null;
   if(await deps.handoffRequested?.(turn.userId,turn.text)) {intent="handoff";requestedIntent="handoff";}
   // Never spend model calls on replays, explicit purchase controls, or handoffs.
   // Interpretation cannot create a selection, confirmation or checkout action.
   const controlled=["cancel","restart","handoff","confirm","retry"].includes(requestedIntent) ||
     requestedIntent==="order" && !mixedShoppingBusinessQuestion(turn.text) ||
     requestedIntent==="select" && !!matchShoppingChoice(turn.text,ownedPrevious?.choices??[]) ||
     shoppingChoiceNumber(turn.text)!==undefined || !!turn.text.match(/(?:quantity|cantidad|כמות)\s*[:=]?\s*\d+/iu);
   let plan:ShoppingPlan|null=null;
   if(deps.intelligence && (requestedIntent!=="other" || !!ownedPrevious?.query) && !controlled && !cheaper && !verificationFollowup && ownedPrevious?.step!=="handoff") {
    let vocabulary:string[]=[];
    if((!ownedPrevious?.query || requestedIntent==="search") && deps.commerce.recommendationVocabulary)try{vocabulary=await deps.commerce.recommendationVocabulary(turn.userId,source.id);}catch{/* deterministic fallback remains available */}
    plan=await deps.intelligence.plan(turn,ownedPrevious,vocabulary);
    if(plan) {intent=plan.action==="variant"?"variants":plan.action==="compare"?"compare":plan.action==="search"||plan.action==="refine"?"search":"other";requestedIntent=intent;}
   }
   let titleProducts:Awaited<ReturnType<CommerceShoppingProvider["purchaseCandidates"]>>|undefined;
   if(!stored && intent==="other" && !plan) {
    // Private transport opt-in only: a bare owned catalog title is a discovery request.
    // Do not rewrite the persisted inbound, broaden arbitrary chat, or replace a saved selection.
    if(!deps.catalogTitleDiscovery || !source.currency || turn.text.trim().length>200)return null;
    const title=(value:string)=>value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();
    const exact=title(turn.text);
    if(!exact)return null;
    titleProducts=(await deps.commerce.purchaseCandidates(turn.userId,{sourceId:source.id,query:turn.text,limit:8,
      filters:{currency:source.currency}})).filter(product=>title(product.title)===exact);
    if(!titleProducts.length)return null;
    intent="search";
   }
   const previous=!expired && stored?.sourceId===source.id
    ? {...stored,step:stored.step==="pending"?(stored.pending?.resumeStep??"discovering"):stored.step}:null;
   let state:ShoppingState=previous?{...previous,choices:[...previous.choices]}:{version:1,sourceId:source.id,step:"discovering",intent,choices:[],quantity:1,updatedAt:new Date(stamp).toISOString(),lastEventId:turn.eventId,reply:"",consumedEventIds:[]};
   if(plan?.action==="search" && plan.query?.toLowerCase()!==state.query?.toLowerCase())state.preference=undefined;
   if(plan?.preference) state.preference=plan.preference;
   let explanation:string|undefined;
   let modelUsed=!!plan;
   const verifiedThisTurn=new Set<string>();
   async function evidenceProducts(ids:string[]) {
    if(!deps.commerce.products)return [];
    try {return (await deps.commerce.products(turn.userId,source!.id,[...new Set(ids)],{},true)).filter(p=>p.userId===turn.userId && p.sourceId===source!.id && p.published && p.status==="ACTIVE" && !excludedShoppingProduct(p));} catch {return [];}
   }
   async function finish(reply:string, step=state.step, preservePending=false):Promise<ShoppingResult> {
    const answerPlan=plan??((businessQuestion||mixedShoppingBusinessQuestion(turn.text))?{action:"compare" as const,query:null,references:[],optionValues:[],relativeSize:null,preference:null,moreExpensive:false,policy:true}:null);
    if(answerPlan?.policy && deps.intelligence && explanation===undefined && ["confirming","selecting"].includes(step)) {
     const choices=(state.selected?[state.selected]:state.choices).filter(c=>verifiedThisTurn.has(c.variantId));
     const result=await deps.intelligence.answer({turn,state,plan:answerPlan,choices,products:await evidenceProducts(choices.map(c=>c.productId))});
     modelUsed=true;
     explanation=result.text;
    }
    if(explanation)reply+=`\n${explanation}`;
    // Existing bubbles use dir=auto. Lead Hebrew reasoning with Hebrew so an
    // English catalog title cannot force the entire answer into LTR layout.
    if(shoppingLocale(turn.locale)==="he" && !/^[\u0590-\u05ff]/u.test(reply.trim()))reply=`${intelligenceCopy.he.evidence}\n${reply}`;
    state={...state,intelligenceReview:modelUsed,pending:preservePending?state.pending:undefined,step,intent:state.checkout&&step==="confirmed"?"confirm":intent,reply,lastEventId:turn.eventId,updatedAt:new Date(stamp).toISOString(),consumedEventIds:[...(stored?.consumedEventIds??[]),turn.eventId].slice(-50)};
    await save(state); return {reply,state,handoff:step==="handoff",modelGenerationSucceeded:modelUsed,intelligenceReview:modelUsed};
   }
   async function checkout(inventory:ShoppingInventory): Promise<ShoppingResult> {
    if (!config.checkoutEnabled || !deps.checkout) return finish(copy.disabled,"confirmed");
    const confirmationId = state.checkout?.confirmationId ?? previous?.lastEventId ?? turn.eventId;
    state={...state,step:"confirmed",intent:"confirm",lastEventId:turn.eventId,updatedAt:new Date(stamp).toISOString(),consumedEventIds:[...state.consumedEventIds,turn.eventId].slice(-50),checkout:{confirmationId,status:"pending",createdAt:state.checkout?.createdAt??new Date(stamp).toISOString()}};
    const result = await deps.checkout(turn,state,guard,inventory);
    state.checkout={...state.checkout!,status:result.status,...(result.requestKey?{requestKey:result.requestKey,installationId:result.installationId}:{})};
    const text = deps.checkoutPreview ? copy.checkoutPreview : result.status === "changed" ? copy.changed : result.status === "ready" ? copy.checkoutReady : result.status === "pending" ? copy.checkoutPending : copy.checkoutFallback;
    // Receipts/URLs stay in the encrypted journal. Cached shopping state and activities contain only status.
    const finished = await finish(text, result.status === "changed" ? "confirming" : !["ready","pending"].includes(result.status) && config.handoffOnFailure ? "handoff" : "confirmed");
    return {...finished,reply:result.url ? `${text}\n${result.url}` : text};
   }
   function clarify(reply:string) {
    // A clarification must not discard an outstanding exact-variant verification.
    return finish(reply,previous && stored?.pending?"pending":state.step,true);
   }
   async function pending(action:"discover"|"select"|"confirm"):Promise<ShoppingResult> {
    if(state.checkout)state.checkout={...state.checkout,status:"pending"};
    // Empty live results cannot distinguish rate limits, leases and provider outages from missing data.
    // Keep the chosen IDs/quantity and budget, without treating snapshots as newly verified.
    const resumeStep=state.step==="pending"?(state.pending?.resumeStep??"discovering"):state.step;
    state={...state,step:"pending",pending:{action,resumeStep},intent,reply:copy.pending,lastEventId:turn.eventId,updatedAt:new Date(stamp).toISOString()};
    await save(state);return {reply:copy.pending,state,handoff:false,modelGenerationSucceeded:!!plan,intelligenceReview:!!plan};
   }
   async function verify(ids:string[]) {
    try {
     const live=await deps.commerce.verifyForPurchase(turn.userId,source!.id,ids);
     for(const v of live)if(freshChoice(v))verifiedThisTurn.add(v.variant.id);
     return live;
    } catch {return [];}
   }
   async function unavailable() {
    state.checkout=undefined;state.selected=undefined; state.choices=[];
    return finish(copy.unavailable,config.handoffOnFailure?"handoff":"discovering");
   }
   if(intent==="cancel"||intent==="restart") {state.checkout=undefined;state.choices=[];state.selected=undefined;state.quantity=1;state.query=undefined;state.maxPrice=undefined;state.minPrice=undefined;state.cheaperThan=undefined;state.dearerThan=undefined;state.preference=undefined;return finish(intent==="cancel"?copy.cancel:copy.clarify,intent==="cancel"?"cancelled":"discovering");}
   if(intent==="handoff"||intent==="order") {state.checkout=undefined;state.selected=undefined;state.choices=[];return finish(intent==="order"?copy.order:copy.handoff,"handoff");}
   // A handoff is sticky until a human resumes shopping or the customer restarts.
   if(previous?.step==="handoff") return finish(copy.handoff,"handoff");
   const filters=shoppingFilters(turn.text,source.currency??"");
   const hasProductQuery=!!catalogSearchTerms(filters.query);
   if(expired && stored?.lastEventId===turn.eventId) return finish(copy.repeatSearch,"discovering");
   // Follow-ups need the offered list from this source and an unexpired session.
   // Never turn an orphaned list reference (including a bare number) into a catalog query.
   const needsPriorSearch=cheaper || ["confirm","retry"].includes(requestedIntent) || (["variants","availability","compare"].includes(requestedIntent) && !hasProductQuery);
   if(!previous && (numberedSelection!==undefined || needsPriorSearch)) return finish(copy.repeatSearch,"discovering");
   if(verificationFollowup && !previous) return finish(copy.repeatSearch,"discovering");
   if(numberedSelection!==undefined && !state.choices[numberedSelection-1]) return clarify(state.choices.length?copy.options:copy.repeatSearch);
   if(!source.currency) return pending(state.selected?"select":"discover");
   if((cheaper || state.cheaperThan || state.dearerThan || plan && previous || previous && state.currency) && state.currency!==source.currency) {
    state={...state,choices:[],selected:undefined,checkout:undefined,query:undefined,maxPrice:undefined,minPrice:undefined,cheaperThan:undefined,dearerThan:undefined,quantity:1,currency:source.currency};
    return finish(`${copy.currency}\n${copy.repeatSearch}`,"discovering");
   }
   if(filters.currency!==source.currency) return finish(copy.currency,"discovering");
   const smartCopy=intelligenceCopy[shoppingLocale(turn.locale)];
   if(plan?.action==="clarify")return clarify(smartCopy.clarify);
   function freshChoice(v:ShoppingInventory):ShoppingChoice|undefined {
    if(!["available","not_tracked"].includes(v.availability) || !v.product.published || v.product.status!=="ACTIVE" ||
      v.variant.currency!==source!.currency || v.variant.price===null ||
      !Number.isFinite(new Date(v.variant.verifiedAt).getTime()) || now()-new Date(v.variant.verifiedAt).getTime()>REPLAY_MS ||
      (v.variant.tracked && v.variant.inventoryPolicy!=="CONTINUE" && (v.variant.quantity===null || v.variant.quantity<state.quantity)) ||
      (state.maxPrice && compareMoney(v.variant.price,state.maxPrice)>0) || (state.minPrice && compareMoney(v.variant.price,state.minPrice)<0)) return undefined;
    return {productId:v.product.id,variantId:v.variant.id,productTitle:v.product.title,variantTitle:v.variant.title,options:options(v.variant.options),price:v.variant.price,currency:v.variant.currency!,verifiedAt:new Date(v.variant.verifiedAt).toISOString(),...inventoryProof(v)};
   }
   if(plan && deps.intelligence && ["compare","variant"].includes(plan.action)) {
    const references=plan.references.length ? plan.references.map(n=>state.choices[n-1]) : plan.action==="variant" ? state.selected?[state.selected]:[] : state.choices;
    if(!references.length || references.some(c=>!c))return clarify(smartCopy.clarify);
    const products=await evidenceProducts(references.map(c=>c.productId));
    if(plan.action==="compare") {
     const live=await verify(references.map(c=>c.variantId));
     const choices=references.flatMap(c=>{const v=live.find(v=>v.variant.id===c.variantId && v.product.id===c.productId);const choice=v&&freshChoice(v);return choice?[choice]:[];});
     if(choices.length!==references.length)return clarify(copy.pending);
     const result=await deps.intelligence.answer({turn,state,plan,products,choices});
     explanation=result.text;
     // Comparing never reorders saved ordinals or silently changes a selection.
     return finish(choices.map(c=>line(c)).join("\n"));
    }
    if(new Set(references.map(c=>c.productId)).size!==1)return clarify(smartCopy.clarify);
    const product=products.find(p=>p.id===references[0].productId);
    if(!product)return clarify(smartCopy.noVariant);
    // A bounded page includes out-of-stock variants as candidates for resolution;
    // stock/price claims still require the existing live verifier afterwards.
    if(deps.commerce.variantPage) {
     try {
      const page=await deps.commerce.variantPage(turn.userId,source.id,product.id);
      if(page)product.variants=page.items;
     } catch {return clarify(smartCopy.noVariant);}
    }
    plan.optionValues=requestedShoppingOptions(turn.text,product.variants.flatMap(v=>options(v.options).map(o=>o.value)),plan.relativeSize);
    // Exact saved options and comparable relative sizes resolve deterministically.
    // A model nomination cannot substitute a different color or discard size.
    const result=plan.policy?await deps.intelligence.answer({turn,state,plan,products:[product],choices:references}):{text:""};
    const candidates=product.variants.filter(v=>allowedVariantChange(references[0],v,plan!.optionValues,plan!.relativeSize));
    if(!candidates.length)return clarify(`${smartCopy.noVariant}${plan.policy?`\n${result.text}`:""}`);
    const live=await verify(candidates.slice(0,8).map(v=>v.id));
    const choices=live.flatMap(v=>{const c=v.product.id===product.id&&candidates.some(c=>c.id===v.variant.id)&&freshChoice(v);return c?[c]:[];});
    if(!choices.length)return clarify(copy.pending);
    state.checkout=undefined;
    // Informational variant questions preserve the selected variant, but offer
    // verified alternatives for an explicit subsequent choice/confirmation.
    state.choices=choices;
    explanation=plan.policy?result.text:undefined;
    return finish(`${smartCopy.variant}\n${choices.map((c,i)=>`${i+1}. ${line(c)}${stockNote(c,copy.verifiedStock)}`).join("\n")}\n${copy.choose}`,state.selected?"confirming":"selecting");
   }
   // A request to verify "that exact variant" is not permission to pick one.
   // Preserve the offered list until the customer explicitly chooses an option.
   if(verificationFollowup && !state.selected && state.choices.length) return clarify(copy.chooseBeforeVerify);
   const quantity=turn.text.match(/(?:quantity|cantidad|כמות)\s*[:=]?\s*(\d+)/iu);
   if(quantity) {
    const n=Number(quantity[1]);
    if(!Number.isSafeInteger(n)||n<1||n>99) return unavailable();
    state.quantity=n;
   }
   const chosen=quantity || intent==="search"?undefined:matchShoppingChoice(turn.text,state.choices);
   const selection=chosen??((verificationFollowup||intent==="confirm"||quantity||(retryTurn && (stored?.pending?stored.pending.action==="select":!!state.selected)))?state.selected:undefined);
   if(selection) {
    if(chosen || quantity || verificationFollowup) state.checkout=undefined;
    state.selected=selection;
    const live=await verify([selection.variantId]);
    if(!live.length) return pending(intent==="confirm"?"confirm":"select");
    const v=live.find(v=>v.variant.id===selection.variantId && v.product.id===selection.productId);
    if(!v) return pending(intent==="confirm"?"confirm":"select");
    if(["unknown","stale"].includes(v.availability) || v.variant.price===null ||
      !Number.isFinite(new Date(v.variant.verifiedAt).getTime()) || stamp-new Date(v.variant.verifiedAt).getTime()>REPLAY_MS ||
      (v.variant.tracked && v.variant.inventoryPolicy!=="CONTINUE" && v.variant.quantity===null)) return pending(intent==="confirm"?"confirm":"select");
    if(!["available","not_tracked"].includes(v.availability) || !v.product.published || v.product.status!=="ACTIVE" || v.variant.currency!==source.currency || v.variant.price===null ||
      !Number.isFinite(new Date(v.variant.verifiedAt).getTime()) || stamp-new Date(v.variant.verifiedAt).getTime()>REPLAY_MS ||
      (v.variant.tracked && v.variant.inventoryPolicy!=="CONTINUE" && (v.variant.quantity===null || v.variant.quantity<state.quantity))) return unavailable();
    const current:ShoppingChoice={productId:v.product.id,variantId:v.variant.id,productTitle:v.product.title,variantTitle:v.variant.title,options:options(v.variant.options),price:v.variant.price,currency:v.variant.currency,verifiedAt:new Date(v.variant.verifiedAt).toISOString(),...inventoryProof(v)};
    const changed=current.currency!==selection.currency || compareMoney(current.price,selection.price)!==0 || JSON.stringify(current.options)!==JSON.stringify(selection.options) || current.variantTitle!==selection.variantTitle;
    state.selected=current;state.choices=state.choices.map(c=>c.variantId===current.variantId?current:c);state.currency=current.currency;
    if(changed) {state.checkout=undefined;return finish(`${copy.changed}\n${line(current)} × ${state.quantity}${stockNote(current,copy.verifiedStock)}`,"confirming");}
    if((intent==="confirm" && ["confirming","confirmed"].includes(previous?.step??"") || retryTurn && previous?.step==="confirmed" && !!state.checkout) && !chosen && !quantity) return checkout(v);
    return finish(`${line(current)} × ${state.quantity}${stockNote(current,copy.verifiedStock)}\n${copy.confirm}`,"confirming");
   }
   if(intent==="confirm" && !state.query) return clarify(copy.repeatSearch);
   // A failed follow-up classification must not erase an explicit selection.
   // Only an explicit new search (or the cancel/restart paths above) may return
   // to discovery; uncertain follow-ups require clarification, not re-selection.
   if(state.selected && intent!=="search") return clarify(copy.selectedRetained);
   // An unrecognized selection or contextual reply cannot replace the search/filters.
   // An initial product purchase request can still start discovery.
   if((intent==="select" && !!previous?.choices.length) || intent==="other") return clarify(state.choices.length?copy.options:copy.repeatSearch);
   if(["variants","availability","compare"].includes(intent) && !state.query && !hasProductQuery) return clarify(copy.repeatSearch);
   // Variant/availability follow-ups reuse the last discovery query; never use a model ID.
   const query=plan?.action==="refine" && state.query?state.query:plan?.query || ((cheaper || retryTurn || ["variants","availability","confirm","compare"].includes(intent)) && state.query?state.query:filters.query || state.query);
   if(!query || !catalogSearchTerms(query)) return clarify(copy.repeatSearch);
   if(!retryTurn && (filters.maxPrice || filters.minPrice)) {state.maxPrice=filters.maxPrice;state.minPrice=filters.minPrice;}
   if(cheaper) {
    const reference=state.selected?.price ?? state.choices.reduce<string|undefined>((best,c)=>best===undefined||compareMoney(c.price,best)<0?c.price:best,undefined) ?? state.cheaperThan;
    if(!reference || !state.query) return clarify(copy.repeatSearch);
    state.cheaperThan=reference;
    state.dearerThan=undefined;
   } else if(plan?.moreExpensive) {
    const reference=state.selected?.price ?? state.choices[0]?.price;
    if(!reference)return clarify(smartCopy.clarify);
    state.dearerThan=reference;state.cheaperThan=undefined;
   } else if(intent==="search" && !retryTurn) {state.cheaperThan=undefined;state.dearerThan=undefined;}
   if(intent==="search" && !retryTurn) {state.checkout=undefined;state.choices=[];state.selected=undefined;state.quantity=1;}
   state.query=query;state.currency=source.currency;
   let products;
   try { products=titleProducts??await deps.commerce.purchaseCandidates(turn.userId,{sourceId:source.id,query,limit:8,filters:{currency:source.currency,...(state.maxPrice?{maxPrice:state.maxPrice}:{}),...(state.minPrice?{minPrice:state.minPrice}:{}),...(state.cheaperThan?{priceBelow:state.cheaperThan}:{}),...(state.dearerThan?{priceAbove:state.dearerThan}:{})}}); } catch {return pending("discover");}
   products=products.filter(p=>!excludedShoppingProduct(p));
   // Round-robin products before extra variants so one product's color variants
   // cannot crowd every other model out of the bounded verification batch.
   const candidates=Array.from({length:25},(_,i)=>products.flatMap(p=>p.variants[i]?[{p,v:p.variants[i]}]:[])).flat().slice(0,8);
   if(!candidates.length) return unavailable();
   const live=await verify(candidates.map(c=>c.v.id));
   if(!live.length) return pending("discover");
   const choices=live.filter(v=>candidates.some(c=>c.v.id===v.variant.id&&c.p.id===v.product.id) &&
     ["available","not_tracked"].includes(v.availability) && v.product.published && v.product.status==="ACTIVE" &&
     v.variant.currency===source.currency && v.variant.price!==null && Number.isFinite(new Date(v.variant.verifiedAt).getTime()) &&
     stamp-new Date(v.variant.verifiedAt).getTime()<=REPLAY_MS &&
     (!state.cheaperThan || compareMoney(v.variant.price,state.cheaperThan)<0) &&
     (!state.dearerThan || compareMoney(v.variant.price,state.dearerThan)>0) &&
     (!state.maxPrice || compareMoney(v.variant.price,state.maxPrice)<=0) && (!state.minPrice || compareMoney(v.variant.price,state.minPrice)>=0))
    .slice(0,plan?8:config.maxRecommendations).map(v=>({productId:v.product.id,variantId:v.variant.id,productTitle:v.product.title,variantTitle:v.variant.title,options:options(v.variant.options),price:v.variant.price!,currency:v.variant.currency!,verifiedAt:new Date(v.variant.verifiedAt).toISOString(),...inventoryProof(v)}));
   if(!choices.length) {
    if(live.some(v=>["unknown","stale"].includes(v.availability) || v.variant.price===null || !Number.isFinite(new Date(v.variant.verifiedAt).getTime()) || stamp-new Date(v.variant.verifiedAt).getTime()>REPLAY_MS)) return pending("discover");
    return unavailable();
   }
   state.choices=choices;state.selected=undefined;state.quantity=1;
   if(plan && deps.intelligence) {
    const result=await deps.intelligence.answer({turn,state,plan,products,choices,limit:config.maxRecommendations});
    explanation=result.text;
    state.choices=result.ranked.map(n=>choices[n-1]);
   }
   return finish(state.choices.map((c,i)=>`${i+1}. ${line(c)}${stockNote(c,copy.verifiedStock)}`).join("\n")+`\n${copy.choose}`,"selecting");
  });
 }};
}
