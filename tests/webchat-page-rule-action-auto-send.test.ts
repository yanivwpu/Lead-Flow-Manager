/**
 * Validated Website Chat page-rule actions must Auto-send as explicit choices.
 * Production hold: send_auto:held:conversation_too_short after a drafted reply.
 * Run: npx tsx --test tests/webchat-page-rule-action-auto-send.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Contact, Conversation } from "@shared/schema";
import { createWebchatVisitorId } from "@shared/webchatVisitorId";
import {
  PRICING_PAGE_RULE_ACTION,
  PRICING_PAGE_RULE_FIXTURE,
} from "@shared/webchatPageRuleFixtures";
import {
  bindPageRuleActionToInbound,
  classifyPageRuleActionKindFromRule,
  pageActionGateDiagnostics,
  resolveCurrentTurnPageAction,
  resolveTrustedPageRuleInboundAction,
  stampWebchatPageAction,
} from "@shared/webchatPageRuleAction";
import { matchWidgetPageRule } from "@shared/webchatPageRuleMatch";
import {
  chatbotCompletionPromptRules,
  classifyChatbotVisitorIntent,
  resolveChatbotCompletionRouting,
} from "@shared/chatbotCompletionContext";
import { evaluateFullAutoSend, isSafeStructuredBookingCta } from "../server/aiAutoSendGate";
import { parseWebchatInboundBody } from "../server/webchatAccess";
import { decideWebchatAiReply, webchatAutoSendIdempotencyKey } from "../shared/webchatAiPolicy";
import { dispatchWebchatInboundAi } from "../server/webchatInboundReplyDispatch";
import { pageRuleChatbotTriggerGates } from "@shared/webchatPageRuleChatbotGates";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const DEMO_URL = "https://calendly.com/yanivharamaty/whachatcrm-live-product-demo";
const PRICING = { pageRules: [PRICING_PAGE_RULE_FIXTURE] };
const PARENT = "https://www.whachatcrm.com/pricing";
const HOME = "https://www.whachatcrm.com/";
const CONTACT_CTA = "https://www.whachatcrm.com/contact";

const QUALIFYING_GAPS = {
  qualifyingQuestions: [
    { key: "business_profile", label: "Business profile", question: "What type of business do you run?", required: true, enabled: true },
    { key: "budget", label: "Budget", question: "What is your budget?", required: true, enabled: true },
  ],
};

const aiBase = {
  rolloutEnabled: true,
  allowlisted: true,
  widgetEnabled: true,
  hasAiBrainAccess: true,
  planIsProOrTrial: true,
  aiModeRaw: "full_auto" as string | null,
  chatbotOwnsReply: false,
  bookingOwnsReply: false,
  crmFallbackOwnsReply: false,
  handoffActive: false,
  aiPaused: false,
  automationsPaused: false,
  optedOut: false,
  rateLimited: false,
};

const COMPARE_ANSWER =
  "Free includes the website widget. Pro is $49/month and adds shared inbox, automations, and AI.";
const SAVINGS_QUESTION =
  "What platform do you use today, and about how much do you pay per month?";
const BOOKING_REPLY = `Happy to book a walkthrough.\n${DEMO_URL}`;

function localeQuestions(locale: "en" | "es" | "he") {
  return [...PRICING_PAGE_RULE_FIXTURE.localized[locale].suggestedQuestions];
}

function widgetInbound(input: {
  message: string;
  actionIndex?: number;
  canonicalIntent?: string;
  parentUrl?: string;
  locale?: string;
  originAuthorized?: boolean;
  inboundMessageId?: string;
  staleInboundMessageId?: string;
}) {
  const parsed = parseWebchatInboundBody({
    visitorId: createWebchatVisitorId(),
    message: input.message,
    parentUrl: input.parentUrl ?? PARENT,
    locale: input.locale,
    pageRuleAction:
      typeof input.actionIndex === "number" || input.canonicalIntent
        ? { actionIndex: input.actionIndex, canonicalIntent: input.canonicalIntent }
        : undefined,
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("expected parse ok");
  const inboundId = input.inboundMessageId || "in-current";
  const validated = resolveTrustedPageRuleInboundAction({
    originAuthorized: input.originAuthorized !== false,
    settings: PRICING,
    parentUrl: parsed.data.parentUrl,
    locale: parsed.data.locale || input.locale,
    message: parsed.data.message,
    actionIndex: parsed.data.pageRuleActionIndex,
  });
  const stamp = validated ? bindPageRuleActionToInbound(validated, inboundId) : null;
  const pageContext = stampWebchatPageAction({}, stamp);
  const current = resolveCurrentTurnPageAction({
    pageContext,
    inboundMessageId: input.staleInboundMessageId || inboundId,
  });
  return { parsed: parsed.data, validated, stamp, pageContext, current };
}

function gateFor(
  lastInbound: string,
  pageAction: ReturnType<typeof resolveCurrentTurnPageAction>,
  extras?: {
    suggestion?: string;
    grounded?: boolean;
    confidenceProvided?: boolean;
    groundingViolations?: string[];
    businessMode?: "off" | "suggest" | "auto";
    verifiedBookingUrl?: string | null;
  },
) {
  return evaluateFullAutoSend({
    businessMode: extras?.businessMode ?? "auto",
    channel: "webchat",
    conversationHistory: [{ role: "user", content: lastInbound }],
    suggestion: extras?.suggestion ?? COMPARE_ANSWER,
    confidence: 0.9,
    confidenceProvided: extras?.confidenceProvided !== false,
    knowledgeGrounded: extras?.grounded !== false,
    groundingViolations: extras?.groundingViolations,
    currentTurnPageAction: pageAction,
    businessKnowledge: QUALIFYING_GAPS,
    verifiedBookingUrl: extras?.verifiedBookingUrl ?? DEMO_URL,
  });
}

test("production-shaped /pricing EN actions Auto-send from the public inbound contract", () => {
  const matched = matchWidgetPageRule(PRICING, PARENT, "en");
  assert.ok(matched);
  assert.equal(classifyPageRuleActionKindFromRule(matched, PRICING_PAGE_RULE_ACTION.compare), "compare_plans");
  assert.equal(classifyPageRuleActionKindFromRule(matched, PRICING_PAGE_RULE_ACTION.savings), "calculate_savings");
  assert.equal(classifyPageRuleActionKindFromRule(matched, PRICING_PAGE_RULE_ACTION.bookDemo), "book_demo");

  const labels = localeQuestions("en");
  const compare = widgetInbound({
    message: labels[PRICING_PAGE_RULE_ACTION.compare],
    actionIndex: PRICING_PAGE_RULE_ACTION.compare,
    inboundMessageId: "in-compare",
  });
  const compareGate = gateFor(compare.parsed.message, compare.current, { suggestion: COMPARE_ANSWER });
  assert.equal(compare.current.trusted, true);
  assert.equal(compare.current.kind, "compare_plans");
  assert.equal(compareGate.allowed, true);
  assert.equal(compareGate.reason, "ok_validated_page_action");
  assert.equal(compareGate.explicitUserChoice, true);
  assert.equal(compareGate.pageActionValidated, true);
  assert.equal(compareGate.pageActionCurrentInbound, true);
  assert.equal(compareGate.pageRuleKey, matched.ruleKey);
  assert.equal(compareGate.pageActionIndex, 0);

  const savings = widgetInbound({
    message: labels[PRICING_PAGE_RULE_ACTION.savings],
    actionIndex: PRICING_PAGE_RULE_ACTION.savings,
    inboundMessageId: "in-savings",
  });
  const savingsGate = gateFor(savings.parsed.message, savings.current, {
    suggestion: SAVINGS_QUESTION,
    grounded: false,
  });
  assert.equal(savings.current.kind, "calculate_savings");
  assert.equal(savingsGate.allowed, true);
  assert.equal(savingsGate.reason, "ok_validated_page_action");
  assert.equal(savingsGate.inboundCount, 1);
  assert.match(SAVINGS_QUESTION, /platform/i);
  assert.match(SAVINGS_QUESTION, /month/i);
  assert.equal(/\n/.test(SAVINGS_QUESTION.trim()), false);

  const book = widgetInbound({
    message: labels[PRICING_PAGE_RULE_ACTION.bookDemo],
    actionIndex: PRICING_PAGE_RULE_ACTION.bookDemo,
    inboundMessageId: "in-book",
  });
  const bookGate = gateFor(book.parsed.message, book.current, {
    suggestion: BOOKING_REPLY,
    verifiedBookingUrl: DEMO_URL,
  });
  assert.equal(book.current.kind, "book_demo");
  assert.equal(bookGate.allowed, true);
  assert.equal(bookGate.reason, "ok_structured_booking");
  assert.equal(isSafeStructuredBookingCta(BOOKING_REPLY, DEMO_URL), true);
  assert.doesNotMatch(BOOKING_REPLY, /whachatcrm\.com\/contact/);
});

test("ES and HE configured labels map by validated index, not hardcoded phrases", () => {
  for (const locale of ["es", "he"] as const) {
    const labels = localeQuestions(locale);
    const compare = widgetInbound({
      message: labels[PRICING_PAGE_RULE_ACTION.compare],
      actionIndex: PRICING_PAGE_RULE_ACTION.compare,
      locale,
    });
    const savings = widgetInbound({
      message: labels[PRICING_PAGE_RULE_ACTION.savings],
      actionIndex: PRICING_PAGE_RULE_ACTION.savings,
      locale,
    });
    const book = widgetInbound({
      message: labels[PRICING_PAGE_RULE_ACTION.bookDemo],
      actionIndex: PRICING_PAGE_RULE_ACTION.bookDemo,
      locale,
    });
    assert.equal(compare.current.kind, "compare_plans");
    assert.equal(gateFor(compare.parsed.message, compare.current).reason, "ok_validated_page_action");
    assert.equal(savings.current.kind, "calculate_savings");
    assert.equal(
      gateFor(savings.parsed.message, savings.current, { suggestion: SAVINGS_QUESTION, grounded: false }).reason,
      "ok_validated_page_action",
    );
    assert.equal(book.current.kind, "book_demo");
    assert.equal(
      gateFor(book.parsed.message, book.current, { suggestion: BOOKING_REPLY }).reason,
      "ok_structured_booking",
    );
    const prompt = chatbotCompletionPromptRules({
      inbound: labels[PRICING_PAGE_RULE_ACTION.savings],
      pageActionKind: savings.current.kind,
      bookingUrl: DEMO_URL,
    });
    assert.match(prompt, /current platform and approximate monthly cost/);
    assert.doesNotMatch(prompt, /Share this exact workspace-selected Calendly/);
    const bookPrompt = chatbotCompletionPromptRules({
      inbound: labels[PRICING_PAGE_RULE_ACTION.bookDemo],
      pageActionKind: "book_demo",
      bookingUrl: DEMO_URL,
    });
    assert.match(bookPrompt, /yanivharamaty\/whachatcrm-live-product-demo/);
    assert.doesNotMatch(bookPrompt, /whachatcrm\.com\/contact/);
  }
});

test("typed label without action provenance stays held as conversation_too_short", () => {
  const typed = widgetInbound({ message: "Calculate my savings" });
  assert.equal(typed.parsed.pageRuleActionIndex, undefined);
  assert.equal(typed.validated, null);
  assert.equal(typed.current.trusted, false);
  const held = gateFor("Calculate my savings", typed.current, { suggestion: SAVINGS_QUESTION, grounded: false });
  assert.equal(held.allowed, false);
  assert.equal(held.reason, "conversation_too_short");
  assert.equal(held.explicitUserChoice, false);
});

test("mismatched label/index, forged canonical intent, wrong page, and unauthorized origin stay untrusted", () => {
  const mismatch = widgetInbound({
    message: "Calculate my savings",
    actionIndex: PRICING_PAGE_RULE_ACTION.compare,
  });
  assert.equal(mismatch.validated, null);

  const forged = widgetInbound({
    message: localeQuestions("en")[PRICING_PAGE_RULE_ACTION.compare],
    actionIndex: PRICING_PAGE_RULE_ACTION.compare,
    canonicalIntent: "book_demo",
  });
  assert.equal("canonicalIntent" in forged.parsed, false);
  assert.equal(forged.current.kind, "compare_plans");
  assert.notEqual(forged.current.kind, "book_demo");

  const wrongPage = widgetInbound({
    message: "Calculate my savings",
    actionIndex: PRICING_PAGE_RULE_ACTION.savings,
    parentUrl: HOME,
  });
  assert.equal(wrongPage.validated, null);
  assert.equal(gateFor("Calculate my savings", wrongPage.current).reason, "conversation_too_short");

  const unauthorized = widgetInbound({
    message: "Calculate my savings",
    actionIndex: PRICING_PAGE_RULE_ACTION.savings,
    originAuthorized: false,
  });
  assert.equal(unauthorized.validated, null);
});

test("stale inbound provenance never qualifies the current turn", () => {
  const stale = widgetInbound({
    message: "Calculate my savings",
    actionIndex: PRICING_PAGE_RULE_ACTION.savings,
    inboundMessageId: "in-old",
    staleInboundMessageId: "in-new",
  });
  assert.equal(stale.stamp?.inboundMessageId, "in-old");
  assert.equal(stale.current.trusted, false);
  assert.equal(stale.current.provenanceCurrentInbound, false);
  const held = gateFor("Calculate my savings", stale.current, { suggestion: SAVINGS_QUESTION, grounded: false });
  assert.equal(held.allowed, false);
  assert.equal(held.reason, "conversation_too_short");
});

test("unsafe or ungrounded drafts remain held; contact CTA is not a booking URL", () => {
  const savings = widgetInbound({
    message: "Calculate my savings",
    actionIndex: PRICING_PAGE_RULE_ACTION.savings,
  });
  const invented = gateFor(savings.parsed.message, savings.current, {
    suggestion: "You would save $480 each month by switching to Pro.",
    grounded: false,
  });
  assert.equal(invented.allowed, false);
  assert.equal(invented.reason, "ungrounded_pricing");

  const groundedHold = gateFor(savings.parsed.message, savings.current, {
    suggestion: COMPARE_ANSWER,
    groundingViolations: ["unsupported_amount"],
  });
  assert.equal(groundedHold.allowed, false);
  assert.match(groundedHold.reason, /grounding_violation/);

  const book = widgetInbound({
    message: "Book a demo",
    actionIndex: PRICING_PAGE_RULE_ACTION.bookDemo,
  });
  const contactCta = gateFor(book.parsed.message, book.current, {
    suggestion: `Book here: ${CONTACT_CTA}`,
    groundingViolations: ["incomplete_required_fact"],
  });
  assert.equal(contactCta.allowed, false);
  assert.equal(isSafeStructuredBookingCta(`Book here: ${CONTACT_CTA}`, DEMO_URL), false);
});

test("Auto off, Suggest, human takeover, and pending chatbot still suppress send", async () => {
  const click = widgetInbound({
    message: "Calculate my savings",
    actionIndex: PRICING_PAGE_RULE_ACTION.savings,
  });
  assert.equal(
    gateFor(click.parsed.message, click.current, { businessMode: "off", suggestion: SAVINGS_QUESTION }).reason,
    "business_mode_not_auto",
  );
  assert.equal(
    gateFor(click.parsed.message, click.current, { businessMode: "suggest", suggestion: SAVINGS_QUESTION }).reason,
    "business_mode_not_auto",
  );
  assert.equal(decideWebchatAiReply({ ...aiBase, aiModeRaw: "off" }), "skip_manual");
  assert.equal(decideWebchatAiReply({ ...aiBase, aiModeRaw: "suggest" }), "suggest_only");
  assert.equal(decideWebchatAiReply({ ...aiBase, handoffActive: true }), "skip_handoff");
  assert.equal(decideWebchatAiReply({ ...aiBase, chatbotOwnsReply: true }), "skip_chatbot_owns");

  const pending = pageRuleChatbotTriggerGates({
    isNewConversation: true,
    skipNewChatTrigger: true,
    preferredFlowId: "flow-pricing",
  });
  assert.equal(pending.allowNewChatTrigger, false);
  assert.equal(pending.preferredFlowId, "flow-pricing");
  const existing = pageRuleChatbotTriggerGates({
    isNewConversation: false,
    skipNewChatTrigger: true,
    preferredFlowId: "flow-pricing",
  });
  assert.equal(existing.preferredFlowId, undefined);

  const contact = { id: "c1", userId: "workspace-a" } as Contact;
  const conversation = { id: "conv-1", userId: "workspace-a", contactId: "c1" } as Conversation;
  let runs = 0;
  const out = await dispatchWebchatInboundAi(
    {
      userId: "workspace-a",
      contact,
      conversation,
      inboundMessageId: "in-pending",
      inboundText: "Calculate my savings",
      contentType: "text",
      channel: "webchat",
      chatbotOwnsReply: true,
      turnOwner: "chatbot",
      awayConfigured: false,
      awayReplyWillSend: false,
      widgetSettings: { enabled: true },
    },
    {
      runAi: async () => {
        runs += 1;
        return { decision: "send_auto", sent: true };
      },
    },
  );
  assert.equal(out.evaluated, false);
  assert.equal(runs, 0);
});

test("duplicate delivery does not send twice", async () => {
  const inboundMessageId = "in-dup-savings";
  const seen = new Set<string>();
  const contact = { id: "c1", userId: "workspace-a" } as Contact;
  const conversation = { id: "conv-1", userId: "workspace-a", contactId: "c1" } as Conversation;
  const runAi = async (p: { inboundMessageId: string }) => {
    if (seen.has(p.inboundMessageId)) return { decision: "skip_already_replied", sent: false };
    seen.add(p.inboundMessageId);
    return { decision: "ok_validated_page_action", sent: true };
  };
  const args = {
    userId: "workspace-a",
    contact,
    conversation,
    inboundMessageId,
    inboundText: "Calculate my savings",
    contentType: "text",
    channel: "webchat",
    chatbotOwnsReply: false,
    turnOwner: "ai_eligible" as const,
    awayConfigured: false,
    awayReplyWillSend: false,
    widgetSettings: { enabled: true },
  };
  const first = await dispatchWebchatInboundAi(args, { runAi });
  const second = await dispatchWebchatInboundAi(args, { runAi });
  assert.equal(first.sent, true);
  assert.equal(second.sent, false);
  assert.equal(seen.size, 1);
  assert.equal(webchatAutoSendIdempotencyKey("workspace-a", inboundMessageId), `webchat_ai:workspace-a:${inboundMessageId}`);
});

test("completion prompts stay conversational by validated kind", () => {
  const compare = chatbotCompletionPromptRules({
    inbound: "השוואת Free ו-Pro",
    pageActionKind: "compare_plans",
    bookingUrl: DEMO_URL,
  });
  assert.match(compare, /published plans or pricing/);
  assert.doesNotMatch(compare, /Share this exact workspace-selected Calendly/);
  const savings = chatbotCompletionPromptRules({
    inbound: "Calcular mi ahorro",
    pageActionKind: "calculate_savings",
    bookingUrl: DEMO_URL,
  });
  assert.match(savings, /Do not invent a calculation or savings amount/);
  assert.doesNotMatch(savings, /Share this exact workspace-selected Calendly/);
  const book = resolveChatbotCompletionRouting({
    inbound: "קביעת הדגמה",
    pageActionKind: "book_demo",
  });
  assert.equal(book.subIntents.includes("booking_question"), true);
  assert.equal(classifyChatbotVisitorIntent("Calculate my savings"), "calculate_savings");
});

test("public inbound route stamps current-turn provenance and does not persist visitor_intent", () => {
  const webhooks = read("server/routes/webhooks.ts");
  const channel = read("server/channelService.ts");
  const auto = read("server/webchatAiAutoReply.ts");
  const gate = read("server/aiAutoSendGate.ts");
  const inbox = read("server/routes.ts");
  assert.match(webhooks, /resolveTrustedPageRuleInboundAction/);
  assert.match(webhooks, /originAuthorized: true/);
  assert.match(webhooks, /validatedPageRuleAction: validatedAction/);
  assert.match(webhooks, /strictOrigin:\s*true/);
  assert.doesNotMatch(
    webhooks.slice(webhooks.indexOf('app.post("/api/webchat/:userId"'), webhooks.indexOf('app.get("/api/webchat/:userId/settings"')),
    /visitor_intent/,
  );
  assert.match(channel, /bindPageRuleActionToInbound/);
  assert.match(channel, /stampWebchatPageAction/);
  assert.match(channel, /validatedPageRuleAction/);
  assert.match(auto, /resolveCurrentTurnPageAction/);
  assert.match(auto, /currentTurnPageAction/);
  assert.match(auto, /resolveCurrentTurnJourney/);
  assert.match(auto, /pageActionValidated/);
  assert.match(auto, /ok_validated_page_action|pageActionGateDiagnostics/);
  assert.match(gate, /ok_validated_page_action/);
  assert.match(gate, /conversation_too_short/);
  assert.match(inbox, /resolveCurrentTurnPageAction/);
  assert.match(inbox, /resolveCurrentTurnJourney/);
  const diag = pageActionGateDiagnostics({
    trusted: true,
    provenanceCurrentInbound: true,
    explicitUserChoice: true,
    ruleKey: "pathname:/pricing",
    actionIndex: 1,
  });
  assert.deepEqual(diag, {
    pageActionValidated: true,
    pageActionCurrentInbound: true,
    pageRuleKey: "pathname:/pricing",
    pageActionIndex: 1,
    explicitUserChoice: true,
  });
});
