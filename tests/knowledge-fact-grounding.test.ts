/**
 * The factual-grounding contract and fact retrieval.
 *
 * Covers requirement 17 (draft facts never reach live AI), 23 (unsupported exact claims are
 * rejected), 24 (a missing fact produces no invented value), and the three approved
 * additions: the priority hierarchy, freshness metadata, and the shared answer-first rule.
 *
 * Run: npx tsx tests/knowledge-fact-grounding.test.ts
 */
import assert from "node:assert/strict";
import {
  FACT_PRECEDENCE,
  factFreshness,
  factKey,
  factPrecedence,
  resolveStaleFactBehavior,
  summarizeKnowledgeFreshness,
  type FactOrigin,
  type FactType,
  type KnowledgeFact,
} from "../shared/businessKnowledgeFacts";
import {
  RESPONSE_COMPOSITION_RULES,
  VERIFIED_FACTS_HEADER,
  buildGroundedPromptBlock,
  validateGroundedClaims,
} from "../shared/factGrounding";
import {
  hasCoverageGap,
  retrieveFactsForTurn,
} from "../shared/knowledgeRetrieval";
import { deriveSubIntents } from "../shared/aiRouting";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

const NOW = new Date("2026-08-02T12:00:00.000Z");

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function fact(
  factType: FactType,
  data: unknown,
  overrides: Partial<KnowledgeFact> = {},
): KnowledgeFact {
  const key = overrides.factKey ?? factKey(factType, data);
  return {
    id: overrides.id ?? `fact-${key}`,
    factType,
    factKey: key,
    data,
    state: overrides.state ?? "published",
    proposedAction: overrides.proposedAction ?? null,
    origin: (overrides.origin ?? "website_verified") as FactOrigin,
    confidence: overrides.confidence ?? 0.9,
    isPinned: overrides.isPinned ?? false,
    userEdited: overrides.userEdited ?? false,
    conflictGroup: null,
    conflictResolution: null,
    supersededByFactId: null,
    sourceId: overrides.sourceId ?? "src-1",
    sourceUrl: overrides.sourceUrl ?? "https://example.test/pricing",
    sourceTitle: overrides.sourceTitle ?? "Pricing",
    excerpt: overrides.excerpt ?? null,
    provenance: overrides.provenance ?? [],
    firstSeenAt: daysAgo(30),
    lastVerifiedAt: overrides.lastVerifiedAt ?? daysAgo(1),
    publishedAt: overrides.publishedAt ?? daysAgo(1),
    retiredAt: null,
  };
}

const BUSINESS_LISTING = fact("pricing_plan", {
  name: "Business Listing",
  description: null,
  price: { amount: 29, currency: "USD", billingPeriod: "month" },
  priceQualifier: "exact",
  benefits: [
    "Business profile page",
    "Category listing",
    "Website, phone, and map",
    "Local SEO visibility",
    "Be found by people exploring Northgate",
  ],
});

const HOURS = fact("business_hours", {
  entries: [{ days: "Monday–Friday", opens: "09:00", closes: "17:00" }],
  timezone: null,
  notes: null,
});

// --- 17. Draft facts never reach live AI -------------------------------------

run("a draft fact is invisible to retrieval", () => {
  const draft = fact(
    "pricing_plan",
    {
      name: "Business Listing",
      description: null,
      price: { amount: 99, currency: "USD", billingPeriod: "month" },
      priceQualifier: "exact",
      benefits: [],
    },
    { id: "fact-draft", state: "draft", proposedAction: "update" },
  );

  const retrieved = retrieveFactsForTurn({
    facts: [BUSINESS_LISTING, draft],
    message: "how much is the business listing?",
    subIntents: ["pricing_question"],
    now: NOW,
  });

  assert.ok(retrieved.every((r) => r.fact.state === "published"));
  const block = buildGroundedPromptBlock(retrieved);
  assert.ok(block.text.includes("USD 29 per month"));
  assert.ok(!block.text.includes("99"), "an unpublished price must never enter the prompt");
});

run("a retired fact is invisible to retrieval", () => {
  const retired = fact("pricing_plan", { name: "Old Plan", description: null, price: { amount: 9, currency: "USD", billingPeriod: "month" }, priceQualifier: "exact", benefits: [] }, { state: "retired" });
  const retrieved = retrieveFactsForTurn({
    facts: [retired],
    message: "pricing?",
    subIntents: ["pricing_question"],
    now: NOW,
  });
  assert.equal(retrieved.length, 0);
});

// --- Sub-intent routing -------------------------------------------------------

run("the new sub-intents are detected", () => {
  assert.deepEqual(deriveSubIntents("what are your opening hours?"), ["hours_question"]);
  assert.deepEqual(deriveSubIntents("where are you located?"), ["location_question"]);
  assert.deepEqual(deriveSubIntents("what is your refund policy?"), ["policy_question"]);
  assert.deepEqual(deriveSubIntents("how do i book a call?"), ["booking_question"]);
});

run("retrieval routes an hours question to the hours fact, not the price", () => {
  const retrieved = retrieveFactsForTurn({
    facts: [BUSINESS_LISTING, HOURS],
    message: "what time do you open?",
    subIntents: ["hours_question"],
    now: NOW,
    limit: 1,
  });
  assert.equal(retrieved[0].fact.factType, "business_hours");
});

// --- Priority hierarchy -------------------------------------------------------

run("the priority hierarchy is ordered as approved", () => {
  assert.ok(FACT_PRECEDENCE.user_edited > FACT_PRECEDENCE.pinned);
  assert.ok(FACT_PRECEDENCE.pinned > FACT_PRECEDENCE.website_verified);
  assert.ok(FACT_PRECEDENCE.website_verified > FACT_PRECEDENCE.document);
  assert.ok(FACT_PRECEDENCE.document > FACT_PRECEDENCE.integration);
  assert.ok(FACT_PRECEDENCE.integration > FACT_PRECEDENCE.ai_extracted);
  assert.ok(FACT_PRECEDENCE.ai_extracted > FACT_PRECEDENCE.legacy_summary);
});

run("the fact cap keeps the user-edited value over an AI-extracted one", () => {
  const aiVersion = fact(
    "pricing_plan",
    {
      name: "Featured Listing",
      description: null,
      price: { amount: 99, currency: "USD", billingPeriod: "month" },
      priceQualifier: "exact",
      benefits: [],
    },
    { id: "fact-ai", origin: "ai_extracted", lastVerifiedAt: daysAgo(0) },
  );
  const userVersion = fact(
    "pricing_plan",
    {
      name: "Business Listing",
      description: null,
      price: { amount: 29, currency: "USD", billingPeriod: "month" },
      priceQualifier: "exact",
      benefits: [],
    },
    { id: "fact-user", origin: "user_edited", userEdited: true, lastVerifiedAt: daysAgo(120) },
  );

  const retrieved = retrieveFactsForTurn({
    facts: [aiVersion, userVersion],
    message: "how much does a listing cost?",
    subIntents: ["pricing_question"],
    now: NOW,
    limit: 1,
  });
  assert.equal(retrieved[0].fact.id, "fact-user", "priority must beat recency at the cap");
  assert.equal(factPrecedence(retrieved[0].fact), FACT_PRECEDENCE.user_edited);
});

// --- Freshness ----------------------------------------------------------------

run("freshness tiers follow the per-type TTL", () => {
  assert.equal(factFreshness({ factType: "pricing_plan", lastVerifiedAt: daysAgo(3) }, NOW).tier, "fresh");
  const ttl = factFreshness({ factType: "pricing_plan", lastVerifiedAt: daysAgo(3) }, NOW).ttlDays;
  assert.equal(factFreshness({ factType: "pricing_plan", lastVerifiedAt: daysAgo(ttl + 1) }, NOW).tier, "aging");
  assert.equal(factFreshness({ factType: "pricing_plan", lastVerifiedAt: daysAgo(ttl * 2 + 1) }, NOW).tier, "stale");
});

run("critical fact types escalate when stale", () => {
  assert.equal(resolveStaleFactBehavior("pricing_plan"), "escalate");
  assert.equal(resolveStaleFactBehavior("business_summary"), "caution");
});

run("a stale fact enters the prompt with an explicit out-of-date marker", () => {
  const stale = fact(
    "pricing_plan",
    {
      name: "Business Listing",
      description: null,
      price: { amount: 29, currency: "USD", billingPeriod: "month" },
      priceQualifier: "exact",
      benefits: [],
    },
    { lastVerifiedAt: daysAgo(400) },
  );
  const retrieved = retrieveFactsForTurn({
    facts: [stale],
    message: "price?",
    subIntents: ["pricing_question"],
    now: NOW,
  });
  const block = buildGroundedPromptBlock(retrieved);
  assert.equal(block.staleFactCount, 1);
  assert.match(block.text, /OUT OF DATE/);
});

run("the freshness summary counts every tier and both ends of the range", () => {
  const summary = summarizeKnowledgeFreshness(
    [
      { factType: "pricing_plan", lastVerifiedAt: daysAgo(1) },
      { factType: "pricing_plan", lastVerifiedAt: daysAgo(400) },
    ],
    NOW,
  );
  assert.equal(summary.total, 2);
  assert.equal(summary.fresh, 1);
  assert.equal(summary.stale, 1);
  assert.ok(summary.oldestVerifiedAt! < summary.newestVerifiedAt!);
});

// --- The shared answer-first rule ---------------------------------------------

run("the prompt block carries the shared composition rules", () => {
  const retrieved = retrieveFactsForTurn({
    facts: [BUSINESS_LISTING],
    message: "how much?",
    subIntents: ["pricing_question"],
    now: NOW,
  });
  const block = buildGroundedPromptBlock(retrieved);
  assert.ok(block.text.startsWith(VERIFIED_FACTS_HEADER));
  assert.ok(block.text.includes(RESPONSE_COMPOSITION_RULES));
  assert.match(RESPONSE_COMPOSITION_RULES, /^ANSWER WITH VERIFIED FACTS FIRST, THEN QUALIFY\./);
});

run("every published benefit reaches the prompt verbatim", () => {
  const retrieved = retrieveFactsForTurn({
    facts: [BUSINESS_LISTING],
    message: "what do I get with the business listing?",
    subIntents: ["benefits_question", "pricing_question"],
    now: NOW,
  });
  const block = buildGroundedPromptBlock(retrieved);
  for (const benefit of (BUSINESS_LISTING.data as { benefits: string[] }).benefits) {
    assert.ok(block.text.includes(benefit), `missing benefit in prompt: ${benefit}`);
  }
  assert.ok(!block.text.toLowerCase().includes("basic visibility"));
});

// --- 23. Unsupported exact claims are rejected --------------------------------

run("a reply quoting a price no fact supports is a violation", () => {
  const retrieved = retrieveFactsForTurn({
    facts: [BUSINESS_LISTING],
    message: "how much is it?",
    subIntents: ["pricing_question"],
    now: NOW,
  });
  const check = validateGroundedClaims({
    draft: "Our Business Listing is $49/month and includes a profile page.",
    retrieved,
  });
  assert.equal(check.ok, false);
  assert.ok(check.violations.some((v) => v.kind === "unsupported_amount"));
});

run("a reply quoting the published price passes", () => {
  const retrieved = retrieveFactsForTurn({
    facts: [BUSINESS_LISTING],
    message: "how much is it?",
    subIntents: ["pricing_question"],
    now: NOW,
  });
  const check = validateGroundedClaims({
    draft:
      "Our Business Listing is $29 per month and includes your business profile page, category listing, website, phone, and map, and local SEO visibility.",
    retrieved,
  });
  assert.equal(check.ok, true, JSON.stringify(check.violations));
});

run("deflecting while the facts hold the answer is a violation", () => {
  // This is the exact production failure: a published price in the prompt, and a reply
  // that says it will check.
  const retrieved = retrieveFactsForTurn({
    facts: [BUSINESS_LISTING],
    message: "how much do you charge?",
    subIntents: ["pricing_question"],
    now: NOW,
  });
  const check = validateGroundedClaims({
    draft: "I don't have the exact pricing on hand — let me check and get back to you.",
    retrieved,
  });
  assert.equal(check.ok, false);
  assert.ok(check.violations.some((v) => v.kind === "denies_available_fact"));
});

run("a stale fact stated without a qualifier is a violation", () => {
  const stale = fact(
    "policy",
    {
      category: "refunds",
      title: "Refund policy",
      details: "Refunds are issued within fourteen days of purchase.",
      conditions: [],
    },
    { lastVerifiedAt: daysAgo(900) },
  );
  const retrieved = retrieveFactsForTurn({
    facts: [stale],
    message: "what is your refund policy?",
    subIntents: ["policy_question"],
    now: NOW,
  });
  const bare = validateGroundedClaims({
    draft: "Refunds are issued within fourteen days of purchase.",
    retrieved,
  });
  assert.ok(bare.violations.some((v) => v.kind === "unqualified_stale_fact"));

  const qualified = validateGroundedClaims({
    draft: "As of our last update, refunds are issued within fourteen days of purchase.",
    retrieved,
  });
  assert.ok(!qualified.violations.some((v) => v.kind === "unqualified_stale_fact"));
});

// --- 24. Missing facts produce no invented value ------------------------------

run("a question with nothing published produces an empty block, not a guess", () => {
  const retrieved = retrieveFactsForTurn({
    facts: [],
    message: "what are your hours?",
    subIntents: ["hours_question"],
    now: NOW,
  });
  const block = buildGroundedPromptBlock(retrieved);
  assert.equal(block.text, "");
  assert.equal(block.factCount, 0);
});

run("a coverage gap is reported when nothing answers the question", () => {
  const retrieved = retrieveFactsForTurn({
    facts: [BUSINESS_LISTING],
    message: "what are your opening hours?",
    subIntents: ["hours_question"],
    now: NOW,
  });
  assert.equal(hasCoverageGap(retrieved, ["hours_question"]), true);
  assert.equal(hasCoverageGap(retrieved, ["pricing_question"]), false);
});

run("saying a value is unavailable is allowed when nothing was retrieved", () => {
  const check = validateGroundedClaims({
    draft: "I don't have our opening hours to hand — I can confirm them for you.",
    retrieved: [],
  });
  assert.equal(check.ok, true);
});

run("a conflicting value is marked in the prompt instead of being stated", () => {
  const retrieved = retrieveFactsForTurn({
    facts: [BUSINESS_LISTING],
    message: "price?",
    subIntents: ["pricing_question"],
    now: NOW,
  });
  const block = buildGroundedPromptBlock(retrieved, {
    conflictingKeys: [BUSINESS_LISTING.factKey],
  });
  assert.match(block.text, /CONFLICTING SOURCES/);
});

console.log("\nAll fact grounding tests passed.");
