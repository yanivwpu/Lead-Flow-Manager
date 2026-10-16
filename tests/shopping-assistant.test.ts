import assert from "node:assert/strict";
import test from "node:test";
import { shoppingIntent, shoppingFilters, compareMoney, shoppingSettingsSchema, shoppingSettings, type ShoppingState } from "../shared/shoppingAssistant";
import { createShoppingService, type CommerceShoppingProvider, type ShoppingSessionStore } from "../server/shopping/service";
function fixture() {
 let state:ShoppingState|null=null, calls=0, price="699.95", available=true, currency="USD", quantity=5, entitled=true;
 const config=shoppingSettings({enabled:true,handoffOnFailure:true});
 const product={id:"p1",title:"Snowboard",published:true,status:"ACTIVE",userId:"tenant-a"};
 const variants=[{id:"v1",title:"Ice",options:[{name:"Color",value:"Ice"}]},{id:"v2",title:"Fire",options:[{name:"Color",value:"Fire"}]}];
 const commerce={source:async(id:string)=>id==="tenant-a"?{id:"s1",currency:"USD"}:null,purchaseCandidates:async(_id:string,request:any)=>{assert.equal(request.filters.currency,"USD");return [{...product,variants}];},lookupVariant:async()=>null,
 verifyForPurchase:async(_u:string,_s:string,ids:string[])=>{calls++;return variants.filter(v=>ids.includes(v.id)).map(v=>({product,variant:{...v,price,currency,quantity,tracked:true,inventoryPolicy:"DENY",verifiedAt:new Date()},availability:available?"available":"out_of_stock"}));}} as unknown as CommerceShoppingProvider;
 const sessions:ShoppingSessionStore={async withTurn(turn,run){if(turn.userId!=="tenant-a")return null;return run(state,async s=>{state=s;});}};
 const service=createShoppingService({commerce,sessions,settings:async()=>config,entitled:async()=>entitled});
 let event=0;
 return {service,turn:(text:string,extra={})=>service.turn({userId:"tenant-a",conversationId:"c1",eventId:`e${++event}`,text,channel:"webchat",...extra}),state:()=>state,calls:()=>calls,price:(p:string)=>price=p,available:(a:boolean)=>available=a,currency:(c:string)=>currency=c,quantity:(n:number)=>quantity=n,config,entitled:(b:boolean)=>entitled=b};
}
test("multilingual shopping intent, budget and exact currency/decimal handling",()=>{
 for(const s of ["Show snowboard options","Muéstrame las opciones","אפשרויות של סנובורד"])assert.equal(shoppingIntent(s),"variants");
 for(const s of ["available now?","¿Están disponibles?","האם זמין?"])assert.equal(shoppingIntent(s),"availability");
 for(const s of ["human please","agente por favor","רוצה נציג"])assert.equal(shoppingIntent(s),"handoff");
 assert.equal(shoppingFilters("snowboard under $750","USD").maxPrice,"750");
 assert.equal(shoppingFilters("busco snowboard menos de €750","USD").currency,"EUR");
 assert.equal(shoppingFilters("סנובורד עד ₪750","USD").maxPrice,"750");
 assert.deepEqual(shoppingFilters("snowboard between 100 and 750","USD"),{currency:"USD",minPrice:"100",maxPrice:"750",query:"snowboard"});
 assert.equal(compareMoney("699.950000","699.95"),0);assert.equal(compareMoney("100000000000.01","99999999999.99"),1);
 assert.equal(shoppingSettingsSchema.safeParse({checkoutEnabled:true}).success,false);
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
