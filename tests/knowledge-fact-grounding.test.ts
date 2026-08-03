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
  assembleDeterministicGroundedDraft,
  buildGroundedPromptBlock,
  mergeGroundingChecks,
  validateGroundedClaims,
  validateResponseCompleteness,
} from "../shared/factGrounding";
import {
  hasCoverageGap,
  retrieveFactsForTurn,
} from "../shared/knowledgeRetrieval";
import { resolveAiRouting } from "../shared/aiRouting";
import { evaluateFullAutoSend } from "../server/aiAutoSendGate";
import { stripQuotedEmailReplies } from "../server/emailChannel/htmlSanitize";
import { readFileSync } from "node:fs";

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

// --- Response completeness (answer must use retrieved facts) ------------------

const PROD_MSG =
  "Wonder about your business directory. How much is it and what is included in it?";
const GENERIC_DRAFT =
  "Our business directory listings are competitively priced to suit various needs and budgets. Could you share the type of business or service you're interested in advertising, so I can provide more specific details on pricing and inclusions?";

run("published pricing fact + pricing question requires the exact price", () => {
  const retrieved = retrieveFactsForTurn({
    facts: [BUSINESS_LISTING],
    message: "how much is the business listing?",
    subIntents: ["pricing_question"],
    now: NOW,
  });
  const incomplete = validateResponseCompleteness({
    draft: "Our listing packages are available — what category is your business in?",
    retrieved,
    subIntents: ["pricing_question"],
  });
  assert.equal(incomplete.ok, false);
  assert.ok(incomplete.violations.some((v) => v.kind === "incomplete_required_fact"));

  const complete = validateResponseCompleteness({
    draft: "Business Listing is USD 29 per month.",
    retrieved,
    subIntents: ["pricing_question"],
  });
  assert.equal(complete.ok, true, JSON.stringify(complete.violations));
});

run("published benefits + what is included requires exact benefits", () => {
  const routing = resolveAiRouting({ inbound: PROD_MSG });
  assert.ok(routing.subIntents.includes("benefits_question"));
  const retrieved = retrieveFactsForTurn({
    facts: [BUSINESS_LISTING],
    message: PROD_MSG,
    subIntents: routing.subIntents,
    now: NOW,
  });
  const incomplete = validateResponseCompleteness({
    draft: "Business Listing is USD 29 per month. Want help getting started?",
    retrieved,
    subIntents: routing.subIntents,
  });
  assert.equal(incomplete.ok, false);

  const complete = validateResponseCompleteness({
    draft:
      "Business Listing is USD 29 per month. It includes a Business profile page, Category listing, Website, phone, and map, and Local SEO visibility.",
    retrieved,
    subIntents: routing.subIntents,
  });
  assert.equal(complete.ok, true, JSON.stringify(complete.violations));
});

run("generic competitively priced draft is rejected as incomplete", () => {
  const routing = resolveAiRouting({ inbound: PROD_MSG });
  const retrieved = retrieveFactsForTurn({
    facts: [BUSINESS_LISTING],
    message: PROD_MSG,
    subIntents: routing.subIntents,
    now: NOW,
  });
  const check = mergeGroundingChecks(
    validateGroundedClaims({ draft: GENERIC_DRAFT, retrieved, subIntents: routing.subIntents }),
    validateResponseCompleteness({
      draft: GENERIC_DRAFT,
      retrieved,
      subIntents: routing.subIntents,
    }),
  );
  // Unsupported-amount alone would have allowed this — completeness must catch it.
  assert.equal(
    validateGroundedClaims({ draft: GENERIC_DRAFT, retrieved }).ok,
    true,
  );
  assert.equal(check.ok, false);
  assert.ok(check.violations.some((v) => v.kind === "incomplete_required_fact"));
});

run("retrieved facts absent → safe missing-information response allowed", () => {
  const check = validateResponseCompleteness({
    draft: "I don't have a verified price for that package yet — I can confirm it for you.",
    retrieved: [],
    subIntents: ["pricing_question"],
  });
  assert.equal(check.ok, true);
});

run("conflicted facts → cautious response, no guessing required", () => {
  const retrieved = retrieveFactsForTurn({
    facts: [BUSINESS_LISTING],
    message: PROD_MSG,
    subIntents: ["pricing_question", "benefits_question"],
    now: NOW,
  });
  const check = validateResponseCompleteness({
    draft: "I want to confirm the current listing details before quoting them.",
    retrieved,
    subIntents: ["pricing_question", "benefits_question"],
    conflictingKeys: [BUSINESS_LISTING.factKey],
  });
  assert.equal(check.ok, true);
  const fallback = assembleDeterministicGroundedDraft({
    retrieved,
    subIntents: ["pricing_question"],
    conflictingKeys: [BUSINESS_LISTING.factKey],
  });
  assert.match(fallback, /confirm/i);
  assert.ok(!/\$29|USD 29/.test(fallback));
});

run("email with quoted thread classifies only the newest customer content", () => {
  const quoted = `${PROD_MSG}

On Sat, Aug 1, 2026 at 3:00 PM Agent wrote:
> Thanks for reaching out about our directory.
> Our packages start at many price points.`;
  const stripped = stripQuotedEmailReplies(quoted);
  assert.equal(stripped, PROD_MSG);
  const routing = resolveAiRouting({ inbound: stripped });
  assert.ok(routing.subIntents.includes("pricing_question"));
  assert.ok(routing.subIntents.includes("benefits_question"));
  assert.ok(routing.subIntents.includes("listing_join_question"));
  // Classification must not be poisoned by the quoted agent hedge.
  assert.ok(!/competitively|many price points/i.test(stripped));
});

run("WhatsApp/Facebook/Instagram/Email share the same grounding contract in suggestReply", () => {
  const src = readFileSync(new URL("../server/aiService.ts", import.meta.url), "utf8");
  assert.ok(src.includes("validateResponseCompleteness"));
  assert.ok(src.includes("FACT_COMPLETENESS_RETRY_INSTRUCTION"));
  assert.ok(src.includes("assembleDeterministicGroundedDraft"));
  // Channel only changes email framing — completeness runs for every suggestReply call.
  assert.ok(/evaluateDraft\(suggestion\)/.test(src));
  assert.ok(!/if\s*\(\s*isEmailChannel[\s\S]{0,80}validateResponseCompleteness/.test(src));
});

run("draft regeneration failure blocks auto-send", () => {
  const gate = evaluateFullAutoSend({
    businessMode: "auto",
    conversationHistory: [
      { role: "user", content: PROD_MSG },
      { role: "user", content: "Following up on pricing" },
    ],
    suggestion: assembleDeterministicGroundedDraft({
      retrieved: retrieveFactsForTurn({
        facts: [BUSINESS_LISTING],
        message: PROD_MSG,
        subIntents: ["pricing_question", "benefits_question", "listing_join_question"],
        now: NOW,
      }),
      subIntents: ["pricing_question", "benefits_question", "listing_join_question"],
    }),
    confidence: 0.9,
    groundingViolations: ["incomplete_required_fact", "grounding_fallback_requires_review"],
  });
  assert.equal(gate.allowed, false);
  assert.match(gate.reason, /grounding_violation/);
});

run("cross-workspace isolation: completeness only sees retrieved facts passed in", () => {
  const otherWorkspacePlan = fact("pricing_plan", {
    name: "Other Workspace Plan",
    description: null,
    price: { amount: 999, currency: "USD", billingPeriod: "month" },
    priceQualifier: "exact",
    benefits: ["Secret benefit"],
  });
  // Simulate workspace A retrieval — workspace B's fact never enters.
  const retrievedA = retrieveFactsForTurn({
    facts: [BUSINESS_LISTING],
    message: "how much?",
    subIntents: ["pricing_question"],
    now: NOW,
  });
  assert.ok(!retrievedA.some((r) => r.fact.factKey === otherWorkspacePlan.factKey));
  const check = validateResponseCompleteness({
    draft: "Business Listing is USD 29 per month.",
    retrieved: retrievedA,
    subIntents: ["pricing_question"],
  });
  assert.equal(check.ok, true);
  assert.equal(
    validateResponseCompleteness({
      draft: "Other Workspace Plan is USD 999 per month.",
      retrieved: retrievedA,
      subIntents: ["pricing_question"],
    }).ok,
    false,
  );
});

run("no published facts → V1 fallback remains safe (empty grounding package)", () => {
  const retrieved = retrieveFactsForTurn({
    facts: [],
    message: PROD_MSG,
    subIntents: ["pricing_question"],
    now: NOW,
  });
  const block = buildGroundedPromptBlock(retrieved);
  assert.equal(block.text, "");
  assert.equal(
    validateResponseCompleteness({
      draft: GENERIC_DRAFT,
      retrieved,
      subIntents: ["pricing_question"],
    }).ok,
    true,
  );
});

run("deterministic fallback states price and benefits from the fact", () => {
  const retrieved = retrieveFactsForTurn({
    facts: [BUSINESS_LISTING],
    message: PROD_MSG,
    subIntents: ["pricing_question", "benefits_question", "listing_join_question"],
    now: NOW,
  });
  const draft = assembleDeterministicGroundedDraft({
    retrieved,
    subIntents: ["pricing_question", "benefits_question", "listing_join_question"],
  });
  assert.match(draft, /Business Listing/i);
  assert.match(draft, /USD 29 per month/);
  assert.match(draft, /Business profile page/);
  assert.equal(
    validateResponseCompleteness({
      draft,
      retrieved,
      subIntents: ["pricing_question", "benefits_question", "listing_join_question"],
    }).ok,
    true,
  );
});

console.log("\nAll fact grounding tests passed.");
