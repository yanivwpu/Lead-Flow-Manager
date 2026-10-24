import assert from "node:assert/strict";
import test, { after } from "node:test";
import { build } from "esbuild";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { parseHTML } from "linkedom";

mkdirSync("work", { recursive: true });
const scratch = mkdtempSync(resolve("work/ecommerce-pilot-render-"));
const state = { locale: "en", user: { id: "fixture" } as { id: string } | null,
  aligned: true, available: false, failed: false, pending: false };
(globalThis as any).__pilotRender = state;
after(() => { rmSync(scratch, { recursive: true, force: true }); delete (globalThis as any).__pilotRender; });
const stubs: Record<string, string> = {
  "react-i18next": "export const useTranslation=()=>({i18n:{resolvedLanguage:globalThis.__pilotRender.locale}})",
  "auth-context": "export const useAuth=()=>({user:globalThis.__pilotRender.user,sessionAligned:globalThis.__pilotRender.aligned})",
  "react-helmet": "export const Helmet=({children})=>children",
  "@tanstack/react-query": `export const useMutation=()=>({isPending:false,mutate:()=>{}});
    export const useQueryClient=()=>({invalidateQueries:async()=>{}});
    export const useQuery=(options)=>{
      const s=globalThis.__pilotRender;
      if(options.queryKey.includes('/api/shopify/ecommerce/capabilities'))
        return {data:{available:s.available},isError:s.failed,isPending:s.pending};
      if(options.queryKey.includes('/api/team')) return {data:[]};
      return {data:{internalTasks:{schemaReady:true,scheduleReady:true,operatorEnabled:true,
        merchantEnabled:true,openCount:1,completedCount:0,items:[{id:'1',state:'open',
          createdAt:'2026-10-20T12:00:00Z',contactId:'contact',contactName:'Fixture',
          orderActivityId:'activity',orderName:'#1001',assigneeUserId:null,dueAt:null,
          reminderMinutes:null,reminderDue:false}]}},refetch:()=>{}};
    }`,
};
for (const [name, entry] of Object.entries({
  Boundary: "client/src/lib/ecommercePilot.tsx",
  Tasks: "client/src/components/followups/ShopifyOrderSupportTasks.tsx",
  Setup: "client/src/components/integrations/ShopifySimpleSetup.tsx",
})) {
  await build({ entryPoints: [entry], outfile: join(scratch, `${name}.mjs`),
    bundle: true, platform: "node", format: "esm", packages: "external", jsx: "automatic",
    plugins: [{ name: "fixture-hooks", setup(b) {
      b.onResolve({ filter: /.*/ }, args => {
        const key = args.path.endsWith('/auth-context') ? 'auth-context' : args.path;
        return stubs[key] ? { path: key, namespace: "fixture" } : undefined;
      });
      b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: stubs[args.path], loader: "js" }));
    } }] });
}
const { EcommercePilotBoundary: Boundary } = await import(pathToFileURL(join(scratch, "Boundary.mjs")).href);
const { ShopifyOrderSupportTasks: Tasks } = await import(pathToFileURL(join(scratch, "Tasks.mjs")).href);
const { ShopifySimpleSetup: Setup } = await import(pathToFileURL(join(scratch, "Setup.mjs")).href);
const render = (component: React.ReactNode) => renderToStaticMarkup(React.createElement(Router, {ssrPath:'/app/followups'}, component));

test("real pilot boundary and task surfaces fail closed for denied, stale-session and failed grants", () => {
  for (const scenario of [
    {available:false,aligned:true,failed:false,user:{id:'fixture'}},
    {available:true,aligned:false,failed:false,user:{id:'fixture'}},
    {available:true,aligned:true,failed:true,user:{id:'fixture'}},
    {available:true,aligned:true,failed:false,user:null},
  ]) {
    Object.assign(state, scenario);
    const html=render(React.createElement(Boundary, null, 'private-pilot-content'));
    assert.ok(!html.includes('private-pilot-content'));
    assert.ok(html.includes('noindex,nofollow'));
    assert.equal(render(React.createElement(Tasks)), '');
    assert.equal(render(React.createElement(Setup,{syncEnabled:true})), '');
  }
});

test("granted pilot renders localized task links, scheduling and setup with Hebrew RTL", () => {
  Object.assign(state,{available:true,aligned:true,failed:false,user:{id:'fixture'}});
  assert.ok(render(React.createElement(Boundary,null,'private-pilot-content')).includes('private-pilot-content'));
  for(const [locale,order,assignee,setup] of [
    ['en','View order','Shopify task assignee','Order support'],
    ['es','Ver pedido','Responsable de la tarea de Shopify','Soporte de pedidos'],
    ['he','צפייה בהזמנה','אחראי למשימת Shopify','טיפול בהזמנות'],
  ]) {
    state.locale=locale;
    const html=render(React.createElement(Tasks));
    const {document}=parseHTML(html);
    assert.ok(html.includes(order));
    assert.ok(html.includes(assignee));
    assert.equal(document.querySelector('section')?.getAttribute('dir'),locale==='he'?'rtl':'ltr');
    assert.ok(render(React.createElement(Setup,{syncEnabled:true})).includes(setup));
  }
});
