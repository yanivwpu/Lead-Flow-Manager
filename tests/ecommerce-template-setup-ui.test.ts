import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { SHOPIFY_GROWTH_TEMPLATES, type ShopifyTemplateSetup } from "../shared/shopifyGrowthTemplates";
import { readPostPurchasePlans } from "../shared/postPurchase";

test("EN/ES/HE setup shows actual approval progress, RTL, explicit authorization and default-off activation", async () => {
  await mkdir("work", { recursive: true }); const dir = await mkdtemp(resolve("work/template-ui-"));
  try {
    await build({ entryPoints: ["client/src/components/ecommerce/ShopifyTemplateSetup.tsx"], outfile: join(dir, "ui.mjs"), bundle: true,
      platform: "node", format: "esm", packages: "external", jsx: "automatic", plugins: [{ name: "isolated-auth", setup(b) {
        b.onResolve({ filter: /^@\/lib\/auth-context$/ }, () => ({ path: "auth", namespace: "fixture" }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ loader: "js", contents: "export const useAuth=()=>({user:{id:'fixture'},sessionAligned:true})" }));
      } }] });
    const { ShopifyTemplateSetupPanel } = await import(pathToFileURL(join(dir, "ui.mjs")).href);
    const data: ShopifyTemplateSetup = { available: true, connected: true, authorized: false, rows: [] };
    const render = (locale: string, result: ShopifyTemplateSetup = data, extra:Record<string,unknown>={}) => parseHTML(renderToStaticMarkup(React.createElement(ShopifyTemplateSetupPanel, {
      locale, data: result, onAuthorize: () => {}, onRefresh: () => {}, onPlan: () => {}, onDelivery: () => {}, ...extra,
    }))).document;
    for (const [locale, title, ready] of [["en", "Automatic WhatsApp message setup", "Ready"],
      ["es", "Configuración automática de mensajes WhatsApp", "Listo"], ["he", "הגדרה אוטומטית של הודעות WhatsApp", "מוכן"]]) {
      const initial = render(locale), panel = initial.querySelector('[data-testid="shopify-template-setup"]')!;
      assert.equal(panel.getAttribute("dir"), locale === "he" ? "rtl" : "ltr");
      assert.ok(panel.textContent.includes(title));
      assert.ok(initial.querySelector('[data-testid="authorize-template-setup"]'));
      const progress: ShopifyTemplateSetup = { ...data, authorized: true, postPurchasePlans: readPostPurchasePlans(null),
        delivery: { postPurchase: { canActivate: false, merchantEnabled: false, deliveryEnabled: false, reason: "operator_release_required" },
          checkoutRecovery: { canActivate: false, merchantEnabled: false, deliveryEnabled: false, reason: "operator_release_required" } },
        rows: SHOPIFY_GROWTH_TEMPLATES.map((t, i) => ({ journey: t.journey, name: t.name,
          status: i === 0 ? "ready" : i === 1 ? "awaiting_approval" : i === 2 ? "action_required" : "paused",
          reason: i === 0 ? "approved_and_bound" : i === 1 ? "meta_review_pending" : i === 2 ? "meta_template_rejected" : "meta_template_paused" })) };
      const completed = render(locale, progress);
      const refresh=completed.querySelector('[data-testid="refresh-template-status"]');
      assert.ok(refresh && !refresh.hasAttribute("disabled"),"refresh is an enabled button");
      assert.equal(refresh.getAttribute("aria-busy"),"false");
      assert.ok(completed.querySelector('[data-testid="template-refresh-feedback"]')?.textContent.includes(
        locale==="en"?"Meta approval":locale==="es"?"aprobación de Meta":"אישור Meta"
      ));
      const loading=render(locale,progress,{refreshing:true});
      assert.equal(loading.querySelector('[data-testid="refresh-template-status"]')?.getAttribute("aria-busy"),"true");
      assert.ok(loading.querySelector('[data-testid="refresh-template-status"]')?.hasAttribute("disabled"));
      const refreshed=render(locale,progress,{refreshedAt:Date.UTC(2026,10,10,16,0,0)});
      assert.ok(refreshed.querySelector('[data-testid="template-refresh-feedback"]')?.textContent.includes(
        locale==="en"?"Status updated":locale==="es"?"Estado actualizado":"המצב עודכן"
      ));

      assert.equal(completed.querySelectorAll('li[data-testid^="template-progress-"]').length, 4);
      assert.ok(completed.querySelector('[data-testid="template-progress-orderConfirmation"]')?.textContent.includes(ready));
      assert.ok(completed.querySelector('[data-testid="activate-postPurchase"]')?.hasAttribute("disabled"));
      assert.ok(completed.querySelector('[data-testid="activate-checkoutRecovery"]')?.hasAttribute("disabled"));
      assert.equal(completed.querySelectorAll('input[type="checkbox"][checked]').length, 0);
      assert.ok(!completed.querySelector('[data-testid="authorize-template-setup"]'));
      assert.ok(!completed.documentElement.textContent.includes("Create the message in Meta WhatsApp Manager"));
      for(const connected of [true,false]){
        const unavailable=render(locale,{...progress,connected,authorized:false,
          delivery:{postPurchase:{canActivate:false,merchantEnabled:true,deliveryEnabled:false,reason:'meta_credentials_expired'},
            checkoutRecovery:{canActivate:false,merchantEnabled:true,deliveryEnabled:false,reason:'meta_credentials_expired'}},
          rows:progress.rows.map(row=>({...row,status:'unavailable',reason:connected?'meta_credentials_expired':'connect_whatsapp'}))});
        for(const kind of ['postPurchase','checkoutRecovery']){
          const pause=unavailable.querySelector(`[data-testid="activate-${kind}"]`);
          assert.ok(pause,'saved delivery remains pausable when WhatsApp is unavailable');
          assert.equal(pause.hasAttribute('disabled'),false);
        }
        assert.equal(unavailable.querySelector('[data-testid="authorize-template-setup"]'),null);
      }
    }
    assert.equal(render("en", { ...data, available: false }).querySelector('[data-testid="authorize-template-setup"]'), null);
    assert.ok(render("en", { ...data, connected: false }).querySelector('a[href="/app/settings?tab=channels"]'));
    const expired=render('en',{...data,rows:[{journey:'orderConfirmation',name:'shopify_order_confirmation_v1',status:'unavailable',reason:'meta_credentials_expired'}]});
    assert.ok(expired.querySelector('a[href="/app/settings?tab=channels"]'));
    assert.equal(expired.querySelector('[data-testid="authorize-template-setup"]'),null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
