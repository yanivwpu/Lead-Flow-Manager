import assert from "node:assert/strict";
import test, { after } from "node:test";
import { build } from "esbuild";
import { mkdirSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";

mkdirSync("work", { recursive: true });
const scratch = mkdtempSync(resolve("work/ecommerce-post-purchase-render-"));
const state = {
  locale: "en", available: true, connected: true, user: {id: "fixture"} as {id:string}|null,
  aligned: true, loading: false, error: false, failedSave: false,
  response: {
    ok: true, mode: "recording",
    journeys: { orderSupport: 2, fulfillmentSupport: 1, orderCancelled: 0 },
    workflowDrafts: { orderSupport: true, fulfillmentSupport: true, orderCancelled: false, abandonedCart: false },
    messagingEnabled: false,
    postPurchaseSchemaReady:undefined as boolean|undefined,
    deliveryActivation:undefined as import("../client/src/components/ecommerce/ShopifyPostPurchasePlans").PostPurchaseActivationState|undefined
  }
};
(globalThis as any).__postPurchaseRender = state;
after(() => { rmSync(scratch, {recursive:true,force:true}); delete (globalThis as any).__postPurchaseRender; });

const stubs: Record<string,string> = {
  "@/lib/ecommercePilot": "export const useEcommercePilot=()=>({available:globalThis.__postPurchaseRender.available})",
  "@/lib/ecommerceTaskCopy": "export const useEcommerceTaskCopy=()=>({locale:globalThis.__postPurchaseRender.locale,dir:globalThis.__postPurchaseRender.locale==='he'?'rtl':'ltr'})",
  "@/lib/auth-context": "export const useAuth=()=>({user:globalThis.__postPurchaseRender.user,sessionAligned:globalThis.__postPurchaseRender.aligned})",
  "@/lib/accountQueryScope": "export const withUserQueryScope=(key)=>key",
  "@tanstack/react-query": `
    export const useQuery=()=>{const s=globalThis.__postPurchaseRender;return {
      data:s.response,isLoading:s.loading,isError:s.error,refetch:async()=>{}
    }};
    export const useQueryClient=()=>({invalidateQueries:async()=>{}});
    export const useMutation=()=>({isPending:false,isError:globalThis.__postPurchaseRender.failedSave,
      mutate:()=>{throw Error('Draft mutations must never execute during SSR')}});
  `
};
await build({
  entryPoints:["client/src/components/ecommerce/ShopifyPostPurchasePreview.tsx"],
  outfile:join(scratch,"PostPurchase.mjs"), bundle:true, platform:"node",format:"esm",
  packages:"external",jsx:"automatic",
  plugins:[{name:"fixture-hooks",setup(b){
    b.onResolve({filter:/.*/},args=>stubs[args.path]?{path:args.path,namespace:"fixture"}:undefined);
    b.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:stubs[args.path],loader:"js"}));
  }}]
});
const { ShopifyPostPurchasePreview } = await import(pathToFileURL(join(scratch,"PostPurchase.mjs")).href);
function render(connected=true){
  return renderToStaticMarkup(React.createElement(ShopifyPostPurchasePreview,{connected}));
}

test("post-purchase preview reuses owned event counts and ONLY prepares existing drafts",()=>{
  state.locale="en";state.available=true;state.user={id:"fixture"};state.aligned=true;
  state.loading=false;state.error=false;state.failedSave=false;
  const {document}=parseHTML(render());
  const preview=document.querySelector('[data-testid="shopify-post-purchase-preview"]');
  assert.ok(preview);
  assert.equal(preview.getAttribute("dir"),"ltr");
  assert.ok(preview.textContent.includes("New orders"));
  assert.ok(preview.textContent.includes("Fulfillment updates"));
  assert.ok(preview.textContent.includes("Cancelled orders"));
  assert.ok(preview.textContent.includes("Draft prepared"));
  assert.ok(preview.textContent.includes("Review request"));
  assert.ok(preview.textContent.includes("Repeat purchase"));
  assert.ok(preview.textContent.includes("Nothing sends to customers"));
  assert.equal(preview.querySelectorAll('button[data-testid^="shopify-post-purchase-draft-"]').length,2);
  assert.ok(!preview.querySelector('[data-testid="shopify-post-purchase-draft-orderSupport"]'));
  assert.ok(!preview.querySelector('[data-testid="shopify-post-purchase-draft-review"]'));
  assert.ok(!preview.querySelector('[data-testid="shopify-post-purchase-draft-repeat"]'));
});

test("English, Spanish and Hebrew previews are localized and Hebrew is RTL",()=>{
  for(const [locale,label] of [
    ["en","Post-purchase journeys"],
    ["es","Recorridos poscompra"],
    ["he","מסעות לאחר רכישה"]
  ]){
    state.locale=locale;
    const {document}=parseHTML(render());
    const el=document.querySelector('[data-testid="shopify-post-purchase-preview"]');
    assert.ok(el);
    assert.equal(el.getAttribute("dir"),locale==="he"?"rtl":"ltr");
    assert.ok(el.textContent.includes(label));
  }
  state.locale="en";
});

test("disconnected, missing grant, stale session and error fail closed",()=>{
  state.locale="en";state.available=true;state.user={id:"fixture"};state.aligned=true;
  assert.ok(render(false).includes("Connect Shopify"));
  assert.ok(!render(false).includes("shopify-post-purchase-preview"));
  state.available=false;assert.ok(render().includes("not available"));
  state.available=true;state.aligned=false;assert.ok(render().includes("not available"));
  state.aligned=true;state.user=null;assert.ok(render().includes("not available"));
  state.user={id:"fixture"};state.error=true;
  assert.ok(render().includes("Event preview unavailable"));
  assert.ok(!render().includes("shopify-post-purchase-draft-"));
  state.error=false;
});

test("source uses existing private routes and never introduces a sender",()=>{
  const src=readFileSync("client/src/components/ecommerce/ShopifyPostPurchasePreview.tsx","utf8");
  assert.ok(src.includes("/api/shopify/ecommerce/event-inbox-preview"));
  assert.ok(src.includes("/api/shopify/ecommerce/workflow-draft"));
  assert.ok(src.includes('action: "save_draft"'));
  assert.ok(src.includes("workflowActive !== false"));
  assert.ok(src.includes("messagingEnabled !== false"));
  assert.ok(!src.includes("send-message"));
  assert.ok(!src.includes("send-template"));
  assert.ok(!src.includes("cartCreate("));
});

test('six editable journey plans expose localized delays, examples and blocked activation',()=>{
  for(const [locale,title,blocked] of [
    ['en','Choose customer journeys','Activation unavailable'],
    ['es','Elige recorridos para clientes','Activación no disponible'],
    ['he','בחירת מסעות לקוח','הפעלה אינה זמינה'],
  ]){
    state.locale=locale;state.available=true;state.user={id:'fixture'};state.aligned=true;state.error=false;
    const {document}=parseHTML(render());const section=document.querySelector('[data-testid="post-purchase-plans"]')!;
    assert.ok(section.textContent.includes(title));assert.ok(section.textContent.includes(blocked));
    assert.equal(section.getAttribute('dir'),locale==='he'?'rtl':'ltr');
    assert.equal(section.querySelectorAll('input[type="checkbox"]').length,6);
    assert.equal(section.querySelectorAll('input[type="checkbox"][checked]').length,0);
    assert.equal(section.querySelectorAll('input[type="number"]').length,6);
    assert.equal(section.querySelectorAll('details').length,6);
    assert.equal(section.querySelectorAll('form').length,6);
    assert.ok(section.querySelector('[data-testid="post-purchase-activation"]')?.hasAttribute('disabled'));
  }
  state.locale='en';
});

test('actual enabled and paused delivery state controls all localized notices and pause action',()=>{
  state.available=true;state.user={id:'fixture'};state.aligned=true;state.error=false;state.loading=false;
  state.response.postPurchaseSchemaReady=true;
  for(const [locale,label,off] of [
    ['en','Journey delivery is enabled','Automatic sending is disabled'],
    ['es','El envío está activado','El envío automático está desactivado'],
    ['he','שליחת המסעות פעילה','שליחה אוטומטית מושבתת'],
  ]){
    state.locale=locale;
    state.response.deliveryActivation={canActivate:true,merchantEnabled:true,deliveryEnabled:true,blockers:[]};
    let page=render();assert.ok(page.includes(label));assert.ok(!page.includes(off));
    if(locale==='en'){assert.ok(!page.includes('Nothing sends to customers'));assert.ok(!page.includes('sending remains off'));}
    const {document}=parseHTML(page);
    assert.ok(!document.querySelector('[data-testid="post-purchase-activation"]')?.hasAttribute('disabled'));
    state.response.deliveryActivation={canActivate:false,merchantEnabled:true,deliveryEnabled:false,blockers:['operator_release_required']};
    page=render();assert.ok(page.includes(off));assert.ok(!page.includes(label));
  }
  state.locale='en';state.response.deliveryActivation=undefined;state.response.postPurchaseSchemaReady=undefined;
});
