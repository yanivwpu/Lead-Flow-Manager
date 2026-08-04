/**
 * AI Brain Live Business Data — Phase 1 decision model + prompt guards.
 * Run: npx tsx --test tests/ai-live-business-data.test.ts
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  LIVE_BUSINESS_DATA_REGISTRY,
  buildLiveBusinessDataPromptBlock,
  extractPackageNameHint,
  resolveLiveBusinessDataDecision,
} from "../shared/aiLiveBusinessData";
import {
  findBestPackageByName,
  formatBusinessPackageSummary,
  scorePackageNameMatch,
  type BusinessPackageRecord,
} from "../shared/businessPackages";

test("registry exposes expected Phase 1 providers", () => {
  const ids = LIVE_BUSINESS_DATA_REGISTRY.map((p) => p.id);
  assert.deepEqual(ids, [
    "websiteKnowledge",
    "businessPackages",
    "shopify",
    "mls",
    "calendar",
    "inventory",
  ]);
  const offers = LIVE_BUSINESS_DATA_REGISTRY.find((p) => p.id === "businessPackages");
  assert.equal(offers?.name, "Offers & Payment Links");
});

test("business hours → knowledge only", () => {
  const d = resolveLiveBusinessDataDecision({ message: "What are your business hours?" });
  assert.equal(d.needsKnowledge, true);
  assert.equal(d.needsLiveBusinessData, false);
  assert.deepEqual(d.providerIds, []);
});

test("featured business package → knowledge + businessPackages", () => {
  const d = resolveLiveBusinessDataDecision({
    message: "Tell me about your Featured Business package.",
    subIntents: ["pricing_question"],
  });
  assert.equal(d.needsKnowledge, true);
  assert.equal(d.needsLiveBusinessData, true);
  assert.ok(d.providerIds.includes("businessPackages"));
});

test("waterfront home → MLS", () => {
  const d = resolveLiveBusinessDataDecision({
    message: "Find me a 4-bedroom waterfront home.",
  });
  assert.equal(d.needsLiveBusinessData, true);
  assert.ok(d.providerIds.includes("mls"));
  assert.equal(d.needsKnowledge, false);
});

test("waterproof backpacks → Shopify", () => {
  const d = resolveLiveBusinessDataDecision({
    message: "Do you have waterproof backpacks?",
  });
  assert.equal(d.needsLiveBusinessData, true);
  assert.ok(d.providerIds.includes("shopify"));
  assert.equal(d.needsKnowledge, false);
});

test("schedule → calendar", () => {
  const d = resolveLiveBusinessDataDecision({
    message: "When can I schedule?",
    subIntents: ["booking_question"],
  });
  assert.equal(d.needsLiveBusinessData, true);
  assert.ok(d.providerIds.includes("calendar"));
});

test("extractPackageNameHint finds Featured Business", () => {
  const hint = extractPackageNameHint("Tell me about your Featured Business package.");
  assert.ok(hint);
  assert.match(hint!, /featured\s+business/i);
});

test("package name matching prefers Featured Business", () => {
  const packages: BusinessPackageRecord[] = [
    {
      packageId: "a",
      displayName: "Starter",
      priceDisplay: "USD 29 per month",
      benefits: ["Basic listing"],
      checkoutUrl: null,
      onboardingUrl: null,
      availability: "available",
      status: "available",
    },
    {
      packageId: "b",
      displayName: "Featured Business",
      priceDisplay: "$99/mo",
      benefits: ["Homepage placement"],
      checkoutUrl: "https://buy.stripe.com/featured",
      onboardingUrl: "https://example.com/onboard",
      availability: "available",
      status: "available",
    },
  ];
  assert.ok(scorePackageNameMatch("Featured Business", "Featured Business") >= 80);
  const best = findBestPackageByName(packages, "Featured Business package");
  assert.equal(best?.packageId, "b");
  const summary = formatBusinessPackageSummary(best!);
  assert.match(summary, /Featured Business/);
  assert.match(summary, /Checkout:/);
});

test("prompt block never dumps unbounded catalogs and labels LIVE BUSINESS DATA", () => {
  const block = buildLiveBusinessDataPromptBlock([
    {
      providerId: "businessPackages",
      recordType: "offer",
      summary: "Featured Business | Price: $99/mo | Checkout: https://buy.stripe.com/x",
      data: { packageId: "offer-1", checkoutUrl: "https://buy.stripe.com/x" },
    },
  ]);
  assert.ok(block.text.includes("LIVE BUSINESS DATA"));
  assert.ok(block.text.includes("human approval"));
  assert.ok(block.text.includes("Do not invent"));
  assert.equal(block.recordCount, 1);
});

test("empty live records produce empty prompt block (no stuffing)", () => {
  const block = buildLiveBusinessDataPromptBlock([]);
  assert.equal(block.text, "");
  assert.equal(block.recordCount, 0);
});
