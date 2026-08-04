/**
 * Workspace Offers & Payment Links — structured Business Packages source of truth.
 * Run: npx tsx --test tests/workspace-offers.test.ts
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLiveBusinessDataPromptBlock,
  resolveLiveBusinessDataDecision,
} from "../shared/aiLiveBusinessData";
import {
  draftContainsCheckoutUrl,
  formatOfferLiveSummary,
  isLikelyStripePriceId,
  messageHasPurchaseIntent,
  offerToBusinessPackage,
  PAYMENT_LINK_HUMAN_APPROVAL_REASON,
  selectRelevantOffers,
  validateCheckoutUrl,
} from "../shared/workspaceOffers";
import {
  isWorkspaceOffersAdminRole,
  resolveWorkspaceOffersAdminAccess,
} from "../server/workspaceOffers/offerAccess";
import { excludeFactTypesFromGrounding } from "../server/websiteKnowledge/factContext";
import type { TurnGrounding } from "../server/websiteKnowledge/factContext";

const FEATURED = {
  id: "offer-featured",
  userId: "ws-a",
  internalName: "featured-business",
  displayName: "Featured Business",
  description: null as string | null,
  benefits: ["Homepage placement", "Priority support"],
  priceDisplay: "$99/mo",
  billingCadence: "month" as const,
  checkoutUrl: "https://buy.stripe.com/test_featured",
  followUpUrl: "https://example.com/onboard/featured",
  availability: "available" as const,
  active: true,
  sortOrder: 1,
  category: "Advertising",
  tags: ["featured", "business"],
  aiGuidance: null as string | null,
  archivedAt: null as string | null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const LISTING = {
  ...FEATURED,
  id: "offer-listing",
  internalName: "business-listing",
  displayName: "Business Listing",
  priceDisplay: "$29/mo",
  checkoutUrl: "https://buy.stripe.com/test_listing",
  sortOrder: 0,
  tags: ["listing"],
};

const INACTIVE = {
  ...FEATURED,
  id: "offer-inactive",
  displayName: "Retired Plan",
  active: false,
  checkoutUrl: "https://buy.stripe.com/test_retired",
};

test("HTTPS checkout accepted; Stripe price_ id rejected", () => {
  assert.equal(validateCheckoutUrl("https://buy.stripe.com/abc").ok, true);
  assert.equal(validateCheckoutUrl("http://example.com/pay").ok, false);
  assert.equal(isLikelyStripePriceId("price_1ABC"), true);
  assert.equal(validateCheckoutUrl("price_1ABC").ok, false);
  assert.equal(validateCheckoutUrl(null).ok, true);
  assert.equal(validateCheckoutUrl(null).url, null);
});

test("active/inactive filtering via selectRelevantOffers", () => {
  const selected = selectRelevantOffers(
    [FEATURED, LISTING, INACTIVE],
    "Tell me about Featured Business",
    "Featured Business",
    5,
  );
  assert.ok(selected.every((o) => o.active));
  assert.ok(!selected.some((o) => o.id === "offer-inactive"));
  assert.equal(selected[0].displayName, "Featured Business");
});

test("exact checkout URL surfaces on purchase intent; missing URL never invented", () => {
  assert.equal(messageHasPurchaseIntent("I'm ready to buy the Featured Business package"), true);
  const pkg = offerToBusinessPackage(FEATURED);
  assert.equal(pkg.checkoutUrl, "https://buy.stripe.com/test_featured");
  const noCheckout = offerToBusinessPackage({ ...FEATURED, checkoutUrl: null });
  assert.equal(noCheckout.checkoutUrl, null);
  const summary = formatOfferLiveSummary({ ...FEATURED, checkoutUrl: null });
  assert.match(summary, /do not invent a payment link/i);
});

test("relevant-offer retrieval without full-catalog stuffing", () => {
  const many = Array.from({ length: 20 }, (_, i) => ({
    ...LISTING,
    id: `offer-${i}`,
    displayName: `Offer ${i}`,
    sortOrder: i,
    tags: [],
  }));
  const selected = selectRelevantOffers(many, "What packages do you offer?", null, 5);
  assert.ok(selected.length <= 5);
  const records = selected.map((o) => ({
    providerId: "businessPackages" as const,
    recordType: "offer",
    summary: formatOfferLiveSummary(o),
    data: { ...offerToBusinessPackage(o) },
  }));
  const block = buildLiveBusinessDataPromptBlock(records);
  assert.ok(block.recordCount <= 5);
  assert.ok(!block.text.includes("Offer 19") || selected.some((o) => o.displayName === "Offer 19"));
  // Cap means not all 20 appear
  assert.ok(selected.length < 20);
});

test("structured offer overrides conflicting pricing facts in grounding", () => {
  const grounding = {
    retrieved: [
      {
        fact: {
          id: "f1",
          factKey: "pricing_plan:featured-business",
          factType: "pricing_plan",
          data: { name: "Featured Business", price: { amount: 1, currency: "USD", billingPeriod: "month" } },
        },
        freshness: { tier: "fresh", ttlDays: 30, ageDays: 1 },
        score: 1,
        reason: "test",
      },
      {
        fact: {
          id: "f2",
          factKey: "faq:hours",
          factType: "faq",
          data: { question: "Hours?", answer: "9-5" },
        },
        freshness: { tier: "fresh", ttlDays: 30, ageDays: 1 },
        score: 1,
        reason: "test",
      },
    ],
    block: { text: "facts", factCount: 2, staleFactCount: 0, coveredTypes: ["pricing_plan", "faq"] },
    conflictingKeys: [],
  } as unknown as TurnGrounding;

  const stripped = excludeFactTypesFromGrounding(grounding, ["pricing_plan"]);
  assert.equal(stripped.retrieved.length, 1);
  assert.equal(stripped.retrieved[0].fact.factType, "faq");
});

test("draft payment-link detection requires human approval reason", () => {
  const draft = `Featured Business is $99/mo. Checkout: ${FEATURED.checkoutUrl}`;
  assert.equal(draftContainsCheckoutUrl(draft, [FEATURED.checkoutUrl]), true);
  assert.equal(draftContainsCheckoutUrl("Just the price is $99/mo", [FEATURED.checkoutUrl]), false);
  assert.equal(PAYMENT_LINK_HUMAN_APPROVAL_REASON, "payment_link_requires_human_approval");
});

test("pricing question still routes to businessPackages provider", () => {
  const d = resolveLiveBusinessDataDecision({
    message: "How much is Featured Business?",
    subIntents: ["pricing_question"],
  });
  assert.ok(d.providerIds.includes("businessPackages"));
  assert.equal(d.needsKnowledge, true);
});

test("admin authorization: owner/admin roles only; members denied", () => {
  assert.equal(isWorkspaceOffersAdminRole("owner"), true);
  assert.equal(isWorkspaceOffersAdminRole("admin"), true);
  assert.equal(isWorkspaceOffersAdminRole("member"), false);
  assert.equal(
    resolveWorkspaceOffersAdminAccess({ actorUserId: "ws-a", workspaceUserId: "ws-a" }),
    true,
  );
  assert.equal(
    resolveWorkspaceOffersAdminAccess({
      actorUserId: "member-b",
      workspaceUserId: "owner-a",
      membershipRole: "member",
    }),
    false,
  );
  assert.equal(
    resolveWorkspaceOffersAdminAccess({
      actorUserId: "admin-b",
      workspaceUserId: "owner-a",
      membershipRole: "admin",
    }),
    true,
  );
});

test("tenant isolation: different workspace ids without admin role denied", () => {
  assert.equal(
    resolveWorkspaceOffersAdminAccess({
      actorUserId: "ws-a",
      workspaceUserId: "ws-b",
      membershipRole: null,
    }),
    false,
  );
});