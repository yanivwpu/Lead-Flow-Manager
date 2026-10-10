import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { shopifyMerchantNeedsPlanSelection } from "../shared/shopifyLaunchRouting";
import {
  resolveShopifyOnboardingState, shopifyInstallDestination,
  parseShopifyActivationEvent, isEarlyShopifyUninstall,
} from "../shared/shopifyOnboarding";
import { getShopifyBootstrapContext, resolveShopifyBootstrapDestination } from "../client/src/lib/shopifyBootstrap";
import { getUpgradeNavigationPath } from "../client/src/lib/proAiTrialState";
import { ShopifyStartView } from "../client/src/components/ShopifyStartView";

const base = { shopifyShop: "eligible.myshopify.com", shopifyAccessToken: "test-token",
  shopifySubscriptionStatus: "pending", billingPlan: "free", subscriptionStatus: "active" };
const active = { ...base, trialStatus: "active", trialPlan: "pro_ai",
  trialEndsAt: new Date(Date.now() + 86400000).toISOString() };
const ready = { ledgerReady: true, ledgerStatus: null, userEligible: true };

test("first install with valid trial reaches guided start without a paid plan gate", () => {
  assert.equal(shopifyMerchantNeedsPlanSelection(active, { isFreshInstallRedirect: true }), false);
  const snapshot = resolveShopifyOnboardingState(active, ready);
  assert.equal(snapshot.state, "trial_active");
  assert.equal(shopifyInstallDestination(snapshot.state, true), "/shopify/start");
  assert.equal(shopifyInstallDestination(snapshot.state, false), "/app/inbox");
});

test("existing and paid installs keep app access; used trial requires a plan", () => {
  for (const plan of ["starter", "pro"]) {
    const paid = { ...base, billingPlan: plan, shopifySubscriptionStatus: "active" };
    assert.equal(resolveShopifyOnboardingState(paid, ready).state, "app_ready");
    assert.equal(shopifyMerchantNeedsPlanSelection(paid, { isFreshInstallRedirect: true }), false);
    assert.equal(shopifyInstallDestination("app_ready", true), "/app/inbox");
  }
  const expired = { ...active, trialStatus: "expired", trialEndsAt: "2020-01-01T00:00:00Z" };
  assert.equal(resolveShopifyOnboardingState(expired, { ...ready, ledgerStatus: "granted", userEligible: false }).state, "plan_required");
  assert.equal(shopifyInstallDestination("plan_required", true), "/pricing");
});

test("provisioning failures never masquerade as an active trial", () => {
  assert.equal(resolveShopifyOnboardingState(base, { ...ready, ledgerReady: false }).state, "recovery_required");
  assert.equal(resolveShopifyOnboardingState(base, ready).state, "recovery_required");
  assert.equal(resolveShopifyOnboardingState(base, { ...ready, ledgerStatus: "blocked_unknown_history" }).state, "support_required");
  assert.equal(resolveShopifyOnboardingState({ ...active, trialEndsAt: "invalid" }, ready).state, "recovery_required");
});

test("uninstalled and disconnected stores must reconnect; reinstall keeps original end date", () => {
  assert.equal(resolveShopifyOnboardingState({ ...active, shopifyAccessToken: null }, ready).state, "reconnect_required");
  assert.equal(resolveShopifyOnboardingState({ ...active, shopifySubscriptionStatus: "uninstalled" }, ready).state, "reconnect_required");
  assert.equal(resolveShopifyOnboardingState(active, { ...ready, ledgerStatus: "granted", userEligible: false }).trialEndsAt, active.trialEndsAt);
});

test("guided view renders usable actions, voluntary pricing, and honest error states", () => {
  const view = (state: any, loading = false) => renderToStaticMarkup(React.createElement(ShopifyStartView, {
    snapshot: state ? { state } : null, loading, busy: false, failed: false,
    onRetry() {}, onRefresh() {},
  }));
  const activeHtml = view("trial_active");
  assert.match(activeHtml, /Your 14-day Pro \+ AI trial is active/);
  assert.match(activeHtml, /Connect a channel/);
  assert.match(activeHtml, /href="\/app\/inbox"/);
  assert.match(activeHtml, /href="\/pricing"/);
  assert.match(activeHtml, /No paid plan selection is needed/);
  for (const state of ["recovery_required", "support_required", "reconnect_required", "plan_required"]) {
    const html = view(state);
    assert.doesNotMatch(html, /Your 14-day Pro \+ AI trial is active/);
    assert.doesNotMatch(html, /Enter Inbox/);
  }
  assert.match(view("recovery_required"), /Try again/);
  assert.match(view("support_required"), /Contact support/);
  assert.match(view("reconnect_required"), /Open Shopify admin/);
  assert.match(view(null, true), /role="status"/);
});

test("telemetry accepts only bounded milestones and strips arbitrary data", () => {
  assert.deepEqual(parseShopifyActivationEvent({
    event: "first_successful_render", page: "start", email: "private@example.com", url: "secret",
  }), { event: "first_successful_render", page: "start" });
  assert.equal(parseShopifyActivationEvent({ event: "trial_activated", page: "start" }), null);
  assert.equal(parseShopifyActivationEvent({ event: "first_channel_setup", page: "private-url" }), null);
  const now = new Date("2026-10-09T01:41:00Z");
  assert.equal(isEarlyShopifyUninstall("2026-10-09T01:37:00Z", now), true);
  assert.equal(isEarlyShopifyUninstall("2026-10-09T01:00:00Z", now), false);
  assert.equal(isEarlyShopifyUninstall("invalid", now), false);
  assert.equal(isEarlyShopifyUninstall("2026-10-09T02:00:00Z", now), false);
});

test("guided start clears stale pricing, legacy callbacks route to start, and voluntary pricing stays accessible", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key) };
  const original = (globalThis as any).sessionStorage;
  (globalThis as any).sessionStorage = storage;
  try {
    const legacy = getShopifyBootstrapContext("/pricing", "?shopify_installed=1&shop=eligible.myshopify.com");
    assert.equal(legacy.active, true);
    assert.equal(resolveShopifyBootstrapDestination(legacy, true, false, false), "/shopify/start");
    values.set("whachatcrm_shopify_post_install_pricing", "/pricing?shopify_installed=1");
    assert.equal(getShopifyBootstrapContext("/shopify/start", "").active, false);
    assert.equal(values.size, 0);
    const pricingPath = getUpgradeNavigationPath({ isShopify: true, shopHint: base.shopifyShop });
    assert.match(pricingPath, /shopify_pricing=1/);
    assert.doesNotMatch(pricingPath, /shopify_installed/);
    const [path, search] = pricingPath.split("?");
    assert.equal(getShopifyBootstrapContext(path, "?" + search).active, false);
  } finally { (globalThis as any).sessionStorage = original; }
});
