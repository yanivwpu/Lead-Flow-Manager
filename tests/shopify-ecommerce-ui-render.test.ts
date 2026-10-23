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
  aligned: true, query: { data: { connected: true, shop: "fixture.myshopify.com", syncEnabled: true } as any,
    isLoading: false, isError: false } };
(globalThis as any).__ecommerceRender = state;
after(() => delete (globalThis as any).__ecommerceRender);

const stubs: Record<string, string> = {
  "react-i18next": "export const useTranslation=()=>({i18n:{resolvedLanguage:globalThis.__ecommerceRender.locale}})",
  "@tanstack/react-query": "export const useQuery=()=>globalThis.__ecommerceRender.query",
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
      b.onResolve({ filter: /.*/ }, args => stubs[args.path] ? { path: args.path, namespace: "fixture" } : undefined);
      b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: stubs[args.path], loader: "js" }));
    } }] });
}
const { EcommerceGrowthEnginePreview: Preview } = await import(pathToFileURL(join(scratch, "EcommerceGrowthEnginePreview.mjs")).href);
const { EcommerceGrowthEngineDashboard: Dashboard } = await import(pathToFileURL(join(scratch, "EcommerceGrowthEngineDashboard.mjs")).href);

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
  assert.deepEqual(links, ["/app/integrations?setup=shopify", "/app/inbox", "/app/ai-brain", "/app/followups", "/app/workflows", "/ecommerce-growth-engine"]);
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
