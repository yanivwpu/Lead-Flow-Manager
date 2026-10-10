import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { classifyShopifyOwnerEmail, parseShopifySupportContactAction,
  isShopifyContactInstallationActive, shopifyContactCaptureLog } from "../shared/shopifyContactPrivacy";
import { captureShopifyOwnerEmail } from "../server/shopifyContactCapture";
import { shopifyMerchantRedactionPatch, scrubShopifyContactMetadata } from "../shared/shopifyPrivacyRedaction";
import { ShopifySupportContactView } from "../client/src/components/ShopifySupportContactView";
import { sanitizeEmailProviderError } from "../server/email";

const fixtureEmail = ["contact", "example.invalid"].join("@");
const fixtureSynthetic = ["fixture", "shopify.whachatcrm.com"].join("@");

test("capture reports success, missing, invalid and fetch failure without contacts or provider text", async () => {
  for (const item of [
    { raw: fixtureEmail, status: "success" },
    { raw: null, status: "missing" },
    { raw: "", status: "missing" },
    { raw: "not-an-address", status: "invalid" },
    { raw: fixtureSynthetic, status: "invalid" },
  ]) {
    const logs: string[] = [];
    let persisted = false;
    const result = await captureShopifyOwnerEmail({ userId: "fixture", shop: "fixture.myshopify.com", accessToken: "fixture-only" }, {
      fetch: async () => classifyShopifyOwnerEmail(item.raw),
      persist: async (_input, value, at) => {
        persisted = true; assert.equal(value.status, item.status); assert.equal(at.toISOString(), "2026-10-10T12:00:00.000Z");
        return true;
      },
      emit: line => logs.push(line), now: () => new Date("2026-10-10T12:00:00Z"),
    });
    assert.equal(result.status, item.status);
    assert.ok(persisted);
    assert.ok(!logs.join("").includes(fixtureEmail));
    assert.ok(!logs.join("").includes("fixture.myshopify.com"));
    assert.equal(JSON.parse(logs[0]).source, "shop.email");
  }
  for (const failure of ["fetch", "persist", "inactive"]) {
    const logs: string[] = [];
    const result = await captureShopifyOwnerEmail({ userId: "fixture", shop: "fixture.myshopify.com", accessToken: "fixture-only" }, {
      fetch: async () => { if (failure === "fetch") throw new Error(fixtureEmail); return classifyShopifyOwnerEmail(fixtureEmail); },
      persist: async () => { if (failure === "persist") throw new Error(fixtureEmail); return failure !== "inactive"; },
      emit: line => logs.push(line),
    });
    assert.equal(result.status, failure === "fetch" ? "fetch_failed" : failure === "persist" ? "persist_failed" : "installation_inactive");
    assert.ok(result.email === null);
    assert.ok(!logs.join("").includes(fixtureEmail));
  }
});

test("support actions reject invalid/synthetic emails and drop arbitrary identity and marketing fields", () => {
  const parsed = parseShopifySupportContactAction({ action: "confirm", email: fixtureEmail, marketingConsent: true, shop: "other.myshopify.com" });
  assert.ok(parsed?.action === "confirm" && parsed.email === fixtureEmail);
  assert.ok(parsed && !("marketingConsent" in parsed) && !("shop" in parsed));
  for (const email of ["invalid", fixtureSynthetic, "x ".repeat(200)]) assert.ok(parseShopifySupportContactAction({ action: "confirm", email }) === null);
  assert.equal(parseShopifySupportContactAction({ action: "dismiss" })?.action, "dismiss");
  assert.equal(parseShopifySupportContactAction({ action: "remove" })?.action, "remove");
});

test("uninstall and redaction stop capture/contact use; reinstall can use retained data without touching trial", () => {
  const user = { shopifyShop: "fixture.myshopify.com", shopifyAccessToken: "fixture-only", shopifySubscriptionStatus: "pending" };
  assert.ok(isShopifyContactInstallationActive(user));
  assert.ok(!isShopifyContactInstallationActive({ ...user, shopifyAccessToken: null, shopifySubscriptionStatus: "uninstalled" }));
  assert.ok(!isShopifyContactInstallationActive({ ...user, shopifySubscriptionStatus: "redacted" }));
  assert.ok(!isShopifyContactInstallationActive({ ...user, deletionRequestedAt: new Date() }));
  assert.ok(isShopifyContactInstallationActive({ ...user, shopifySubscriptionStatus: "active" }));
  const patch = shopifyMerchantRedactionPatch({ email: fixtureEmail }, fixtureSynthetic);
  assert.ok(patch.shopifyOwnerEmail === null && patch.shopifyInstalledAt === null);
  for (const key of ["email", "name", "billingPlan", "subscriptionPlan", "trialStartedAt", "trialEndsAt", "trialStatus"]) assert.ok(!(key in patch));
  const syntheticPatch = shopifyMerchantRedactionPatch({ email: fixtureSynthetic }, "neutral");
  assert.ok(syntheticPatch.email === "neutral");
  const scrubbed = scrubShopifyContactMetadata({ shopifyCustomerId: "1", customNote: "independent",
    lastCommerceSource: "shopify", lastCommerceMetadata: { email: fixtureEmail }, commerceThreadKey: fixtureEmail }, user.shopifyShop);
  assert.equal(Object.keys(scrubbed).join(","), "customNote");
});

test("optional UI explains support purpose separately from marketing and never blocks Inbox", () => {
  for (const language of ["en", "es", "he"]) {
    const html = renderToStaticMarkup(<ShopifySupportContactView language={language} expanded email="" suggested={false}
      confirmed={false} manage={false} pending={false} failed={false} onOpen={() => {}} onClose={() => {}}
      onEmail={() => {}} onSave={() => {}} onSkip={() => {}} onRemove={() => {}} />);
    assert.ok(html.includes('type="email"'));
    assert.ok(!html.includes('type="checkbox"'));
    assert.ok(!html.includes("/pricing"));
    if (language === "en") { assert.ok(html.includes("does not subscribe you to marketing")); assert.ok(html.includes("Skip")); }
  }
});

test("log metadata has only allowed fields and provider error sanitizer removes email text", () => {
  assert.equal(Object.keys(JSON.parse(shopifyContactCaptureLog("success", new Date()))).sort().join(","), "at,event,source,status,tag");
  assert.ok(!sanitizeEmailProviderError("failure: " + fixtureEmail).includes(fixtureEmail));
});
