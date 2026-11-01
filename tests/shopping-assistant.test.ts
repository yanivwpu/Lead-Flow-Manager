import assert from "node:assert/strict";
import test from "node:test";
import { shoppingIntent, shoppingFilters, compareMoney, shoppingSettingsSchema, shoppingSettings, type ShoppingState, shoppingVerificationFollowup } from "../shared/shoppingAssistant";
import { createShoppingService, type CommerceShoppingProvider, type ShoppingSessionStore } from "../server/shopping/service";
import { catalogSearchTerms } from "../shared/commerceCatalog";
import { detectConversationLanguage } from "../shared/conversationLanguage";

test("selected product nouns resolve only from the persisted selection",()=>{
 const selected={productTitle:"The Collection Snowboard: Liquid"};
 for(const quote of ["'","’"])
  assert.equal(shoppingVerificationFollowup(`Please verify the selected snowboard${quote}s current price and available inventory against Shopify.`,selected),true);
 assert.equal(shoppingVerificationFollowup("Please verify the selected snowboard's current price and available inventory against Shopify."),false);
 assert.equal(shoppingVerificationFollowup("Please verify the selected boot's current price and available inventory against Shopify.",selected),false);
 assert.equal(shoppingVerificationFollowup("Please verify the selected Oxygen's current price and available inventory against Shopify.",selected),false);
});

test("product discovery excludes generic trailing questions without broadening product terms or losing budgets", () => {
 const text="I'm looking for The Collection Snowboard: Liquid. Is it available right now? What's its current price and how many units are in stock? Please verify using Shopify.";
 assert.equal(catalogSearchTerms(shoppingFilters(text,"USD").query),"collection snowboard liquid");
 const budget=shoppingFilters("show Dr. Martens red boots under $749.95. Is it available now?","USD");
 assert.equal(budget.maxPrice,"749.95");
 assert.equal(catalogSearchTerms(budget.query),"dr martens red boots");
 assert.equal(shoppingFilters("show snowboard. Is it available under $750?","USD").maxPrice,"750");
 assert.equal(catalogSearchTerms(shoppingFilters("show Liquid blue medium snowboard","USD").query),"liquid blue medium snowboard");
 assert.equal(catalogSearchTerms(shoppingFilters("show Oxygen snowboard. Compare Liquid snowboard","USD").query),"oxygen snowboard liquid snowboard");
});
function fixture(options:{catalogTitleDiscovery?:boolean}={}) {
 let mode:"live"|"empty"|"throw"|"stale"="live", clock=Date.now();
 let state:ShoppingState|null=null, calls=0, price="699.95", available=true, currency="USD", quantity=5 as number|null, tracked=true, entitled=true, sourceCurrency="USD";
 const config=shoppingSettings({enabled:true,handoffOnFailure:true});
 const product={id:"p1",title:"Snowboard",published:true,status:"ACTIVE",userId:"tenant-a"};
 const variants=[{id:"v1",title:"Ice",options:[{name:"Color",value:"Ice"}]},{id:"v2",title:"Fire",options:[{name:"Color",value:"Fire"}]}];
 const commerce={source:async(id:string)=>id==="tenant-a"?{id:"s1",currency:sourceCurrency}:null,purchaseCandidates:async(_id:string,request:any)=>{assert.equal(request.filters.currency,sourceCurrency);return [{...product,variants}];},lookupVariant:async()=>null,
 verifyForPurchase:async(_u:string,_s:string,ids:string[])=>{calls++;if(mode==="empty")return [];if(mode==="throw")throw Error("provider_unavailable");return variants.filter(v=>ids.includes(v.id)).map(v=>({product,variant:{...v,price,currency,quantity,tracked,inventoryPolicy:"DENY",verifiedAt:new Date(mode==="stale"?clock-120_000:clock)},availability:available?"available":"out_of_stock"}));}} as unknown as CommerceShoppingProvider;
 const sessions:ShoppingSessionStore={async withTurn(turn,run){if(turn.userId!=="tenant-a")return null;return run(state,async s=>{state=s;});}};
 const service=createShoppingService({commerce,sessions,settings:async()=>config,entitled:async()=>entitled,now:()=>clock,...options});
 let event=0;
 return {mode:(m:typeof mode)=>mode=m,advance:(ms:number)=>clock+=ms,service,turn:(text:string,extra={})=>service.turn({userId:"tenant-a",conversationId:"c1",eventId:`e${++event}`,text,channel:"webchat",...extra}),state:()=>state,calls:()=>calls,price:(p:string)=>price=p,available:(a:boolean)=>available=a,currency:(c:string)=>currency=c,sourceCurrency:(c:string)=>sourceCurrency=c,quantity:(n:number|null)=>quantity=n,tracked:(value:boolean)=>tracked=value,config,entitled:(b:boolean)=>entitled=b};
}
test("merchant business questions delegate without changing shopping state, then shopping resumes",async()=>{
 for(const question of ["What is your return policy?", "Do you ship internationally?", "How long does delivery take, and can I return my order?", "Can I use discount codes?", "Do you offer warranties?", "Where is your store located?", "¿Cuál es su política de devoluciones?", "¿Cuánto tarda el envío?", "¿Puedo usar códigos de descuento?", "מה מדיניות ההחזרות שלכם?", "כמה זמן לוקח המשלוח?", "האם יש אחריות?"]) {
  const f=fixture();
  await f.turn("show snowboard under 750");
  await f.turn("option 2");
  const before=structuredClone(f.state()), calls=f.calls();
  assert.equal(await f.turn(question),null,question);
  assert.deepEqual(f.state(),before,question);
  assert.equal(f.calls(),calls,question);
  const resumed=(await f.turn("What is its current price?"))!;
  assert.equal(resumed.state.selected?.variantId,"v2",question);
 }
});
test("ten-turn shopping conversation preserves selection across merchant knowledge detours",async()=>{
 const f=fixture();
 await f.turn("show snowboard under 750");
 await f.turn("I'll take the second option");
 const selected=structuredClone(f.state());
 for(const text of ["What is your return policy?","Do you ship internationally?","Do you offer warranties?","Can I use discount codes?"]) {
  assert.equal(await f.turn(text),null);
  assert.deepEqual(f.state(),selected);
 }
 assert.equal((await f.turn("What is its current price?"))!.state.selected?.variantId,"v2");
 assert.equal((await f.turn("quantity 2"))!.state.quantity,2);
 assert.equal((await f.turn("option 1"))!.state.selected?.variantId,"v1");
 const confirmed=(await f.turn("confirm"))!;
 assert.equal(confirmed.state.step,"confirmed");
 assert.equal(confirmed.state.quantity,2);
 assert.doesNotMatch(confirmed.reply,/https?:/);
});
test("multilingual shopping intent, budget and exact currency/decimal handling",()=>{
 for(const s of ["Show snowboard options","Muéstrame las opciones","אפשרויות של סנובורד"])assert.equal(shoppingIntent(s),"variants");
 for(const s of ["available now?","¿Están disponibles?","האם זמין?"])assert.equal(shoppingIntent(s),"availability");
 for(const s of ["human please","agente por favor","רוצה נציג"])assert.equal(shoppingIntent(s),"handoff");
 assert.equal(shoppingFilters("snowboard under $750","USD").maxPrice,"750");
 assert.equal(shoppingFilters("busco snowboard menos de €750","USD").currency,"EUR");
 assert.equal(shoppingFilters("סנובורד עד ₪750","USD").maxPrice,"750");
 assert.deepEqual(shoppingFilters("snowboard between 100 and 750","USD"),{currency:"USD",minPrice:"100",maxPrice:"750",query:"snowboard"});
 assert.equal(compareMoney("699.950000","699.95"),0);assert.equal(compareMoney("100000000000.01","99999999999.99"),1);
 assert.equal(shoppingSettingsSchema.safeParse({checkoutEnabled:true}).success,true);
});
test("discovery → exact multi-turn variant → explicit confirmation; no checkout URL",async()=>{
 const f=fixture();const discovery=await f.turn("I'm looking for a snowboard under $750");
 assert.match(discovery!.reply,/699.95/);assert.equal(f.calls(),1);assert.equal(discovery!.state.choices.length,2);
 assert.equal((await f.turn("yes"))!.state.step,"selecting");
 const selection=await f.turn("I'll take the Ice version");assert.equal(selection!.state.selected?.variantId,"v1");assert.equal(selection!.state.step,"confirming");
 const confirmation=await f.turn("confirm");assert.equal(confirmation!.state.step,"confirmed");assert.doesNotMatch(confirmation!.reply,/https?:/);
});
test("price changes require a new explicit confirmation; quantity must be available",async()=>{
 const f=fixture();await f.turn("show snowboard");await f.turn("Ice");f.price("710.00");
 const changed=await f.turn("yes");assert.equal(changed!.state.step,"confirming");assert.match(changed!.reply,/changed/);
 assert.equal((await f.turn("yes"))!.state.step,"confirmed");
 f.quantity(1);assert.equal((await f.turn("quantity 3"))!.state.step,"handoff");
});
test("out-of-stock, wrong currency, over-budget live changes and quota failures fail safely",async()=>{
 for(const setup of [(f:ReturnType<typeof fixture>)=>f.available(false),(f:ReturnType<typeof fixture>)=>f.currency("EUR"),(f:ReturnType<typeof fixture>)=>f.price("800")]){
  const f=fixture();setup(f);const r=await f.turn("show snowboard under 750");assert.equal(r!.state.choices.length,0);assert.equal(r!.handoff,true);
 }
 const f=fixture();const c=await f.turn("show snowboard under €750");assert.match(c!.reply,/currency/);assert.equal(f.calls(),0);
});
test("retries do not advance state; invalid IDs cannot become variants; cancel/restart and Pro/channel gating",async()=>{
 const f=fixture();const a=await f.turn("show snowboard",{eventId:"same"});const calls=f.calls();
 assert.equal((await f.turn("show snowboard",{eventId:"same"}))!.reply,a!.reply);assert.equal(f.calls(),calls);
 const invalid=await f.turn("gid://shopify/ProductVariant/foreign");assert.equal(invalid!.state.selected,undefined);
 assert.equal((await f.turn("cancel"))!.state.step,"cancelled");assert.equal((await f.turn("restart"))!.state.step,"discovering");
 f.entitled(false);assert.equal(await f.turn("show snowboard"),null);f.entitled(true);
 assert.equal(await f.turn("show snowboard",{channel:"whatsapp"}),null);
 assert.equal(await f.turn("show snowboard",{userId:"tenant-b"}),null);
 f.config.enabled=false;assert.equal(await f.turn("show snowboard"),null);
});
test("a human request is sticky and multilingual; product instructions never reach a model",async()=>{
 const f=fixture();await f.turn("show snowboard");const r=await f.turn("נציג בבקשה",{locale:"he"});assert.equal(r!.handoff,true);assert.match(r!.reply,/נציג/);
 assert.equal((await f.turn("Ice"))!.state.step,"handoff");
});

test("selections can change without model identifiers or premature checkout",async()=>{
 const f=fixture();await f.turn("show snowboard");await f.turn("Ice");
 const changed=await f.turn("I'll take Fire");assert.equal(changed!.state.selected?.variantId,"v2");assert.equal(changed!.state.step,"confirming");
 await f.turn("restart");const next=await f.turn("compare snowboards",{locale:"es"});assert.equal(next!.state.step,"selecting");
});


test("empty, stale and failed verification keep a recoverable selection; retries cannot silently accept a changed price",async()=>{
 for(const mode of ["empty","throw","stale"] as const){
  const f=fixture();await f.turn("show snowboard under 750");
  f.mode(mode);const pending=await f.turn("Ice",{eventId:"select"});
  assert.equal(pending!.state.step,"pending");assert.equal(pending!.state.selected?.variantId,"v1");assert.equal(pending!.state.choices.length,2);assert.equal(pending!.state.maxPrice,"750");assert.equal(pending!.handoff,false);
  const before=f.calls();f.advance(65_000);
  assert.equal((await f.turn("Ice",{eventId:"select"}))!.reply,pending!.reply);assert.equal(f.calls(),before,"same pending event is prepared only once, even after cooldown");
  f.mode("live");assert.equal((await f.turn("retry"))!.state.step,"confirming");
  f.mode("empty");assert.equal((await f.turn("yes"))!.state.step,"pending");
  f.price("710");f.mode("live");const changed=await f.turn("retry");
  assert.equal(changed!.state.step,"confirming");assert.match(changed!.reply,/changed/);
  assert.equal((await f.turn("yes"))!.state.step,"confirmed");
 }
});
test("a pending discovery retains its budget and supports retry/cancel/restart without a stock claim",async()=>{
 const f=fixture();f.mode("empty");const pending=await f.turn("show snowboard under 750");
 assert.equal(pending!.state.step,"pending");assert.equal(pending!.state.maxPrice,"750");assert.doesNotMatch(pending!.reply,/available now|699\.95/);
 f.mode("live");const r=await f.turn("retry");assert.equal(r!.state.maxPrice,"750");assert.equal(r!.state.step,"selecting");
 f.mode("empty");await f.turn("Ice");const cancelled=await f.turn("cancel");assert.equal(cancelled!.state.step,"cancelled");assert.equal(cancelled!.state.pending,undefined);
 assert.equal((await f.turn("restart"))!.state.step,"discovering");
});

test("numbered and ordinal replies select only the saved offered order in English, Spanish and Hebrew",async()=>{
 for(const text of ["1","option 1","I'll take option 1","the first one","I'll take the first one","opción 1","quiero la opción 1","el primero","la primera opción","me quedo con la primera","אפשרות 1","אקח את הראשון","האפשרות הראשונה","אני רוצה את הראשון","אני בוחר באפשרות הראשונה","אני אקח אפשרות מספר 1"]) {
  const f=fixture();const offered=await f.turn("show snowboard under 750");f.mode("empty");
  const r=await f.turn(text);assert.equal(r!.state.step,"pending",text);assert.equal(r!.state.selected?.variantId,offered!.state.choices[0].variantId,text);assert.equal(r!.state.maxPrice,"750",text);assert.deepEqual(r!.state.choices,offered!.state.choices,text);
  f.mode("live");assert.equal((await f.turn("retry"))!.state.selected?.variantId,"v1",text);
 }
 const f=fixture();await f.turn("show snowboard");assert.equal((await f.turn("the second one"))!.state.selected?.variantId,"v2");
});
test("missing/expired lists, out-of-range references and unmatched selection requests never search or discard pending context",async()=>{
 for(const text of ["1","option 1","the first one","9","0","opción 1","האפשרות הראשונה"]) {
  const f=fixture();assert.match((await f.turn(text))!.reply,/repeat your product search/);
  assert.equal(f.calls(),0,text);
  await f.turn("show snowboard under 750");f.advance(31*60_000);
  const expired=await f.turn(text);assert.match(expired!.reply,/repeat your product search/);assert.equal(expired!.state.choices.length,0);assert.equal(expired!.state.selected,undefined);assert.equal(f.calls(),1,text);
 }
 const f=fixture();const offered=await f.turn("show snowboard under 750");f.mode("empty");await f.turn("option 1");
 for(const text of ["9","I'll take an unknown option","not sure"]) {
  const r=await f.turn(text);assert.equal(r!.state.step,"pending");assert.equal(r!.state.selected?.variantId,"v1");assert.equal(r!.state.pending?.action,"select");assert.equal(r!.state.maxPrice,"750");assert.deepEqual(r!.state.choices,offered!.state.choices);
 }
 f.mode("live");assert.equal((await f.turn("retry"))!.state.step,"confirming");
});
test("intentional new searches and budget-only updates replace preferences without interpreting list numbers as budgets",async()=>{
 const f=fixture();await f.turn("show snowboard under 750");await f.turn("option 1");
 let r=await f.turn("show Fire under 900");assert.equal(r!.state.query,"Fire");assert.equal(r!.state.selected,undefined);assert.equal(r!.state.maxPrice,"900");
 r=await f.turn("show skis under 1000");assert.equal(r!.state.maxPrice,"1000");assert.equal(r!.state.query,"skis");assert.equal(r!.state.selected,undefined);
 r=await f.turn("under 800");assert.equal(r!.state.maxPrice,"800");assert.equal(r!.state.query,"skis");
 r=await f.turn("show boots");assert.equal(r!.state.query,"boots");assert.equal(r!.state.maxPrice,"800");
});

test("expired pending-event replays ask for a new search without reverifying or retaining stale choices",async()=>{
 const f=fixture();await f.turn("show snowboard under 750");f.mode("empty");await f.turn("option 1",{eventId:"pending"});f.advance(31*60_000);
 const calls=f.calls(),r=await f.turn("option 1",{eventId:"pending"});assert.match(r!.reply,/repeat your product search/);assert.equal(r!.state.selected,undefined);assert.deepEqual(r!.state.choices,[]);assert.equal(f.calls(),calls);
});

test("verification follow-ups require a choice, preserve the list, then recheck only the chosen variant without confirmation", async()=>{
 for(const text of ["Verify inventory for Oxygen", "Verify inventory for 雪", "show another product", "verify option 2 inventory"]) assert.equal(shoppingVerificationFollowup(text),false);
 const f=fixture();const found=(await f.turn("show snowboard"))!;
 const first=found.state.choices[0];const calls=f.calls();
 const clarify=(await f.turn("Verify the current price and available inventory for that exact variant."))!;
 assert.equal(clarify.state.step,"selecting");
 assert.match(clarify.reply,/Choose an option by name or number first/);
 assert.deepEqual(clarify.state.choices,found.state.choices);
 assert.equal(clarify.state.selected,undefined);
 assert.equal(f.calls(),calls,"a verification request cannot silently pick from the offered list");
 let selected=(await f.turn("option 1"))!;
 assert.equal(selected.state.step,"confirming");
 assert.equal(selected.state.selected?.variantId,first.variantId);
 assert.equal(f.calls(),calls+1);
 f.quantity(3);f.price("710.00");
 const refreshed=(await f.turn("Verify the current price and available inventory for that exact variant."))!;
 assert.equal(refreshed.state.selected?.variantId,first.variantId);
 assert.equal(refreshed.state.selected?.price,"710.00");
 assert.equal(refreshed.state.selected?.inventoryQuantity,3);
 assert.match(refreshed.reply,/Tracked stock checked: 3 units; not reserved/);
 assert.equal(refreshed.state.step,"confirming");
 assert.equal(refreshed.state.checkout,undefined);
 f.mode("empty");const pending=(await f.turn("What's its current price?"))!;
 assert.equal(pending.state.step,"pending");
 assert.equal(pending.state.selected?.variantId,first.variantId);
 assert.doesNotMatch(pending.reply,/710|3 units|Tracked stock/);
 f.mode("live");const retry=(await f.turn("retry"))!;
 assert.equal(retry.state.step,"confirming");
 assert.equal(retry.state.selected?.variantId,first.variantId);
 assert.equal(retry.state.checkout,undefined);
});

test("only fresh known tracked inventory is reported; unknown counts and untracked stock are not invented",async()=>{
 const f=fixture();let result=(await f.turn("show snowboard"))!;
 assert.equal(result.state.choices[0].inventoryQuantity,5);
 assert.match(result.reply,/Tracked stock checked: 5 units/);
 for(const n of [null,-1,NaN]) {
  const g=fixture();g.quantity(n);const unknown=(await g.turn("show snowboard"))!;
  assert.equal(unknown.state.choices[0]?.inventoryQuantity,undefined);
  assert.doesNotMatch(unknown.reply,/Tracked stock/);
 }
 const untracked=fixture();untracked.tracked(false);result=(await untracked.turn("show snowboard"))!;
 assert.equal(result.state.choices[0].inventoryQuantity,undefined);
 assert.doesNotMatch(result.reply,/Tracked stock/);
 const stale=fixture();stale.mode("stale");result=(await stale.turn("show snowboard"))!;
 assert.equal(result.state.step,"pending");
 assert.doesNotMatch(result.reply,/Tracked stock|5 units/);
});

test("bare-title discovery is private opt-in, exact catalog-grounded and never replaces a saved selection",async()=>{
 const publicChat=fixture();assert.equal(await publicChat.turn("Snowboard"),null);assert.equal(publicChat.calls(),0);
 for(const text of ["Snow","Snowboard boots","What does WhachatCRM do?"]){
  const f=fixture({catalogTitleDiscovery:true});assert.equal(await f.turn(text),null);assert.equal(f.calls(),0);assert.equal(f.state(),null);
 }
 const f=fixture({catalogTitleDiscovery:true});const result=await f.turn("Snowboard");
 assert.equal(result!.state.intent,"search");assert.equal(result!.state.step,"selecting");assert.equal(result!.state.selected,undefined);
 assert.equal(result!.state.choices.length,2);assert.equal(f.calls(),1);
 await f.turn("Ice");const selected=await f.turn("Snowboard");
 assert.equal(selected!.state.selected?.variantId,"v1");assert.equal(selected!.state.step,"confirming");
 assert.match(selected!.reply,/selection is saved/);
 for(const setup of [(v:ReturnType<typeof fixture>)=>v.entitled(false),(v:ReturnType<typeof fixture>)=>{v.config.enabled=false;}]){
  const denied=fixture({catalogTitleDiscovery:true});setup(denied);assert.equal(await denied.turn("Snowboard"),null);assert.equal(denied.calls(),0);
 }
 const denied=fixture({catalogTitleDiscovery:true});assert.equal(await denied.turn("Snowboard",{userId:"tenant-b"}),null);assert.equal(denied.calls(),0);
});

 test("a policy clause cannot discard an explicit supported quantity mutation",async()=>{
 const f=fixture();await f.turn("show snowboard");await f.turn("option 1");
 const result=(await f.turn("quantity 2 and what is your return policy?"))!;
 assert.equal(result.state.quantity,2);assert.equal(result.state.selected?.variantId,"v1");
 assert.equal(result.state.step,"confirming");
 });

test("policy clauses cannot suppress supported stop and restart actions",async()=>{
 for(const [text,step] of [["Stop shopping and what is your return policy?","cancelled"],["Restart and explain your return policy","discovering"]]) {
  const f=fixture();await f.turn("show snowboard");await f.turn("option 1");
  const result=(await f.turn(text))!;
  assert.equal(result.state.step,step);assert.equal(result.state.selected,undefined);
  assert.equal(result.state.checkout,undefined);
 }
});

test("a policy clause cannot discard an explicit offered variant selection",async()=>{
 const f=fixture();await f.turn("show snowboard");await f.turn("Ice");
 const selected=(await f.turn("I'll take the Fire version and what is your return policy?"))!;
 assert.equal(selected.state.selected?.variantId,"v2");
 assert.equal(selected.state.step,"confirming");
});

test("contextual cheaper discovery reuses the merchant query and strictly lowers fresh price in EN/ES/HE",async()=>{
 for(const text of ["Show me something cheaper.","What about a cheaper one?","Muestrame algo mas barato","יש משהו זול יותר"]) {
  const f=fixture();await f.turn("show snowboard under 750");await f.turn("option 1");
  f.price("600.00");const cheaper=(await f.turn(text))!;
  assert.equal(cheaper.state.query,"snowboard",text);
  assert.equal(cheaper.state.cheaperThan,"699.95",text);
  assert.equal(cheaper.state.maxPrice,"750",text);
  assert.equal(cheaper.state.selected,undefined,"an explicit new discovery requires a new selection");
  assert.ok(cheaper.state.choices.every(c=>compareMoney(c.price,"699.95")<0));
 }
 const equal=fixture();await equal.turn("show snowboard");
 const none=(await equal.turn("Show me something cheaper"))!;
 assert.equal(none.state.choices.length,0,"equal prices must not be described as cheaper");
 const orphan=fixture();assert.match((await orphan.turn("Show me something cheaper"))!.reply,/repeat your product search/);assert.equal(orphan.calls(),0);
 const retry=fixture();await retry.turn("show snowboard under 750");retry.mode("empty");
 assert.equal((await retry.turn("Show me something cheaper"))!.state.step,"pending");
 retry.mode("live");retry.price("600");const resumed=(await retry.turn("retry"))!;
 assert.equal(resumed.state.query,"snowboard");assert.equal(resumed.state.cheaperThan,"699.95");
 const language=detectConversationLanguage("Busco una tabla de snowboard");assert.equal(language.code,"es");
 assert.equal(detectConversationLanguage("Muestrame algo mas barato").code,"es");
 for(const text of ["Algo mas barato","Una opcion mas barata"]) assert.equal(detectConversationLanguage(text).code,"es");
});

 test("cheaper retry cannot convert an old threshold or budget into a new currency",async()=>{
 const f=fixture();await f.turn("show snowboard under 750");f.mode("empty");
 await f.turn("Show me something cheaper");const calls=f.calls();
 f.sourceCurrency("EUR");f.currency("EUR");f.mode("live");
 const result=(await f.turn("retry"))!;
 assert.equal(f.calls(),calls);assert.equal(result.state.cheaperThan,undefined);
 assert.equal(result.state.maxPrice,undefined);assert.equal(result.state.selected,undefined);
 assert.match(result.reply,/repeat your product search/);
 });
 test("a new explicit search clears the cheaper threshold but retains the original budget",async()=>{
 const f=fixture();await f.turn("show snowboard under 750");f.price("600");
 await f.turn("Show me something cheaper");
 const result=(await f.turn("show helmet"))!;
 assert.equal(result.state.cheaperThan,undefined);assert.equal(result.state.maxPrice,"750");
 });
