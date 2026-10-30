import assert from "node:assert/strict";
import test, { after } from "node:test";
import { build } from "esbuild";
import { mkdirSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { Router } from "wouter";

mkdirSync("work", { recursive: true });
const scratch = mkdtempSync(resolve("work/ecommerce-render-"));
after(() => rmSync(scratch, { recursive: true, force: true }));
const state = { locale: "en", user: { id: "fixture" } as { id: string } | null,
  aligned: true, available: true, grantFailed: false,
  activation: { eligible: false, activated: false, connected: false, planEligible: false },
  support: { data: { internalTasks: { schemaReady: true, operatorEnabled: true, merchantEnabled: false, openCount: 0, completedCount: 0 } }, isLoading: false, isFetching: false, isError: false },
  query: { data: { connected: true, shop: "fixture.myshopify.com", syncEnabled: true } as any,
    isLoading: false, isError: false } };
(globalThis as any).__ecommerceRender = state;
after(() => delete (globalThis as any).__ecommerceRender);

const stubs: Record<string, string> = {
  "react-i18next": "export const useTranslation=()=>({i18n:{resolvedLanguage:globalThis.__ecommerceRender.locale}})",
  "@tanstack/react-query": `export const useQuery=(options)=>{
    const s=globalThis.__ecommerceRender;
    if(options.queryKey.includes('/api/shopify/ecommerce/capabilities'))return {data:{available:s.available},isError:s.grantFailed};
    if(options.queryKey.includes('/api/shopify/merchant-engine/status'))return {data:s.activation,isLoading:false,isPending:false,isError:false};
    if(options.queryKey.includes('/api/shopify/ecommerce/event-inbox-preview'))return s.support;
    return s.query;
  }; export const useQueryClient=()=>({invalidateQueries:async()=>{}});
  export const useMutation=()=>({isPending:false,isError:false,mutate:()=>{throw Error('No automatic mutation allowed');}});`,
  "@/lib/auth-context": "export const useAuth=()=>({user:globalThis.__ecommerceRender.user,sessionAligned:globalThis.__ecommerceRender.aligned})",
  "@/lib/accountQueryScope": "export const withUserQueryScope=(key)=>key",
  "@/components/ShopifyCatalog": "export const ShopifyCatalog=()=>null",
  "@/components/ShoppingSettings": "export const ShoppingSettings=()=>null",
  "@/components/integrations/ShopifySimpleSetup": "export const ShopifySimpleSetup=()=>null",
  "react-helmet": "export const Helmet=({children})=>children",
  "@/components/marketing/MarketingHeader": "export const MarketingHeader=()=>null",
  "@/components/SiteFooter": "export const SiteFooter=()=>null",
};
for (const name of ["EcommerceGrowthEnginePreview", "EcommerceGrowthEngineDashboard"]) {
  await build({ entryPoints: [`client/src/pages/${name}.tsx`], outfile: join(scratch, `${name}.mjs`),
    bundle: true, platform: "node", format: "esm", packages: "external", jsx: "automatic",
    plugins: [{ name: "fixture-hooks", setup(b) {
      b.onResolve({ filter: /.*/ }, args => {
        const key=args.path.endsWith('/auth-context')?'@/lib/auth-context':args.path;
        return stubs[key] ? { path: key, namespace: "fixture" } : undefined;
      });
      b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: stubs[args.path], loader: "js" }));
    } }] });
}
const { EcommerceGrowthEnginePreviewContent: Preview } = await import(pathToFileURL(join(scratch, "EcommerceGrowthEnginePreview.mjs")).href);
const { EcommerceGrowthEngineDashboardContent: Dashboard, EcommerceGrowthEngineDashboard: Page } = await import(pathToFileURL(join(scratch, "EcommerceGrowthEngineDashboard.mjs")).href);

const renderDashboard = () => renderToStaticMarkup(React.createElement(Router, { ssrPath: "/app/ecommerce-growth-engine" }, React.createElement(Dashboard)));

test("each locale renders the preview notices, correct setup links and RTL without claiming recovery is active", () => {
  for (const [locale, notice, badge] of [
    ["en", "No automatic customer messages are sent", "Shopify first"],
    ["es", "No se envían mensajes automáticos", "Primero Shopify"],
    ["he", "לא נשלחות הודעות אוטומטיות", "Shopify תחילה"],
  ]) {
    state.locale = locale;
    for (const signedIn of [false, true]) {
      state.user = signedIn ? { id: "fixture" } : null;
      const html = renderToStaticMarkup(React.createElement(Preview));
      const { document } = parseHTML(html);
      assert.ok(html.includes(notice));
      assert.ok(html.includes(badge));
      assert.doesNotMatch(html, /\{tr\.(?:about|notice)\}/);
      assert.equal(document.querySelector('[data-testid="ecommerce-growth-engine-preview"]')?.getAttribute("dir"), locale === "he" ? "rtl" : "ltr");
      assert.equal(document.querySelector('meta[name="robots"]')?.getAttribute("content"), "noindex,nofollow");
      assert.equal(document.querySelector('[data-testid="ecommerce-preview-primary-cta"]')?.getAttribute("href"),
        signedIn ? "/app/integrations?setup=shopify" : "/auth?redirect=%2Fapp%2Fintegrations%3Fsetup%3Dshopify");
    }
  }
});

test("overview uses existing merchant tools without duplicated top module navigation", () => {
  state.locale="en";state.user={id:"fixture"};state.aligned=true;
  const {document}=parseHTML(renderDashboard());
  assert.ok(document.querySelector('[data-testid="ecommerce-growth-engine-dashboard"]'));
  assert.equal(document.querySelector('[data-testid="ecommerce-module-navigation"]'),null);
  const links=[...document.querySelectorAll("a")].map(a=>a.getAttribute("href"));
  for(const destination of ["/app/sales-catalog?source=shopify","/app/contacts","/app/followups","/app/ai-brain"]){
    assert.ok(links.includes(destination),`Missing existing tool destination ${destination}`);
  }
  assert.ok(!links.some(href=>href?.startsWith("#")),"Old anchor tabs should be removed");
  assert.equal(document.querySelectorAll("a a").length,0);
});

test("dashboard connection states remain localized and do not falsely claim connection",()=>{
  for(const [locale,unavailable,disconnected] of [
    ["en","Connection status unavailable","Shopify not connected"],
    ["es","Estado de conexión no disponible","Shopify no conectado"],
    ["he","סטטוס החיבור אינו זמין","Shopify לא מחובר"],
  ]){
    state.locale=locale;
    state.query.isError=true;
    assert.ok(renderDashboard().includes(unavailable));
    state.query.isError=false;state.query.data.connected=false;
    assert.ok(renderDashboard().includes(disconnected));
    assert.ok(renderDashboard().includes('dir="'+(locale==="he"?"rtl":"ltr")+'"'));
    state.query.data.connected=true;
  }
});

test("dashboard keeps Shopify setup out of overview and links to existing settings and records",()=>{
  state.locale="en";state.user={id:"fixture"};state.aligned=true;
  const html=renderDashboard();
  assert.ok(!html.includes('data-testid="shopify-simple-setup"'));
  assert.ok(html.includes("/app/ecommerce-growth-engine?view=orders"));
  const source=readFileSync("client/src/pages/EcommerceGrowthEngineDashboard.tsx","utf8");
  assert.ok(source.includes('view==="products"'));
  assert.ok(source.includes("<ShopifyCatalog showShoppingSettings={false}/>"));
  assert.ok(source.includes('view==="settings"'));
  assert.ok(source.includes("<ShopifySimpleSetup"));
  assert.ok(source.includes('view==="recovery"'));
  assert.ok(source.includes('view==="post"'));
  assert.ok(source.includes("t.recoveryDetail"));
  assert.ok(source.includes("t.postDetail"));
});

test("actual dashboard pilot boundary denies missing grant, failed grant and stale sessions", () => {
  for(const patch of [{available:false},{failed:true},{aligned:false},{user:null}] as Array<{available?:boolean;failed?:boolean;aligned?:boolean;user?:null}>) {
    state.available=patch.available??true;state.grantFailed=patch.failed??false;
    state.aligned=patch.aligned??true;state.user=patch.user===null?null:{id:'fixture'};
    const html=renderToStaticMarkup(React.createElement(Router,{ssrPath:'/app/ecommerce-growth-engine'},React.createElement(Page)));
    assert.ok(!html.includes('data-testid="shopify-simple-setup"'));
    assert.ok(!html.includes('data-testid="ecommerce-growth-engine-dashboard"'));
    assert.ok(html.includes('noindex,nofollow'));
  }
  state.available=true;state.grantFailed=false;state.aligned=true;state.user={id:'fixture'};
});

test("preview exposes activation only to eligible merchants and opens the active workspace", () => {
  state.user = { id: "fixture" }; state.aligned = true; state.locale = "en";
  state.activation = { eligible: false, activated: false, connected: true, planEligible: false };
  let html = renderToStaticMarkup(React.createElement(Preview));
  assert.ok(!html.includes('data-testid="ecommerce-activate-engine"'));
  assert.ok(html.includes("Requires Pro"));
  state.activation = { eligible: true, activated: false, connected: true, planEligible: true };
  html = renderToStaticMarkup(React.createElement(Preview));
  assert.ok(html.includes('data-testid="ecommerce-activate-engine"'));
  assert.equal(parseHTML(html).document.querySelector('[data-testid="ecommerce-preview-primary-cta"]')?.getAttribute("href"),
    "/app/integrations?setup=shopify");
  state.activation = { eligible: true, activated: true, connected: true, planEligible: true };
  html = renderToStaticMarkup(React.createElement(Preview));
  assert.ok(!html.includes('data-testid="ecommerce-activate-engine"'));
  assert.equal(parseHTML(html).document.querySelector('[data-testid="ecommerce-preview-primary-cta"]')?.getAttribute("href"),
    "/app/ecommerce-growth-engine");
  state.activation = { eligible: false, activated: false, connected: false, planEligible: false };
});

test("Shopify journey is visual, concise and localized, with deeper descriptions collapsed", () => {
  for (const [locale, inquiry, recovery, repeat] of [
    ["en", "Customer inquiry", "Cart recovery", "Repeat purchase"],
    ["es", "Consulta del cliente", "Recuperar carritos", "Nueva compra"],
    ["he", "פניית לקוח", "שחזור עגלות", "רכישה חוזרת"],
  ]) {
    state.locale = locale;
    const { document } = parseHTML(renderToStaticMarkup(React.createElement(Preview)));
    const journey = document.querySelector('[data-testid="shopify-customer-journey"]');
    assert.ok(journey);
    assert.equal(journey.querySelectorAll('[role="listitem"]').length, 5);
    assert.ok(journey.textContent.includes(inquiry));
    assert.ok(journey.textContent.includes(recovery));
    assert.ok(journey.textContent.includes(repeat));
    const details = journey.querySelector('[data-testid="shopify-journey-feature-details"]');
    assert.ok(details);
    assert.equal(details.hasAttribute("open"), false);
  }
  state.locale = "en";
  state.activation = { eligible: false, activated: false, connected: false, planEligible: false };
});

test("eligible merchant sees primary Activate action, with setup as secondary link", () => {
  state.user = { id: "fixture" };
  state.aligned = true;
  state.locale = "en";
  state.activation = { eligible: true, activated: false, connected: true, planEligible: true };
  const { document } = parseHTML(renderToStaticMarkup(React.createElement(Preview)));
  const activate = document.querySelector('[data-testid="ecommerce-activate-engine"]');
  const setup = document.querySelector('[data-testid="ecommerce-preview-primary-cta"]');
  assert.ok(activate?.className.includes("bg-blue-600"));
  assert.equal(setup?.getAttribute("href"), "/app/integrations?setup=shopify");
  assert.ok(!setup?.className.includes("bg-blue-600"));
  state.activation = { eligible: false, activated: false, connected: false, planEligible: false };
});

test("E-Commerce solutions page centers the benefits heading and keeps its intro one line on desktop", () => {
  const src = readFileSync("client/src/components/marketing/SolutionPage.tsx", "utf8");
  assert.ok(src.includes('content.path === "/solutions/ecommerce"'));
  assert.ok(src.includes('data-testid="solution-help-section-header"'));
  assert.ok(src.includes('isEcommerceSolution && "text-center"'));
  assert.ok(src.includes('isEcommerceSolution && "mx-auto lg:max-w-none lg:whitespace-nowrap"'));
  // Do not impose nowrap on narrow phones or alter the layout of other solutions.
  assert.ok(!src.includes('isEcommerceSolution && "whitespace-nowrap"'));
});
