import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ShopifyRecoveryConsentDisclosure } from "../client/src/components/integrations/ShopifyRecoveryConsentDisclosure";

test("disclosure is confined to the connected test merchant on staging", () => {
  for (const [hostname, shop] of [
    ["app.whachatcrm.com", "whachatcrm.myshopify.com"],
    ["whachatcrm-staging-app-staging.up.railway.app", "other.myshopify.com"],
    ["whachatcrm-staging-app-staging.up.railway.app", null],
  ]) {
    assert.equal(renderToStaticMarkup(<ShopifyRecoveryConsentDisclosure hostname={hostname!} shop={shop} />), "");
  }
});

test("test recipient sees merchant, channel, purpose, frequency, optional choice and STOP before opt-in", () => {
  const html = renderToStaticMarkup(<ShopifyRecoveryConsentDisclosure
    hostname="whachatcrm-staging-app-staging.up.railway.app" shop="whachatcrm.myshopify.com" />);
  for (const phrase of ["whachatcrm.myshopify.com", "WhatsApp messages", "unfinished checkout",
    "one reminder", "Consent is optional and not required to buy", "Message and data rates may apply",
    "Reply STOP to opt out", "YES WHATSAPP CHECKOUT REMINDERS", "Reading this notice does not opt you in"]) {
    assert.ok(html.includes(phrase), phrase);
  }
  assert.ok(html.indexOf("By opting in") < html.indexOf("YES WHATSAPP CHECKOUT REMINDERS"));
  assert.doesNotMatch(html, /<(?:form|button|input)\b/);
});
