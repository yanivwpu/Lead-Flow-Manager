import assert from "node:assert/strict";
import test, { after } from "node:test";
import { build } from "esbuild";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
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
    if(options.queryKey.includes('/api/shopify/ecommerce/event-inbox-preview'))return s.support;
    return s.query;
  }; export const useQueryClient=()=>({invalidateQueries:async()=>{}});
  export const useMutation=()=>({isPending:false,isError:false,mutate:()=>{throw Error('No automatic mutation allowed');}});`,
  "@/lib/auth-context": "export const useAuth=()=>({user:globalThis.__ecommerceRender.user,sessionAligned:globalThis.__ecommerceRender.aligned})",
  "@/lib/accountQueryScope": "export const withUserQueryScope=(key)=>key",
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

test("dashboard links have one anchor each and point to existing merchant tools", () => {
  state.locale = "en"; state.user = { id: "fixture" }; state.aligned = true;
  const html = renderDashboard();
  assert.doesNotMatch(html, /<a\b[^>]*>\s*<a\b/);
  const { document } = parseHTML(html);
  const links = [...document.querySelectorAll("a")].map(a => a.getAttribute("href"));
  assert.deepEqual(links, ["/app/integrations?setup=shopify", "#overview", "#shopping", "#order-support", "#recovery", "#post-purchase", "#settings", "/app/inbox", "/app/ai-brain", "/app/followups", "/app/workflows", "/app/followups", "/ecommerce-growth-engine"]);
  for (const id of ["overview", "shopping", "order-support", "recovery", "post-purchase", "settings"]) {
    assert.ok(document.getElementById(id), `missing merchant module ${id}`);
  }
  assert.ok(document.querySelector('[data-testid="ecommerce-module-navigation"]'));
});

test("dashboard preserves unavailable, session-checking and paused-sync states in every locale", () => {
  for (const [locale, unavailable, checking, paused] of [
    ["en", "Shopify status unavailable", "Checking Shopify connection", "Sync paused"],
    ["es", "El estado de Shopify no está disponible", "Comprobando la conexión", "Sincronización pausada"],
    ["he", "סטטוס Shopify אינו זמין", "בודקים את חיבור", "הסנכרון מושהה"],
  ]) {
    state.locale = locale;
    state.query.isError = true;
    assert.ok(renderDashboard().includes(unavailable));
    state.query.isError = false; state.aligned = false;
    assert.ok(renderDashboard().includes(checking));
    state.aligned = true; state.query.data.syncEnabled = false;
    const html = renderDashboard();
    assert.ok(html.includes(paused));
    assert.ok(html.includes('dir="' + (locale === "he" ? "rtl" : "ltr") + '"'));
    state.query.data.syncEnabled = true;
  }
});

test("connected dashboard reuses localized explicit order-support opt-in and existing pause/tasks controls", () => {
  for(const [locale,start] of [['en','Turn on order support'],['es','Activar soporte de pedidos'],['he','הפעלת טיפול בהזמנות']]) {
    state.locale=locale;state.support.data.internalTasks.merchantEnabled=false;
    const {document}=parseHTML(renderDashboard());
    const setup=document.querySelector('[data-testid="shopify-simple-setup"]');
    assert.ok(setup);assert.ok(setup.textContent.includes(start));
    assert.equal(setup.getAttribute('dir'),locale==='he'?'rtl':'ltr');
    assert.equal(setup.querySelector('[data-testid="shopify-start-order-support"]')?.hasAttribute('disabled'),false);
    state.support.data.internalTasks.merchantEnabled=true;
    const running=parseHTML(renderDashboard()).document;
    assert.ok(running.querySelector('[data-testid="shopify-open-tasks"]'));
    assert.ok(running.querySelector('[data-testid="shopify-pause-order-support"]'));
  }
  state.support.data.internalTasks.merchantEnabled=false;
});

test("dashboard never exposes setup for disconnected, unavailable, loading or unaligned connection state", () => {
  for(const patch of [{connected:false},{failed:true},{loading:true},{aligned:false}] as Array<{connected?:boolean;failed?:boolean;loading?:boolean;aligned?:boolean}>) {
    state.query.data.connected=patch.connected??true;state.query.isError=patch.failed??false;
    state.query.isLoading=patch.loading??false;state.aligned=patch.aligned??true;
    assert.ok(!renderDashboard().includes('data-testid="shopify-simple-setup"'));
  }
  state.query.data.connected=true;state.query.isError=false;state.query.isLoading=false;state.aligned=true;
});

test("order-support starts disabled for paused sync, missing schema, operator gate, loading or failed status", () => {
  for(const patch of [{sync:false},{schema:false},{operator:false},{loading:true},{failed:true}] as Array<{sync?:boolean;schema?:boolean;operator?:boolean;loading?:boolean;failed?:boolean}>) {
    state.query.data.syncEnabled=patch.sync??true;
    Object.assign(state.support,{isLoading:patch.loading??false,isError:patch.failed??false});
    Object.assign(state.support.data.internalTasks,{schemaReady:patch.schema??true,operatorEnabled:patch.operator??true});
    const {document}=parseHTML(renderDashboard());
    const button=document.querySelector('[data-testid="shopify-start-order-support"]');
    assert.ok(!button||button.hasAttribute('disabled'));
  }
  state.query.data.syncEnabled=true;Object.assign(state.support,{isLoading:false,isError:false});
  Object.assign(state.support.data.internalTasks,{schemaReady:true,operatorEnabled:true});
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
