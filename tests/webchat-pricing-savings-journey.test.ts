/**
 * Website Chat Pricing savings journey: server-owned activeJourney,
 * slot collection, grounded calculation, identity, and composer.
 * Run: npx tsx --test tests/webchat-pricing-savings-journey.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "path";
import {
  applyJourneyInbound,
  collectedFieldNames,
  journeyGateDiagnostics,
  markJourneyStatus,
  readActiveJourney,
  resolveCurrentTurnJourney,
  startPricingSavingsJourney,
  WEBCHAT_ACTIVE_JOURNEY_TTL_MS,
} from "../shared/webchatActiveJourney";
import {
  calculatePricingSavings,
  canonicalWhachatProPrices,
  extractSavingsSlots,
  resolveSavingsJourneyReply,
  savingsJourneyEvidence,
} from "../shared/webchatSavingsJourney";
import { getPaidPlanMonthlyPriceUsd, getPaidPlanYearlyPriceUsd } from "../shared/pricingEntitlements";
import { PRICING_PAGE_RULE_ACTION, PRICING_PAGE_RULE_FIXTURE } from "../shared/webchatPageRuleFixtures";
import {
  bindPageRuleActionToInbound,
  resolveCurrentTurnPageAction,
  resolveTrustedPageRuleInboundAction,
  stampWebchatPageAction,
} from "../shared/webchatPageRuleAction";
import { evaluateFullAutoSend } from "../server/aiAutoSendGate";
import { decideWebchatAiReply } from "../shared/webchatAiPolicy";
import { parseWebchatInboundBody } from "../server/webchatAccess";
import { createWebchatVisitorId } from "../shared/webchatVisitorId";
import {
  chatbotCompletionPromptRules,
  resolveChatbotCompletionRouting,
} from "../shared/chatbotCompletionContext";
import {
  buildTurnEvidenceBundle,
  evaluateBundleAmountGrounding,
} from "../shared/turnEvidence";
import { extractIdentityHints } from "../shared/agent/webchatLeadContext";
import { collectValidatedIdentity, isValidIdentityName } from "../shared/webchatIdentityFields";
import { looksLikeMessageDerivedWebchatName } from "../shared/webchatContactIdentity";
import { resolveComposerEnterAction } from "../shared/composerKeyboard";
import {
  nextComposerTextareaLayout,
  WIDGET_COMPOSER_TEXTAREA_MAX_PX,
  WIDGET_COMPOSER_TEXTAREA_MIN_PX,
} from "../shared/composerTextareaHeight";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const PARENT = "https://www.whachatcrm.com/pricing";
const DEMO_URL = "https://calendly.com/yanivharamaty/whachatcrm-live-product-demo";
const PRODUCTION_FOLLOW_UP =
  "Im using Manychat have 2 team mambers and send about 1000 messages a month";

function savingsClick(locale: "en" | "es" | "he" = "en", inboundId = "in-savings") {
  const message = PRICING_PAGE_RULE_FIXTURE.localized[locale].suggestedQuestions[PRICING_PAGE_RULE_ACTION.savings];
  const parsed = parseWebchatInboundBody({
    visitorId: createWebchatVisitorId(),
    message,
    parentUrl: PARENT,
    locale,
    pageRuleAction: { actionIndex: PRICING_PAGE_RULE_ACTION.savings },
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("parse");
  const validated = resolveTrustedPageRuleInboundAction({
    originAuthorized: true,
    settings: { pageRules: [PRICING_PAGE_RULE_FIXTURE] },
    parentUrl: parsed.data.parentUrl,
    locale: parsed.data.locale || locale,
    message: parsed.data.message,
    actionIndex: parsed.data.pageRuleActionIndex,
  });
  const stamp = validated ? bindPageRuleActionToInbound(validated, inboundId) : null;
  const current = resolveCurrentTurnPageAction({
    pageContext: stampWebchatPageAction({}, stamp),
    inboundMessageId: inboundId,
  });
  return { parsed: parsed.data, validated, current, message };
}

function startJourney(overrides?: Partial<Parameters<typeof startPricingSavingsJourney>[0]>) {
  return startPricingSavingsJourney({
    userId: "tenant-a",
    visitorId: "visitor-a",
    conversationId: "conv-a",
    ruleKey: "pathname:/pricing",
    actionIndex: 1,
    originInboundId: "in-savings",
    locale: "en",
    ...overrides,
  });
}

function gate(input: {
  history: Array<{ role: string; content: string }>;
  suggestion: string;
  pageAction?: ReturnType<typeof resolveCurrentTurnPageAction>;
  journey?: ReturnType<typeof resolveCurrentTurnJourney>;
  grounded?: boolean;
  violations?: string[];
  mode?: "off" | "suggest" | "auto";
  confidenceProvided?: boolean;
}) {
  return evaluateFullAutoSend({
    businessMode: input.mode ?? "auto",
    channel: "webchat",
    conversationHistory: input.history,
    suggestion: input.suggestion,
    confidence: 0.9,
    confidenceProvided: input.confidenceProvided !== false,
    knowledgeGrounded: input.grounded !== false,
    groundingViolations: input.violations,
    currentTurnPageAction: input.pageAction,
    currentTurnJourney: input.journey,
    businessKnowledge: {
      qualifyingQuestions: [
        { key: "business_profile", label: "Business profile", question: "What type of business?", required: true, enabled: true },
        { key: "budget", label: "Budget", question: "Budget?", required: true, enabled: true },
      ],
    },
    verifiedBookingUrl: DEMO_URL,
  });
}

test("trusted EN /pricing savings click Auto-sends the initial question", () => {
  const click = savingsClick("en");
  assert.equal(click.current.trusted, true);
  assert.equal(click.current.kind, "calculate_savings");
  const journey = startJourney();
  const reply = resolveSavingsJourneyReply({
    locale: "en",
    collected: journey.collected,
    missing: journey.missing,
  });
  const first = gate({
    history: [{ role: "user", content: click.message }],
    suggestion: reply.text,
    pageAction: click.current,
    grounded: false,
  });
  assert.equal(first.allowed, true);
  assert.equal(first.reason, "ok_validated_page_action");
  assert.match(reply.text, /platform/i);
  assert.match(reply.text, /month/i);
  assert.equal(reply.complete, false);
});

test("ES and HE configured labels start the same journey by validated rule/index", () => {
  for (const locale of ["es", "he"] as const) {
    const click = savingsClick(locale, `in-${locale}`);
    assert.equal(click.validated?.kind, "calculate_savings");
    assert.equal(click.validated?.actionIndex, PRICING_PAGE_RULE_ACTION.savings);
    assert.equal(click.current.trusted, true);
    const routing = resolveChatbotCompletionRouting({
      inbound: click.message,
      pageActionKind: click.current.kind,
    });
    assert.ok(routing.subIntents.includes("pricing_question"));
  }
});

test("equivalent EN, ES, and HE replies extract the same savings slots", () => {
  const en = extractSavingsSlots("I'm using ManyChat with 2 team members and send about 1000 messages a month");
  const es = extractSavingsSlots("Estoy usando Manychat, tengo 2 miembros y envío cerca de 1000 mensajes al mes");
  const he = extractSavingsSlots("משתמש ב-Manychat יש 2 בצוות ושולחים כ-1000 הודעות בחודש");
  assert.equal(en.platform, "ManyChat");
  assert.equal(es.platform, "ManyChat");
  assert.equal(he.platform, "ManyChat");
  assert.equal(en.teamSize, 2);
  assert.equal(es.teamSize, 2);
  assert.equal(he.teamSize, 2);
  assert.equal(en.monthlyVolume, 1000);
  assert.equal(es.monthlyVolume, 1000);
  assert.equal(he.monthlyVolume, 1000);
  const costEn = extractSavingsSlots("I am paying about $150 a month");
  const costEs = extractSavingsSlots("Pago unos 150 al mes");
  const costHe = extractSavingsSlots("משלם 150 בחודש");
  assert.equal(costEn.monthlyCost, 150);
  assert.equal(costEs.monthlyCost, 150);
  assert.equal(costHe.monthlyCost, 150);
});

test("platform/team/volume without cost asks only for cost and Auto-sends once", () => {
  const started = startJourney();
  const slots = extractSavingsSlots(PRODUCTION_FOLLOW_UP);
  assert.equal(slots.platform, "ManyChat");
  assert.equal(slots.teamSize, 2);
  assert.equal(slots.monthlyVolume, 1000);
  assert.equal(slots.monthlyCost, undefined);
  const applied = applyJourneyInbound({
    journey: started,
    inboundMessageId: "in-follow",
    extracted: slots,
  });
  assert.deepEqual(applied.journey.missing.filter((f) => f === "monthlyCost"), ["monthlyCost"]);
  assert.ok(!applied.journey.missing.includes("platform"));
  const reply = resolveSavingsJourneyReply({
    locale: "en",
    collected: applied.journey.collected,
    missing: applied.journey.missing,
  });
  assert.match(reply.text, /ManyChat/);
  assert.match(reply.text, /paying/i);
  assert.doesNotMatch(reply.text, /how many (team|messages)/i);
  assert.doesNotMatch(reply.text, /\$49/);
  assert.equal(reply.complete, false);
  const current = resolveCurrentTurnJourney({
    journey: applied.journey,
    userId: "tenant-a",
    visitorId: "visitor-a",
    conversationId: "conv-a",
    inboundMessageId: "in-follow",
  });
  const sent = gate({
    history: [
      { role: "user", content: "Calculate my savings" },
      { role: "assistant", content: "What platform do you use today?" },
      { role: "user", content: PRODUCTION_FOLLOW_UP },
    ],
    suggestion: reply.text,
    journey: current,
    grounded: false,
  });
  assert.equal(sent.allowed, true);
  assert.equal(sent.reason, "ok_active_journey");
  assert.equal(sent.pageActionValidated, false);
  assert.equal(sent.activeJourneyContinuation, true);
});

test("all required values produce a grounded deterministic comparison from canonical prices", () => {
  const catalog = canonicalWhachatProPrices();
  assert.equal(catalog.monthly, getPaidPlanMonthlyPriceUsd("pro"));
  assert.equal(catalog.yearly, getPaidPlanYearlyPriceUsd("pro"));
  assert.equal(catalog.monthly, 49);
  assert.equal(catalog.yearly, 490);
  const calc = calculatePricingSavings({ monthlyCost: 120, currency: "USD" });
  assert.equal(calc.ok, true);
  if (!calc.ok) throw new Error("calc");
  assert.equal(calc.calculation.monthlySavings, 71);
  assert.equal(calc.calculation.yearlySavings, 950);
  const reply = resolveSavingsJourneyReply({
    locale: "en",
    collected: { platform: "ManyChat", monthlyCost: 120, currency: "USD" },
    missing: [],
  });
  assert.equal(reply.complete, true);
  assert.match(reply.text, /\$120/);
  assert.match(reply.text, /\$49/);
  assert.match(reply.text, /\$490/);
  assert.doesNotMatch(reply.text, /0%/);
  assert.doesNotMatch(reply.text, /Meta markup/);
  assert.match(reply.text, /current bill/i);
  const src = read("shared/webchatSavingsJourney.ts");
  assert.doesNotMatch(src, /getPaidPlanMonthlyPriceUsd\([^)]*49/);
  assert.match(src, /getPaidPlanMonthlyPriceUsd\("pro"\)/);
  assert.match(src, /getPaidPlanYearlyPriceUsd\("pro"\)/);
});

test("user-provided and derived amounts pass only with typed provenance; invented amounts stay unsupported", () => {
  const calc = calculatePricingSavings({ monthlyCost: 120, currency: "USD" });
  assert.equal(calc.ok, true);
  if (!calc.ok) throw new Error("calc");
  const evidence = savingsJourneyEvidence(calc.calculation);
  const bundle = buildTurnEvidenceBundle({
    userId: "tenant-a",
    supplementalEvidence: evidence,
  });
  const comparison = resolveSavingsJourneyReply({
    locale: "en",
    collected: { platform: "ManyChat", monthlyCost: 120, currency: "USD" },
    missing: [],
  });
  const grounded = evaluateBundleAmountGrounding({
    draft: comparison.text,
    bundle,
  });
  assert.equal(grounded.ok, true);
  const invented = evaluateBundleAmountGrounding({
    draft: "You would save $480 each month plus a $12 setup fee.",
    bundle,
  });
  assert.equal(invented.ok, false);
  assert.ok(invented.unsupportedAmounts.includes("480"));
  const click = savingsClick("en");
  const held = gate({
    history: [{ role: "user", content: click.message }],
    suggestion: "Switching saves $480/month.",
    pageAction: click.current,
    violations: ["unsupported_amount"],
  });
  assert.equal(held.allowed, false);
  assert.match(held.reason, /unsupported_amount/);
});

test("currency mismatch asks for clarification; low savings is honest", () => {
  const mismatch = resolveSavingsJourneyReply({
    locale: "en",
    collected: { platform: "ManyChat", monthlyCost: 120, currency: "EUR" },
    missing: [],
  });
  assert.equal(mismatch.complete, false);
  assert.equal(mismatch.holdReason, "currency_mismatch");
  assert.match(mismatch.text, /USD/);
  assert.doesNotMatch(mismatch.text, /exchange rate|1 EUR/i);
  const low = resolveSavingsJourneyReply({
    locale: "en",
    collected: { platform: "ManyChat", monthlyCost: 20, currency: "USD" },
    missing: [],
  });
  assert.equal(low.complete, true);
  assert.match(low.text, /do not show a clear monthly or annual savings/i);
});

test("journey survives later turns and rejects stale, expired, and cross-scope state", () => {
  const started = startJourney();
  const later = applyJourneyInbound({
    journey: started,
    inboundMessageId: "in-2",
    extracted: extractSavingsSlots(PRODUCTION_FOLLOW_UP),
  }).journey;
  const same = resolveCurrentTurnJourney({
    journey: later,
    userId: "tenant-a",
    visitorId: "visitor-a",
    conversationId: "conv-a",
    inboundMessageId: "in-3",
  });
  assert.equal(same.trusted, true);
  assert.equal(same.continuation, true);
  assert.ok(same.collectedFields.includes("platform"));
  assert.deepEqual(
    resolveCurrentTurnJourney({
      journey: later,
      userId: "tenant-b",
      visitorId: "visitor-a",
      conversationId: "conv-a",
      inboundMessageId: "in-3",
    }).trusted,
    false,
  );
  assert.deepEqual(
    resolveCurrentTurnJourney({
      journey: later,
      userId: "tenant-a",
      visitorId: "visitor-b",
      conversationId: "conv-a",
      inboundMessageId: "in-3",
    }).trusted,
    false,
  );
  assert.deepEqual(
    resolveCurrentTurnJourney({
      journey: later,
      userId: "tenant-a",
      visitorId: "visitor-a",
      conversationId: "conv-b",
      inboundMessageId: "in-3",
    }).trusted,
    false,
  );
  const expired = {
    ...later,
    expiresAt: new Date(Date.now() - 1000).toISOString(),
  };
  assert.equal(
    resolveCurrentTurnJourney({
      journey: expired,
      userId: "tenant-a",
      visitorId: "visitor-a",
      conversationId: "conv-a",
      inboundMessageId: "in-3",
    }).trusted,
    false,
  );
  assert.ok(WEBCHAT_ACTIVE_JOURNEY_TTL_MS >= 60 * 60 * 1000);
  const stalePage = resolveCurrentTurnPageAction({
    pageContext: stampWebchatPageAction(
      {},
      bindPageRuleActionToInbound(savingsClick().validated!, "in-savings"),
    ),
    inboundMessageId: "in-follow",
  });
  assert.equal(stalePage.trusted, false);
  assert.equal(stalePage.provenanceCurrentInbound, false);
});

test("duplicate inbound does not advance or send twice", () => {
  const started = startJourney();
  const first = applyJourneyInbound({
    journey: started,
    inboundMessageId: "in-follow",
    extracted: extractSavingsSlots(PRODUCTION_FOLLOW_UP),
  });
  const again = applyJourneyInbound({
    journey: first.journey,
    inboundMessageId: "in-follow",
    extracted: { monthlyCost: 999, currency: "USD" },
  });
  assert.equal(first.advanced, true);
  assert.equal(again.advanced, false);
  assert.equal(again.journey.collected.monthlyCost, undefined);
  assert.equal(again.journey.lastProcessedInboundId, "in-follow");
});

test("intent change, human takeover, and pending chatbot pause or suppress the journey", () => {
  const started = startJourney();
  const paused = markJourneyStatus(started, "paused");
  assert.equal(
    resolveCurrentTurnJourney({
      journey: paused,
      userId: "tenant-a",
      visitorId: "visitor-a",
      conversationId: "conv-a",
      inboundMessageId: "in-2",
    }).trusted,
    false,
  );
  const aiBase = {
    rolloutEnabled: true,
    allowlisted: true,
    widgetEnabled: true,
    hasAiBrainAccess: true,
    planIsProOrTrial: true,
    aiModeRaw: "full_auto",
    chatbotOwnsReply: false,
    bookingOwnsReply: false,
    crmFallbackOwnsReply: false,
    handoffActive: false,
    aiPaused: false,
    automationsPaused: false,
    optedOut: false,
    rateLimited: false,
  };
  assert.equal(decideWebchatAiReply({ ...aiBase, handoffActive: true }), "skip_handoff");
  assert.equal(decideWebchatAiReply({ ...aiBase, chatbotOwnsReply: true }), "skip_chatbot_owns");
  const policy = read("shared/webchatAiPolicy.ts");
  assert.match(policy, /pauseStoredJourney|status: "paused"/);
  const channel = read("server/channelService.ts");
  assert.match(channel, /detectSavingsIntentChange/);
  assert.match(channel, /chatbotWillFire/);
});

test("Manual and Suggest modes stay unchanged; typed label does not create a trusted journey", () => {
  const click = savingsClick("en");
  assert.equal(
    gate({
      history: [{ role: "user", content: click.message }],
      suggestion: "What platform do you use today?",
      pageAction: click.current,
      mode: "off",
    }).reason,
    "business_mode_not_auto",
  );
  assert.equal(
    gate({
      history: [{ role: "user", content: click.message }],
      suggestion: "What platform do you use today?",
      pageAction: click.current,
      mode: "suggest",
    }).reason,
    "business_mode_not_auto",
  );
  const typed = parseWebchatInboundBody({
    visitorId: createWebchatVisitorId(),
    message: "Calculate my savings",
    parentUrl: PARENT,
  });
  assert.equal(typed.ok, true);
  if (!typed.ok) throw new Error("typed");
  assert.equal(typed.data.pageRuleActionIndex, undefined);
  const untrusted = resolveTrustedPageRuleInboundAction({
    originAuthorized: true,
    settings: { pageRules: [PRICING_PAGE_RULE_FIXTURE] },
    parentUrl: typed.data.parentUrl,
    message: typed.data.message,
    actionIndex: typed.data.pageRuleActionIndex,
  });
  assert.equal(untrusted, null);
  const channel = read("server/channelService.ts");
  assert.match(channel, /validatedPageRuleAction\?\.kind === "calculate_savings"/);
  assert.doesNotMatch(channel, /startPricingSavingsJourney\(\{\s*userId,\s*visitorId,\s*conversationId: conversation.id,\s*ruleKey: classify/);
});

test("compare and book-a-demo remain distinct; booking uses only verified Calendly", () => {
  const compare = chatbotCompletionPromptRules({
    inbound: "Compare Free & Pro",
    pageActionKind: "compare_plans",
    bookingUrl: DEMO_URL,
  });
  assert.match(compare, /published plans or pricing/);
  assert.doesNotMatch(compare, /Share this exact workspace-selected Calendly/);
  const book = resolveChatbotCompletionRouting({
    inbound: "Book a demo",
    pageActionKind: "book_demo",
  });
  assert.ok(book.subIntents.includes("booking_question"));
  const bookPrompt = chatbotCompletionPromptRules({
    inbound: "Book a demo",
    pageActionKind: "book_demo",
    bookingUrl: DEMO_URL,
  });
  assert.match(bookPrompt, /yanivharamaty\/whachatcrm-live-product-demo/);
});

test("anonymous contact is never renamed from action or message text", () => {
  assert.equal(extractIdentityHints("Calculate my savings").name, undefined);
  assert.equal(extractIdentityHints(PRODUCTION_FOLLOW_UP).name, undefined);
  assert.equal(extractIdentityHints("Comparar Free y Pro").name, undefined);
  assert.equal(extractIdentityHints("חישוב החיסכון שלי").name, undefined);
  assert.equal(isValidIdentityName("Calculate my savings"), null);
  assert.equal(isValidIdentityName("Website Visitor"), null);
  assert.equal(isValidIdentityName("Unknown"), null);
  assert.equal(isValidIdentityName("Ada Lovelace"), "Ada Lovelace");
  assert.equal(extractIdentityHints("I'm Ada Lovelace — ada@example.com").name, "Ada Lovelace");
  assert.equal(extractIdentityHints("Michael Chen").name, "Michael Chen");
  assert.equal(looksLikeMessageDerivedWebchatName("Calculate my savings"), true);
  assert.deepEqual(collectValidatedIdentity({ name: "Calculate my savings" }), {});
  const channel = read("server/channelService.ts");
  assert.match(channel, /channel === "webchat" && contact && !validatedPageRuleAction/);
});

test("widget composer wraps, auto-grows, handles Enter/IME, and avoids horizontal overflow", () => {
  assert.equal(WIDGET_COMPOSER_TEXTAREA_MIN_PX, 38);
  assert.equal(WIDGET_COMPOSER_TEXTAREA_MAX_PX, 128);
  assert.deepEqual(nextComposerTextareaLayout(20, 38, 128), { heightPx: 38, overflowY: "hidden" });
  assert.deepEqual(nextComposerTextareaLayout(80, 38, 128), { heightPx: 80, overflowY: "hidden" });
  assert.deepEqual(nextComposerTextareaLayout(200, 38, 128), { heightPx: 128, overflowY: "auto" });
  assert.deepEqual(
    resolveComposerEnterAction({
      channel: "webchat",
      isMobile: false,
      key: "Enter",
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      canSend: true,
    }),
    { action: "send", preventDefault: true },
  );
  assert.deepEqual(
    resolveComposerEnterAction({
      channel: "webchat",
      isMobile: false,
      key: "Enter",
      shiftKey: true,
      ctrlKey: false,
      metaKey: false,
      canSend: true,
    }),
    { action: "newline", preventDefault: false },
  );
  assert.deepEqual(
    resolveComposerEnterAction({
      channel: "webchat",
      isMobile: true,
      key: "Enter",
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      canSend: true,
    }),
    { action: "newline", preventDefault: false },
  );
  assert.deepEqual(
    resolveComposerEnterAction({
      channel: "webchat",
      isMobile: false,
      key: "Enter",
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      canSend: true,
      isComposing: true,
    }),
    { action: "ignore", preventDefault: false },
  );
  const frame = read("client/src/pages/WidgetFrame.tsx");
  assert.match(frame, /<textarea/);
  assert.match(frame, /resolveComposerEnterAction/);
  assert.match(frame, /nextComposerTextareaLayout/);
  assert.match(frame, /overflow-x-hidden/);
  assert.match(frame, /whitespace-pre-wrap/);
  assert.match(frame, /dir="auto"/);
  assert.match(frame, /setInputText\(""\)/);
});

test("diagnostics omit sensitive values and journeys stay distinct from pageAction", () => {
  const journey = applyJourneyInbound({
    journey: startJourney(),
    inboundMessageId: "in-follow",
    extracted: extractSavingsSlots(PRODUCTION_FOLLOW_UP),
  }).journey;
  const current = resolveCurrentTurnJourney({
    journey,
    userId: "tenant-a",
    visitorId: "visitor-a",
    conversationId: "conv-a",
    inboundMessageId: "in-follow",
  });
  const diag = journeyGateDiagnostics(current, "in-follow");
  assert.equal(diag.activeJourneyKind, "pricing_savings");
  assert.equal(diag.activeJourneyTrusted, true);
  assert.equal(diag.activeJourneyContinuation, true);
  assert.equal(diag.collectedFields, collectedFieldNames(journey.collected).join(","));
  assert.match(JSON.stringify(diag), /platform|monthlyVolume|teamSize/);
  assert.doesNotMatch(JSON.stringify(diag), /ManyChat|1000/);
  const auto = read("server/webchatAiAutoReply.ts");
  assert.match(auto, /currentTurnJourney/);
  assert.match(auto, /ok_active_journey|journeyGateDiagnostics/);
  assert.match(read("server/aiAutoSendGate.ts"), /ok_active_journey/);
  assert.match(read("shared/webchatAiPolicy.ts"), /activeJourney/);
  const stored = readActiveJourney(journey);
  assert.equal(stored?.source, "server_active_journey");
});
