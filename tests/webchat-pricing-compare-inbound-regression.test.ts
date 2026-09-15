/**
 * Production regression: trusted Pricing "Compare Free & Pro" must Auto-send a
 * grounded reply even when selected evidence is incomplete and the model throws.
 * Run: npx tsx --test tests/webchat-pricing-compare-inbound-regression.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Contact, Conversation } from "@shared/schema";
import { createWebchatVisitorId } from "@shared/webchatVisitorId";
import {
  HOMEPAGE_PAGE_RULE_ACTION,
  HOMEPAGE_PAGE_RULE_FIXTURE,
  PRICING_PAGE_RULE_ACTION,
  PRICING_PAGE_RULE_FIXTURE,
} from "@shared/webchatPageRuleFixtures";
import {
  bindPageRuleActionToInbound,
  resolveCurrentTurnPageAction,
  resolveTrustedPageRuleInboundAction,
  stampWebchatPageAction,
} from "@shared/webchatPageRuleAction";
import { parseWebchatInboundBody } from "../server/webchatAccess";
import { evaluateFullAutoSend } from "../server/aiAutoSendGate";
import { dispatchWebchatInboundAi } from "../server/webchatInboundReplyDispatch";
import { webchatAutoSendIdempotencyKey } from "@shared/webchatAiPolicy";
import { buildTurnEvidenceBundle } from "@shared/turnEvidence";
import { isDraftAmountGrounded } from "@shared/factGrounding";
import {
  assembleFeaturesPricingReply,
  featuresPricingClarification,
  realizeTrustedFeaturesPricingReply,
} from "@shared/featuresPricingReply";
import {
  canonicalPricingCompareEvidence,
  classifyPricingCompareTopic,
  detectPricingCompareIntentChange,
  detectSavingsFollowUpFromCompare,
  formatCanonicalPricingComparison,
  parentUrlAllowsCanonicalWhachatCatalog,
} from "@shared/webchatPricingCompare";
import {
  applyCompareJourneyInbound,
  resolveCurrentTurnJourney,
  startPricingCompareJourney,
  startPricingSavingsJourney,
} from "@shared/webchatActiveJourney";
import { classifyChatbotVisitorIntent } from "@shared/chatbotCompletionContext";
import { PLAN_LIMITS } from "@shared/schema";
import { getPaidPlanMonthlyPriceUsd, getPaidPlanYearlyPriceUsd } from "@shared/pricingEntitlements";
import { mergeWebchatPolledMessages } from "@shared/webchatWidgetScroll";
import { toPublicWebchatMessages } from "@shared/webchatPublicMessages";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const PARENT = "https://www.whachatcrm.com/pricing";
const HOME = "https://www.whachatcrm.com/";
const DEMO_URL = "https://calendly.com/yanivharamaty/whachatcrm-live-product-demo";
const SETTINGS = { pageRules: [PRICING_PAGE_RULE_FIXTURE] };
const WEBSITE_CHUNK =
  "Free is $0/month. Integrations and basic WhatsApp templates on Free. Prospect AI included on every plan. Pro is $49/month or $490/year and includes AI Brain, a 14-day free Pro trial, and 0% WhachatCRM markup on Meta conversation fees. No setup fees.";

function incompletePlan(name: string, data: Record<string, unknown>) {
  return {
    fact: {
      id: `fact-${name}`,
      factType: "pricing_plan" as const,
      factKey: `pricing_plan:${name.toLowerCase()}`,
      data,
      state: "published" as const,
      proposedAction: null,
      origin: "website_verified" as const,
      confidence: 0.9,
      isPinned: false,
      userEdited: false,
      conflictGroup: null,
      conflictResolution: null,
      supersededByFactId: null,
      sourceId: "src-pricing",
      sourceUrl: "https://www.whachatcrm.com/pricing",
      sourceTitle: "Pricing",
      excerpt: null,
      provenance: [],
      firstSeenAt: "2026-08-01T00:00:00.000Z",
      lastVerifiedAt: "2026-09-01T00:00:00.000Z",
      publishedAt: "2026-09-01T00:00:00.000Z",
      retiredAt: null,
    },
    freshness: { verifiedAt: "2026-09-01T00:00:00.000Z", ageDays: 1, ttlDays: 30, tier: "fresh" as const },
    precedence: 1,
    relevanceRank: 0,
    lexicalOverlap: 1,
  };
}

/** Live production often has monthly only on the plan row and yearly in the website chunk. */
const INCOMPLETE_RETRIEVED = [
  incompletePlan("Pro", {
    name: "Pro",
    price: { amount: 49, currency: "USD", billingPeriod: "month" },
  }),
  incompletePlan("Free", {
    name: "Free",
    price: { amount: 0, currency: "USD", billingPeriod: "month" },
  }),
];

function widgetInbound(input: {
  message: string;
  actionIndex?: number;
  parentUrl?: string;
  locale?: string;
  originAuthorized?: boolean;
  inboundMessageId?: string;
  settings?: Record<string, unknown>;
}) {
  const parsed = parseWebchatInboundBody({
    visitorId: createWebchatVisitorId(),
    message: input.message,
    parentUrl: input.parentUrl ?? PARENT,
    locale: input.locale,
    pageRuleAction:
      typeof input.actionIndex === "number" ? { actionIndex: input.actionIndex } : undefined,
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("expected parse ok");
  const inboundId = input.inboundMessageId || "in-current";
  const validated = resolveTrustedPageRuleInboundAction({
    originAuthorized: input.originAuthorized !== false,
    settings: input.settings ?? SETTINGS,
    parentUrl: parsed.data.parentUrl,
    locale: parsed.data.locale || input.locale,
    message: parsed.data.message,
    actionIndex: parsed.data.pageRuleActionIndex,
  });
  const stamp = validated ? bindPageRuleActionToInbound(validated, inboundId) : null;
  const pageContext = stampWebchatPageAction({}, stamp);
  const current = resolveCurrentTurnPageAction({
    pageContext,
    inboundMessageId: inboundId,
  });
  return { parsed: parsed.data, validated, current };
}

const PRODUCTION_FOLLOW_UP =
  "Show me a side-by-side comparison, including pricing, users, WhatsApp numbers, AI Brain, automations, and plan limits.";

function productionBundle(retrieved = INCOMPLETE_RETRIEVED) {
  return buildTurnEvidenceBundle({
    userId: "tenant-prod",
    retrieved,
    websiteKnowledgeText: WEBSITE_CHUNK,
  });
}

function canonicalBundle(retrieved = INCOMPLETE_RETRIEVED) {
  return buildTurnEvidenceBundle({
    userId: "tenant-prod",
    retrieved,
    websiteKnowledgeText: WEBSITE_CHUNK,
    supplementalEvidence: canonicalPricingCompareEvidence(),
  });
}

function realizeFor(
  locale: string,
  retrieved = INCOMPLETE_RETRIEVED,
  inbound = "Compare Free & Pro",
  kind: "compare_plans" | "features_pricing" = "compare_plans",
) {
  return realizeTrustedFeaturesPricingReply({
    retrieved,
    locale,
    bundle: canonicalBundle(retrieved),
    useCanonicalCatalog: true,
    parentUrl: PARENT,
    inbound,
    pageActionKind: kind,
  });
}

function gateCompare(locale: "en" | "es" | "he", kind: "compare" | "features") {
  const labels =
    kind === "compare"
      ? [...PRICING_PAGE_RULE_FIXTURE.localized[locale].suggestedQuestions]
      : [...HOMEPAGE_PAGE_RULE_FIXTURE.localized[locale].suggestedQuestions];
  const actionIndex = kind === "compare" ? PRICING_PAGE_RULE_ACTION.compare : HOMEPAGE_PAGE_RULE_ACTION.features;
  const parentUrl = kind === "compare" ? PARENT : HOME;
  const settings = { pageRules: [kind === "compare" ? PRICING_PAGE_RULE_FIXTURE : HOMEPAGE_PAGE_RULE_FIXTURE] };
  const hit = widgetInbound({
    message: labels[actionIndex],
    actionIndex,
    locale,
    parentUrl,
    settings,
  });
  const realized = realizeFor(
    locale,
    INCOMPLETE_RETRIEVED,
    hit.parsed.message,
    kind === "features" ? "features_pricing" : "compare_plans",
  );
  const gate = evaluateFullAutoSend({
    businessMode: "auto",
    channel: "webchat",
    conversationHistory: [{ role: "user", content: hit.parsed.message }],
    suggestion: realized.text,
    confidence: 0.9,
    confidenceProvided: false,
    knowledgeGrounded: isDraftAmountGrounded({
      draft: realized.text,
      retrieved: INCOMPLETE_RETRIEVED,
      bundle: canonicalBundle(),
    }),
    currentTurnPageAction: hit.current,
    businessKnowledge: { qualifyingQuestions: [] },
    verifiedBookingUrl: DEMO_URL,
  });
  return { hit, realized, gate };
}

test("trusted Compare click Auto-sends one public outbound from incomplete production evidence", async () => {
  const { hit, realized, gate } = gateCompare("en", "compare");
  assert.equal(hit.current.trusted, true);
  assert.equal(hit.current.kind, "compare_plans");
  assert.equal(hit.current.provenanceCurrentInbound, true);
  assert.equal(realized.outcome, "formatted");
  assert.match(realized.text, /Pro — \$49\/month or \$490\/year/);
  assert.match(realized.text, /1 user/i);
  assert.match(realized.text, /WhatsApp Business account/i);
  assert.match(realized.text, /AI Brain/i);
  assert.match(realized.text, /Workflow Automation/i);
  assert.doesNotMatch(realized.text, /Would you like a side-by-side comparison/);
  assert.doesNotMatch(realized.text, /USD 49 per month/);
  assert.doesNotMatch(realized.text, /AI could not generate a reply/);
  assert.equal(gate.allowed, true);
  assert.equal(gate.reason, "ok_validated_page_action");
  assert.doesNotMatch(gate.reason, /generation_failed/);

  const inbound = {
    id: "in-compare",
    direction: "inbound" as const,
    content: hit.parsed.message,
    contentType: "text",
    createdAt: new Date().toISOString(),
  };
  const outbound = {
    id: "out-compare",
    direction: "outbound" as const,
    content: realized.text,
    contentType: "text",
    createdAt: new Date().toISOString(),
  };
  const merged = mergeWebchatPolledMessages([inbound], [inbound, outbound]);
  assert.equal(merged.some((m) => m.id === "out-compare"), true);
  const publicMsgs = toPublicWebchatMessages([inbound, outbound]);
  assert.equal(publicMsgs.find((m) => m.id === "out-compare")?.direction, "outbound");
  assert.match(String(publicMsgs.find((m) => m.id === "out-compare")?.content), /\$49\/month or \$490\/year/);

  const contact = { id: "c1", userId: "workspace-a" } as Contact;
  const conversation = { id: "conv-1", userId: "workspace-a", contactId: "c1" } as Conversation;
  const seen = new Set<string>();
  const args = {
    userId: "workspace-a",
    contact,
    conversation,
    inboundMessageId: "in-compare",
    inboundText: hit.parsed.message,
    contentType: "text",
    channel: "webchat",
    chatbotOwnsReply: false,
    turnOwner: "ai_eligible" as const,
    awayConfigured: false,
    awayReplyWillSend: false,
    widgetSettings: { enabled: true },
  };
  const runAi = async (p: { inboundMessageId: string }) => {
    if (seen.has(p.inboundMessageId)) return { decision: "skip_already_replied", sent: false };
    seen.add(p.inboundMessageId);
    return { decision: gate.reason, sent: true };
  };
  const first = await dispatchWebchatInboundAi(args, { runAi });
  const second = await dispatchWebchatInboundAi(args, { runAi });
  assert.equal(first.sent, true);
  assert.equal(first.decision, "ok_validated_page_action");
  assert.equal(second.sent, false);
  assert.equal(seen.size, 1);
  assert.equal(webchatAutoSendIdempotencyKey("workspace-a", "in-compare"), "webchat_ai:workspace-a:in-compare");
});

test("EN/ES/HE compare_plans and features_pricing share the same grounded formatter", () => {
  for (const locale of ["en", "es", "he"] as const) {
    const compare = gateCompare(locale, "compare");
    const features = gateCompare(locale, "features");
    assert.equal(compare.hit.current.kind, "compare_plans");
    assert.equal(features.hit.current.kind, "features_pricing");
    assert.equal(compare.gate.reason, "ok_validated_page_action");
    assert.equal(features.gate.reason, "ok_validated_page_action");
    assert.equal(compare.realized.outcome, "formatted");
    assert.equal(features.realized.outcome, "formatted");
    assert.equal(compare.realized.text.includes("\n"), true);
  }
});

test("website-chunk-only evidence still realizes Free vs Pro; missing optional fields stay omitted", () => {
  const websiteOnly = realizeTrustedFeaturesPricingReply({
    retrieved: [],
    locale: "en",
    bundle: buildTurnEvidenceBundle({
      userId: "tenant-prod",
      retrieved: [],
      websiteKnowledgeText: WEBSITE_CHUNK,
    }),
  });
  assert.equal(websiteOnly.outcome, "formatted");
  assert.match(websiteOnly.text, /Free — \$0\/month/);
  assert.match(websiteOnly.text, /Pro — \$49\/month or \$490\/year/);
  const partial = assembleFeaturesPricingReply({
    retrieved: [INCOMPLETE_RETRIEVED[1]],
    locale: "en",
    bundle: buildTurnEvidenceBundle({
      userId: "tenant-prod",
      retrieved: [INCOMPLETE_RETRIEVED[1]],
    }),
  });
  assert.ok(partial);
  assert.match(partial!, /Free — \$0\/month/);
  assert.doesNotMatch(partial!, /\$49/);
  assert.doesNotMatch(partial!, /on Free/);
});

test("formatter exception and empty evidence use a safe clarification without invented prices", () => {
  const bomb = {
    get fact() {
      throw new Error("formatter_boom");
    },
  };
  const failed = realizeTrustedFeaturesPricingReply({
    retrieved: [bomb as never],
    locale: "en",
  });
  assert.equal(failed.outcome, "formatter_error");
  assert.equal(failed.text, featuresPricingClarification("en"));
  assert.doesNotMatch(failed.text, /\$49|\$490|\$999/);
  assert.doesNotMatch(failed.text, /AI could not generate a reply/);
  const empty = realizeTrustedFeaturesPricingReply({ retrieved: [], locale: "en" });
  assert.equal(empty.outcome, "clarification");
  assert.doesNotMatch(empty.text, /\$49/);
});

test("invented amounts stay held; untrusted typed Compare does not gain page-action trust", () => {
  const trusted = widgetInbound({
    message: "Compare Free & Pro",
    actionIndex: PRICING_PAGE_RULE_ACTION.compare,
  });
  const invented = evaluateFullAutoSend({
    businessMode: "auto",
    channel: "webchat",
    conversationHistory: [{ role: "user", content: trusted.parsed.message }],
    suggestion: "Pro is $999/month.",
    confidence: 0.9,
    confidenceProvided: true,
    knowledgeGrounded: false,
    groundingViolations: ["unsupported_amount"],
    currentTurnPageAction: trusted.current,
    businessKnowledge: { qualifyingQuestions: [] },
    verifiedBookingUrl: DEMO_URL,
  });
  assert.equal(invented.allowed, false);
  assert.equal(invented.reason, "grounding_violation:unsupported_amount");

  const typed = widgetInbound({ message: "Compare Free & Pro" });
  assert.equal(typed.current.trusted, false);
  const held = evaluateFullAutoSend({
    businessMode: "auto",
    channel: "webchat",
    conversationHistory: [{ role: "user", content: "Compare Free & Pro" }],
    suggestion: realizeFor("en").text,
    confidence: 0.9,
    confidenceProvided: false,
    knowledgeGrounded: true,
    currentTurnPageAction: typed.current,
    businessKnowledge: { qualifyingQuestions: [] },
    verifiedBookingUrl: DEMO_URL,
  });
  assert.equal(held.allowed, false);
  assert.equal(held.reason, "conversation_too_short");
  assert.equal(held.pageActionValidated, false);
});

test("reply path uses the formatter before the model and diagnoses generation_failed", () => {
  const ai = read("server/aiService.ts");
  assert.match(ai, /realizeTrustedFeaturesPricingReply/);
  assert.match(ai, /fromPage === "features_pricing" \|\| fromPage === "compare_plans"/);
  assert.match(ai, /features_pricing_realize/);
  assert.match(ai, /formatterOutcome/);
  assert.match(ai, /stage: "formatter"/);
  assert.match(ai, /stage: "evidence"/);
  assert.match(ai, /pricingCompareTurn/);
  assert.match(ai, /canonicalPricingCompareEvidence/);
  assert.match(ai, /Array\.isArray\(qualifyingSource\)/);
  const auto = read("server/webchatAiAutoReply.ts");
  assert.match(auto, /generation_stage/);
  assert.match(auto, /fallbackAttempted/);
  assert.match(auto, /fallbackSucceeded/);
  assert.match(auto, /pricingRecoverable/);
  assert.match(auto, /recoverPricingCompareSuggestion/);
  assert.match(auto, /empty_recovered/);
  assert.doesNotMatch(auto, /campaign-enrollments/);
  const channel = read("server/channelService.ts");
  assert.match(channel, /startPricingCompareJourney/);
  assert.match(channel, /detectSavingsFollowUpFromCompare/);
});

const PRODUCTION_COMPARE_CLICK = "Compare Free & Pro";

function compareJourney(overrides?: Partial<Parameters<typeof startPricingCompareJourney>[0]>) {
  return startPricingCompareJourney({
    userId: "tenant-a",
    visitorId: "visitor-a",
    conversationId: "conv-a",
    ruleKey: "pathname:/pricing",
    actionIndex: 0,
    originInboundId: "in-compare",
    locale: "en",
    ...overrides,
  });
}

function gateContinuation(input: {
  inbound: string;
  suggestion: string;
  journey: ReturnType<typeof resolveCurrentTurnJourney>;
  pageAction?: ReturnType<typeof resolveCurrentTurnPageAction>;
  grounded?: boolean;
  violations?: string[];
}) {
  return evaluateFullAutoSend({
    businessMode: "auto",
    channel: "webchat",
    conversationHistory: [
      { role: "user", content: PRODUCTION_COMPARE_CLICK },
      { role: "assistant", content: realizeFor("en").text },
      { role: "user", content: input.inbound },
    ],
    suggestion: input.suggestion,
    confidence: 0.9,
    confidenceProvided: false,
    knowledgeGrounded: input.grounded !== false,
    groundingViolations: input.violations,
    currentTurnPageAction: input.pageAction,
    currentTurnJourney: input.journey,
    businessKnowledge: { qualifyingQuestions: [] },
    verifiedBookingUrl: DEMO_URL,
  });
}

test("trusted Compare click starts a continuation; turn 2 Auto-sends the comparison", () => {
  assert.equal(parentUrlAllowsCanonicalWhachatCatalog(PARENT), true);
  assert.equal(parentUrlAllowsCanonicalWhachatCatalog("https://customer.example.com/pricing"), false);
  assert.equal(classifyChatbotVisitorIntent(PRODUCTION_FOLLOW_UP), "features_pricing");
  assert.equal(classifyPricingCompareTopic(PRODUCTION_FOLLOW_UP), "full");
  assert.equal(classifyPricingCompareTopic("What are the user limits?"), "users");
  assert.equal(classifyPricingCompareTopic("How many WhatsApp numbers?"), "whatsapp");
  assert.equal(classifyPricingCompareTopic("Does Free include AI Brain?"), "ai_brain");
  assert.equal(classifyPricingCompareTopic("What about automations?"), "automation");

  const started = compareJourney();
  assert.equal(started.kind, "pricing_compare");
  const turn1 = resolveCurrentTurnJourney({
    journey: started,
    userId: "tenant-a",
    visitorId: "visitor-a",
    conversationId: "conv-a",
    inboundMessageId: "in-compare",
  });
  assert.equal(turn1.trusted, true);
  assert.equal(turn1.continuation, false);

  const advanced = applyCompareJourneyInbound({
    journey: started,
    inboundMessageId: "in-follow",
  });
  const turn2 = resolveCurrentTurnJourney({
    journey: advanced.journey,
    userId: "tenant-a",
    visitorId: "visitor-a",
    conversationId: "conv-a",
    inboundMessageId: "in-follow",
  });
  assert.equal(turn2.trusted, true);
  assert.equal(turn2.continuation, true);
  assert.equal(turn2.kind, "pricing_compare");

  const follow = realizeFor("en", INCOMPLETE_RETRIEVED, PRODUCTION_FOLLOW_UP);
  assert.equal(follow.outcome, "formatted");
  assert.match(follow.text, /\$49\/month or \$490\/year/);
  assert.match(follow.text, /1 user/i);
  assert.match(follow.text, /WhatsApp Business account/i);
  assert.match(follow.text, /AI Brain/i);
  assert.doesNotMatch(follow.text, /Would you like a side-by-side comparison/);
  assert.doesNotMatch(follow.text, /AI could not generate a reply/);
  const gate = gateContinuation({
    inbound: PRODUCTION_FOLLOW_UP,
    suggestion: follow.text,
    journey: turn2,
  });
  assert.equal(gate.allowed, true);
  assert.equal(gate.reason, "ok_active_journey");
  assert.doesNotMatch(gate.reason, /generation_failed/);

  const inbound = {
    id: "in-follow",
    direction: "inbound" as const,
    content: PRODUCTION_FOLLOW_UP,
    contentType: "text",
    createdAt: new Date().toISOString(),
  };
  const outbound = {
    id: "out-follow",
    direction: "outbound" as const,
    content: follow.text,
    contentType: "text",
    createdAt: new Date().toISOString(),
  };
  const publicMsgs = toPublicWebchatMessages([inbound, outbound]);
  assert.equal(publicMsgs.find((m) => m.id === "out-follow")?.direction, "outbound");
});

test("Compare continuation answers users, WhatsApp, AI Brain, automation, and limits", () => {
  const topics: Array<{ inbound: string; topic: ReturnType<typeof classifyPricingCompareTopic>; re: RegExp }> = [
    { inbound: "What are the user limits?", topic: "users", re: /1 user|Unlimited/i },
    { inbound: "How many WhatsApp numbers?", topic: "whatsapp", re: /WhatsApp/i },
    { inbound: "Does Free include AI Brain?", topic: "ai_brain", re: /AI Brain/i },
    { inbound: "What about automations?", topic: "automation", re: /Workflow Automation|Follow-ups/i },
    { inbound: "What are the plan limits?", topic: "limits", re: /Active conversations|Users|WhatsApp/i },
  ];
  for (const row of topics) {
    assert.equal(classifyPricingCompareTopic(row.inbound), row.topic);
    const reply = formatCanonicalPricingComparison({ locale: "en", kind: "compare_plans", topic: row.topic });
    assert.match(reply.text, row.re);
    assert.doesNotMatch(reply.text, /\$999/);
    assert.equal(reply.evidence.some((item) => item.amounts.includes(String(getPaidPlanMonthlyPriceUsd("pro")))), true);
  }
  assert.equal(PLAN_LIMITS.free.maxUsers, 1);
  assert.equal(PLAN_LIMITS.pro.maxWhatsappNumbers, 5);
  assert.equal(getPaidPlanYearlyPriceUsd("pro"), 490);
});

test("EN/ES/HE canonical comparison and Features wording share catalog amounts", () => {
  for (const locale of ["en", "es", "he"] as const) {
    const compare = formatCanonicalPricingComparison({ locale, kind: "compare_plans", topic: "full" });
    const features = formatCanonicalPricingComparison({ locale, kind: "features_pricing", topic: "full" });
    assert.match(compare.text, /\$49/);
    assert.match(compare.text, /\$490/);
    assert.match(features.text, /\$49/);
    assert.notEqual(compare.text, features.text);
    assert.doesNotMatch(compare.text, /Would you like a side-by-side comparison/);
    assert.doesNotMatch(features.text, /Would you like a side-by-side comparison/);
  }
});

test("Compare → savings switches journeys; Book demo is an intent change", () => {
  assert.equal(detectSavingsFollowUpFromCompare("I'd like a savings estimate"), true);
  assert.equal(detectSavingsFollowUpFromCompare(PRODUCTION_FOLLOW_UP), false);
  assert.equal(detectPricingCompareIntentChange("Book a demo"), true);
  assert.equal(detectPricingCompareIntentChange(PRODUCTION_FOLLOW_UP), false);
  const compare = compareJourney();
  const savings = startPricingSavingsJourney({
    userId: compare.userId,
    visitorId: compare.visitorId,
    conversationId: compare.conversationId,
    ruleKey: compare.ruleKey,
    actionIndex: compare.actionIndex,
    originInboundId: "in-savings-switch",
    locale: "en",
  });
  assert.equal(savings.kind, "pricing_savings");
  assert.notEqual(savings.originInboundId, compare.originInboundId);
  const book = widgetInbound({
    message: "Book a demo",
    actionIndex: HOMEPAGE_PAGE_RULE_ACTION.bookDemo,
    parentUrl: HOME,
    settings: { pageRules: [HOMEPAGE_PAGE_RULE_FIXTURE] },
  });
  assert.equal(book.current.kind, "book_demo");
});

test("expired, wrong-tenant, wrong-visitor, and wrong-conversation continuations are rejected", () => {
  const started = compareJourney();
  const expired = resolveCurrentTurnJourney({
    journey: { ...started, expiresAt: "2000-01-01T00:00:00.000Z" },
    userId: "tenant-a",
    visitorId: "visitor-a",
    conversationId: "conv-a",
    inboundMessageId: "in-follow",
  });
  assert.equal(expired.trusted, false);
  assert.equal(expired.status, "expired");
  const wrongTenant = resolveCurrentTurnJourney({
    journey: started,
    userId: "tenant-b",
    visitorId: "visitor-a",
    conversationId: "conv-a",
    inboundMessageId: "in-follow",
  });
  assert.equal(wrongTenant.trusted, false);
  const wrongVisitor = resolveCurrentTurnJourney({
    journey: started,
    userId: "tenant-a",
    visitorId: "visitor-b",
    conversationId: "conv-a",
    inboundMessageId: "in-follow",
  });
  assert.equal(wrongVisitor.trusted, false);
  const wrongConv = resolveCurrentTurnJourney({
    journey: started,
    userId: "tenant-a",
    visitorId: "visitor-a",
    conversationId: "conv-b",
    inboundMessageId: "in-follow",
  });
  assert.equal(wrongConv.trusted, false);
});

test("takeover and pending chatbot suppress continuation; typed label stays untrusted", () => {
  const paused = resolveCurrentTurnJourney({
    journey: { ...compareJourney(), status: "paused" },
    userId: "tenant-a",
    visitorId: "visitor-a",
    conversationId: "conv-a",
    inboundMessageId: "in-follow",
  });
  assert.equal(paused.trusted, false);
  const typed = widgetInbound({ message: PRODUCTION_COMPARE_CLICK });
  assert.equal(typed.current.trusted, false);
  assert.equal(classifyChatbotVisitorIntent(PRODUCTION_COMPARE_CLICK), "features_pricing");
  const freeText = realizeFor("en", [], PRODUCTION_FOLLOW_UP);
  assert.equal(freeText.outcome, "formatted");
  assert.match(freeText.text, /\$49\/month or \$490\/year/);
});

test("canonical catalog still grounds when published facts are empty", () => {
  const empty = realizeTrustedFeaturesPricingReply({
    retrieved: [],
    locale: "en",
    bundle: canonicalBundle([]),
    useCanonicalCatalog: true,
    parentUrl: PARENT,
    inbound: PRODUCTION_COMPARE_CLICK,
    pageActionKind: "compare_plans",
  });
  assert.equal(empty.outcome, "formatted");
  assert.match(empty.text, /Free — \$0\/month/);
  assert.match(empty.text, /Pro — \$49\/month or \$490\/year/);
  assert.equal(
    isDraftAmountGrounded({
      draft: empty.text,
      retrieved: [],
      bundle: canonicalBundle([]),
    }),
    true,
  );
});

test("desktop and mobile Compare labels share the same validated action", () => {
  const desktop = widgetInbound({
    message: PRODUCTION_COMPARE_CLICK,
    actionIndex: PRICING_PAGE_RULE_ACTION.compare,
  });
  const mobile = widgetInbound({
    message: PRODUCTION_COMPARE_CLICK,
    actionIndex: PRICING_PAGE_RULE_ACTION.compare,
    inboundMessageId: "in-mobile",
  });
  assert.equal(desktop.current.kind, mobile.current.kind);
  assert.equal(desktop.current.trusted, true);
  assert.equal(mobile.current.trusted, true);
});
