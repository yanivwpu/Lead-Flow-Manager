import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ShopifyStartView } from "../client/src/components/ShopifyStartView";
import { shopifyInstallDestination } from "../shared/shopifyOnboarding";

test("new trial and paid Shopify installs lead to a single self-serve Shopify setup", () => {
  for (const state of ["trial_active", "app_ready"] as const) {
    const html=renderToStaticMarkup(React.createElement(ShopifyStartView,{
      snapshot:{state}, loading:false,busy:false,failed:false,
      onRetry(){},onRefresh(){}
    }));
    assert.match(html,/href="\/app\/integrations\?setup=shopify"[^>]*data-testid="shopify-first-use-setup"/);
    assert.match(html,/>Set up Shopify<\/a>/);
    assert.match(html,/<details/);
    assert.match(html,/Connect messaging \(optional\)/);
    assert.doesNotMatch(html,/abandoned.cart|customer messages will be sent|Start campaign/i);
    assert.equal(shopifyInstallDestination(state,true),"/shopify/start");
    assert.equal(shopifyInstallDestination(state,false),"/app/inbox");
  }
});

test("unauthorized or payment-required states never receive setup activation links",()=>{
  for(const state of ["plan_required","support_required","reconnect_required","recovery_required"] as const){
    const html=renderToStaticMarkup(React.createElement(ShopifyStartView,{
      snapshot:{state},loading:false,busy:false,failed:false,onRetry(){},onRefresh(){}
    }));
    assert.doesNotMatch(html,/\/app\/integrations\?setup=shopify/);
    assert.doesNotMatch(html,/>Set up Shopify<\/a>/);
  }
});

test("one fixed setup link opens the existing Shopify manager only after account state loads",()=>{
  const page=readFileSync("client/src/pages/Integrations.tsx","utf8");
  const start=page.indexOf("The post-install welcome action opens the existing Shopify manager directly.");
  const end=page.indexOf("const shopifyConnected =",start);
  assert.ok(start>=0 && end>start);
  const effect=page.slice(start,end);
  assert.match(effect,/shopifySetupLinkHandled.current/);
  assert.match(effect,/!user\?\.id \|\| !sessionAligned/);
  assert.match(effect,/shopifyStatusFetching \|\| !shopifyStatus/);
  assert.match(effect,/URLSearchParams\(window.location.search\)\.get\("setup"\) !== "shopify"/);
  assert.match(effect,/shopifyStatus.connected/);
  assert.match(effect,/setManageIntegrationId\("shopify"\)/);
  assert.match(effect,/setShowShopifyInfo\(true\)/);
  assert.doesNotMatch(effect,/location\.assign|fetch\(|POST|setInternalTasks|startOrderSupport/);
  assert.match(page,/enabled: !!user\?\.id && sessionAligned && \(!!integrationsEnabled \|\| !!user\?\.shopifyShop\)/);
});
