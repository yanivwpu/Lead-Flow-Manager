import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { createInstance } from "i18next";
import { ShoppingActivityView } from "../client/src/components/inbox/ShoppingActivity";
import type { ShoppingState } from "../shared/shoppingAssistant";
import en from "../client/src/locales/en.json";
import es from "../client/src/locales/es.json";
import he from "../client/src/locales/he.json";
import { scheduleTestChatCooldownRefresh } from "../client/src/lib/aiTestChatCooldown";
(globalThis as any).React = React;
test("private diagnostics refresh after cooldown, cancel on close, and never retry a shopping action", t => {
  t.mock.timers.enable({apis:["setTimeout","Date"],now:10000});
  let refreshes=0;
  const cancel=scheduleTestChatCooldownRefresh({inventoryStatus:"cooldown",retryAt:12000},()=>refreshes++);
  t.mock.timers.tick(2099);
  assert.equal(refreshes,0);
  t.mock.timers.tick(1);
  assert.equal(refreshes,1);
  cancel();
  const closed=scheduleTestChatCooldownRefresh({inventoryStatus:"cooldown",retryAt:14000},()=>refreshes++);
  closed();
  scheduleTestChatCooldownRefresh({inventoryStatus:"temporarily_unavailable",retryAt:14000},()=>refreshes++);
  scheduleTestChatCooldownRefresh({inventoryStatus:"ready_to_check",retryAt:14000},()=>refreshes++);
  t.mock.timers.tick(10000);
  assert.equal(refreshes,1);
});
test("Inbox and private console share localized shopping presentation; pending selection shows quantity without a verified price claim", async () => {
  for (const [lng, resource] of Object.entries({ en, es, he })) {
    assert.deepEqual(
      Object.keys(resource.testChat).sort(),
      Object.keys(en.testChat).sort(),
    );
    const i18n = createInstance();
    await i18n.init({ lng, resources: { [lng]: { translation: resource } } });
    const state: Partial<ShoppingState> = {
      version: 1,
      step: "pending",
      quantity: 2,
      selected: {
        productId: "p",
        variantId: "v",
        productTitle: "Snowboard",
        variantTitle: "Ice",
        price: "699.95",
        currency: "USD",
        options: [],
        verifiedAt: new Date().toISOString(),
      },
    };
    const render = () =>
      renderToStaticMarkup(
        <I18nextProvider i18n={i18n}>
          <ShoppingActivityView state={state} />
        </I18nextProvider>,
      );
    let html = render();
    assert.match(html, /Snowboard/);
    assert.match(html, /Ice/);
    assert.match(html, /× 2/);
    assert.doesNotMatch(html, /699.95/);
    assert.ok(html.includes(resource.shopping.steps.pending));
    state.step = "confirming";
    // A reload can return both the offered list and a saved exact selection.
    // Presentation must use the selected result, not stale discovery choices.
    state.choices = [{ ...state.selected!, productId:"other", variantId:"other", productTitle:"Other discovery product" }];
    html = render();
    assert.match(html, /699.95/);
    assert.doesNotMatch(html, /Other discovery product/);
    assert.ok(html.includes(resource.shopping.priceChecked));
    if (lng === "he") assert.match(html, /dir="rtl"/);
  }
});
