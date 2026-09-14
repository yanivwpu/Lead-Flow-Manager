/**
 * Structured Ask Question Book a demo must Auto-send; stale/free-text stay gated.
 * Run: npx tsx tests/webchat-structured-booking-auto-send.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { matchAskQuestionQuickReply } from "../shared/chatbotAskQuestionOptions";
import {
  firstAskQuestionFromFlow,
  matchAskQuestionOpeningMessage,
} from "../shared/chatbotAskOpeningMatch";
import { decideWebchatTurnOwner } from "../shared/webchatTurnOwner";
import { detectHighConfidenceBookingIntent } from "../shared/bookingIntent";
import {
  applyChatbotAskAnswer,
  resolveCurrentTurnStructuredAskIntent,
  validateChatbotAskAnswer,
} from "../shared/chatbotAskQuestion";
import { classifyChatbotVisitorIntent } from "../shared/chatbotCompletionContext";
import {
  evaluateFullAutoSend,
  isSafeStructuredBookingCta,
  listMissingRequiredQualificationLabels,
} from "../server/aiAutoSendGate";
import { decideWebchatAiReply, webchatAutoSendIdempotencyKey } from "../shared/webchatAiPolicy";
import { dispatchWebchatInboundAi } from "../server/webchatInboundReplyDispatch";
import type { Contact, Conversation } from "@shared/schema";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const DEMO_URL = "https://calendly.com/yanivharamaty/whachatcrm-live-product-demo";
const HE_REPLY = `נשמח לקבוע הדגמה.\n${DEMO_URL}`;
const CANONICAL = [
  { label: "Features & pricing", value: "Features & pricing" },
  { label: "Find my solution", value: "Find my solution" },
  { label: "Book a demo", value: "Book a demo" },
];
const HE = [
  { label: "פיצ'רים ומחירים", value: "פיצ'רים ומחירים" },
  { label: "למצוא את הפתרון שלי", value: "למצוא את הפתרון שלי" },
  { label: "קביעת הדגמה", value: "קביעת הדגמה" },
];
const ES = [
  { label: "Características y precios", value: "Características y precios" },
  { label: "Encontrar mi solución", value: "Encontrar mi solución" },
  { label: "Reservar una demo", value: "Reservar una demo" },
];

function stampStructured(label: string, inboundMessageId: string, localized: typeof HE) {
  const matched = matchAskQuestionQuickReply(label, CANONICAL, [localized]);
  assert.ok(matched, `expected structured match for ${label}`);
  const validated = validateChatbotAskAnswer("visitor_intent", matched.value);
  assert.equal(validated.ok, true);
  if (!validated.ok) throw new Error("expected valid ask answer");
  const applied = applyChatbotAskAnswer({
    contact: { userId: "workspace-a", customFields: {} },
    expectedUserId: "workspace-a",
    variableName: "visitor_intent",
    validated,
    channel: "webchat",
    conversationId: "conv-1",
    flowRunId: "run-1",
    inboundMessageId,
    sourceEventId: inboundMessageId,
    resolution: "ask_question_structured",
  });
  assert.equal(applied.ok, true);
  if (!applied.ok) throw new Error("expected apply ok");
  return {
    matched,
    customFields: applied.patch.customFields,
    intent: resolveCurrentTurnStructuredAskIntent({
      customFields: applied.patch.customFields,
      inboundMessageId,
    }),
  };
}

const QUALIFYING_GAPS = {
  qualifyingQuestions: [
    { key: "business_profile", label: "Business profile", question: "What type of business do you run?", required: true, enabled: true },
    { key: "budget", label: "Budget", question: "What is your budget?", required: true, enabled: true },
    { key: "timeline", label: "Timeline", question: "When do you want to start?", required: true, enabled: true },
    { key: "package", label: "Package", question: "Which package are you considering?", required: true, enabled: true },
    { key: "channels", label: "Channels", question: "Which channels do you need?", required: true, enabled: true },
  ],
};

function bookingHistory(lastInbound: string, priorInbound?: string) {
  return priorInbound
    ? [
        { role: "user", content: priorInbound },
        { role: "assistant", content: "How can I help?" },
        { role: "user", content: lastInbound },
      ]
    : [{ role: "user", content: lastInbound }];
}

function bookingGate(
  lastInbound: string,
  intent: ReturnType<typeof resolveCurrentTurnStructuredAskIntent> | null,
  extras?: {
    suggestion?: string;
    grounded?: boolean;
    priorInbound?: string;
    businessKnowledge?: typeof QUALIFYING_GAPS;
    verifiedBookingUrl?: string | null;
  },
) {
  return evaluateFullAutoSend({
    businessMode: "auto",
    channel: "webchat",
    conversationHistory: bookingHistory(lastInbound, extras?.priorInbound),
    suggestion: extras?.suggestion ?? HE_REPLY,
    confidence: 0.9,
    confidenceProvided: true,
    knowledgeGrounded: extras?.grounded !== false,
    currentTurnAskIntent: intent,
    businessKnowledge: extras?.businessKnowledge,
    verifiedBookingUrl: extras?.verifiedBookingUrl,
  });
}

{
  const productionHold = bookingGate("קביעת הדגמה", null, { priorInbound: "שלום" });
  assert.equal(productionHold.allowed, false, "production: localized label is reclassified");
  assert.equal(productionHold.reason, "intent_unclear");
}

{
  const he = stampStructured("קביעת הדגמה", "in-he", HE);
  assert.equal(he.matched.value, "Book a demo");
  assert.equal(classifyChatbotVisitorIntent(he.matched.value), "book_demo");
  assert.equal(he.intent.trusted, true);
  assert.equal(he.intent.provenanceCurrentInbound, true);
  assert.equal(he.intent.kind, "book_demo");
  const productionGapHold = bookingGate("קביעת הדגמה", he.intent, {
    businessKnowledge: QUALIFYING_GAPS,
    priorInbound: "שלום",
  });
  assert.equal(productionGapHold.allowed, false);
  assert.equal(productionGapHold.reason, "missing_required_gt_one");
  assert.deepEqual(productionGapHold.missingRequired, [
    "Business profile",
    "Budget",
    "Timeline",
    "Package",
    "Channels",
  ]);
  assert.deepEqual(
    listMissingRequiredQualificationLabels(bookingHistory("קביעת הדגמה", "שלום"), QUALIFYING_GAPS),
    productionGapHold.missingRequired,
  );
  assert.equal(isSafeStructuredBookingCta(HE_REPLY, DEMO_URL), true);

  const sent = bookingGate("קביעת הדגמה", he.intent, {
    businessKnowledge: QUALIFYING_GAPS,
    verifiedBookingUrl: DEMO_URL,
  });
  assert.equal(sent.allowed, true);
  assert.equal(sent.reason, "ok_structured_booking");
  assert.match(HE_REPLY, new RegExp(DEMO_URL.replace(/\//g, "\\/")));
  assert.equal(sent.missingRequired.length > 1, true);
}

{
  const en = stampStructured("Book a demo", "in-en", []);
  assert.equal(en.intent.kind, "book_demo");
  const sent = bookingGate("Book a demo", en.intent, {
    suggestion: `Happy to book a live demo.\n${DEMO_URL}`,
    businessKnowledge: QUALIFYING_GAPS,
    verifiedBookingUrl: DEMO_URL,
  });
  assert.equal(sent.allowed, true);
  assert.equal(sent.reason, "ok_structured_booking");

  const es = stampStructured("Reservar una demo", "in-es", ES);
  assert.equal(es.matched.value, "Book a demo");
  const esSent = bookingGate("Reservar una demo", es.intent, {
    suggestion: `Con gusto agendamos una demo.\n${DEMO_URL}`,
    businessKnowledge: QUALIFYING_GAPS,
    verifiedBookingUrl: DEMO_URL,
  });
  assert.equal(esSent.allowed, true);
  assert.equal(esSent.reason, "ok_structured_booking");
}

function stampOpeningStructured(message: string, inboundMessageId: string) {
  assert.equal(
    matchAskQuestionQuickReply(message, CANONICAL, [HE, ES]),
    null,
    "chip matcher must not treat this free text as a click",
  );
  const opening = matchAskQuestionOpeningMessage(message, CANONICAL, [HE, ES]);
  assert.equal(opening.matched, true, message);
  if (!opening.matched) throw new Error("expected opening match");
  const validated = validateChatbotAskAnswer("visitor_intent", opening.option.value);
  assert.equal(validated.ok, true);
  if (!validated.ok) throw new Error("expected valid");
  const applied = applyChatbotAskAnswer({
    contact: { userId: "workspace-a", customFields: {} },
    expectedUserId: "workspace-a",
    variableName: "visitor_intent",
    validated,
    channel: "webchat",
    conversationId: "conv-new",
    flowRunId: "run-new",
    inboundMessageId,
    sourceEventId: inboundMessageId,
    resolution: "ask_question_structured",
  });
  assert.equal(applied.ok, true);
  if (!applied.ok) throw new Error("expected apply ok");
  const intent = resolveCurrentTurnStructuredAskIntent({
    customFields: applied.patch.customFields,
    inboundMessageId,
  });
  return { opening, customFields: applied.patch.customFields, intent };
}

test("new anonymous conversation: אני רוצה לקבוע הדגמה Auto-sends one Calendly reply", async () => {
  const inboundMessageId = "in-opening-he";
  const inbound = "אני רוצה לקבוע הדגמה";
  assert.equal(detectHighConfidenceBookingIntent(inbound), false);

  const firstAsk = firstAskQuestionFromFlow(
    [
      { id: "start", type: "start", data: {} },
      {
        id: "q1",
        type: "question",
        data: { options: CANONICAL, variableName: "visitor_intent" },
      },
    ],
    [{ source: "start", target: "q1" }],
  );
  assert.equal(firstAsk?.id, "q1");

  const stamped = stampOpeningStructured(inbound, inboundMessageId);
  assert.equal(stamped.opening.option.value, "Book a demo");
  assert.equal(classifyChatbotVisitorIntent(stamped.opening.option.value), "book_demo");
  assert.equal(stamped.intent.trusted, true);
  assert.equal(stamped.intent.provenanceCurrentInbound, true);
  assert.equal(stamped.intent.kind, "book_demo");
  assert.equal(stamped.intent.resolution, "ask_question_structured");
  const structuredBooking =
    stamped.intent.trusted &&
    stamped.intent.provenanceCurrentInbound &&
    stamped.intent.kind === "book_demo";
  assert.equal(structuredBooking, true);
  assert.equal(isSafeStructuredBookingCta(HE_REPLY, DEMO_URL), true);

  const turn = decideWebchatTurnOwner({
    bookingIntent: false,
    chatbot: { triggered: true, visitorFacing: false, reason: "pending_ask_complete" },
  });
  assert.equal(turn.chatbotOwnsReply, false);
  assert.equal(turn.owner, "ai_eligible");

  const gate = bookingGate(inbound, stamped.intent, {
    businessKnowledge: QUALIFYING_GAPS,
    verifiedBookingUrl: DEMO_URL,
  });
  assert.equal(gate.allowed, true);
  assert.equal(gate.reason, "ok_structured_booking");
  assert.match(HE_REPLY, /https:\/\/calendly\.com\/yanivharamaty\/whachatcrm-live-product-demo/);

  const en = stampOpeningStructured("I want to book a demo", "in-opening-en");
  assert.equal(en.opening.option.value, "Book a demo");
  const enGate = bookingGate("I want to book a demo", en.intent, {
    suggestion: `Happy to book a live demo.\n${DEMO_URL}`,
    businessKnowledge: QUALIFYING_GAPS,
    verifiedBookingUrl: DEMO_URL,
  });
  assert.equal(enGate.allowed, true);

  const es = stampOpeningStructured("Quiero reservar una demostración", "in-opening-es");
  assert.equal(es.opening.option.value, "Book a demo");
  const esGate = bookingGate("Quiero reservar una demostración", es.intent, {
    suggestion: `Con gusto agendamos una demo.\n${DEMO_URL}`,
    businessKnowledge: QUALIFYING_GAPS,
    verifiedBookingUrl: DEMO_URL,
  });
  assert.equal(esGate.allowed, true);

  const ambiguous = matchAskQuestionOpeningMessage("אולי אחר כך", CANONICAL, [HE, ES]);
  assert.equal(ambiguous.matched, false);
  const ambiguousGate = bookingGate("אולי אחר כך", null, {
    priorInbound: "שלום",
    businessKnowledge: QUALIFYING_GAPS,
    verifiedBookingUrl: DEMO_URL,
  });
  assert.equal(ambiguousGate.allowed, false);
  assert.notEqual(ambiguousGate.reason, "ok_structured_booking");

  const stale = resolveCurrentTurnStructuredAskIntent({
    customFields: stamped.customFields,
    inboundMessageId: "in-later",
  });
  assert.equal(stale.trusted, false);
  assert.equal(stale.provenanceCurrentInbound, false);

  const contact = { id: "anon-1", userId: "workspace-a" } as Contact;
  const conversation = { id: "conv-new", userId: "workspace-a", contactId: "anon-1" } as Conversation;
  const seen = new Set<string>();
  const runAi = async (p: { inboundMessageId: string }) => {
    if (seen.has(p.inboundMessageId)) return { decision: "skip_already_replied", sent: false };
    seen.add(p.inboundMessageId);
    return { decision: "send_auto", sent: true };
  };
  const args = {
    userId: "workspace-a",
    contact,
    conversation,
    inboundMessageId,
    inboundText: inbound,
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
  assert.equal(first.decision, "send_auto");
  assert.equal(second.sent, false);
  assert.equal(seen.size, 1);

  const engine = read("server/chatbotEngine.ts");
  assert.match(engine, /matchAskQuestionOpeningMessage/);
  assert.match(engine, /Opening inbound already answered Ask Question/);
  assert.match(engine, /ask_question_structured/);
  assert.match(engine, /inboundMessageId: ctx\.inboundMessageId/);
  assert.doesNotMatch(engine, /sendAskQuestionPrompt\(ctx, promptText, askOptions\);\s*[\s\S]*opening\.matched/);
});

{
  const stale = stampStructured("קביעת הדגמה", "in-old", HE);
  const resolved = resolveCurrentTurnStructuredAskIntent({
    customFields: stale.customFields,
    inboundMessageId: "in-new",
  });
  assert.equal(resolved.trusted, false);
  assert.equal(resolved.provenanceCurrentInbound, false);
  const held = bookingGate("תודה", resolved, { priorInbound: "שלום" });
  assert.equal(held.allowed, false);
  assert.notEqual(held.reason, "ok_structured_booking");
}

{
  const free = bookingGate("אולי אחר כך", null, { priorInbound: "שלום" });
  assert.equal(free.allowed, false);
  assert.equal(free.reason, "intent_unclear");
}

{
  const ambiguous = evaluateFullAutoSend({
    businessMode: "auto",
    channel: "webchat",
    conversationHistory: [
      { role: "user", content: "שלום" },
      { role: "user", content: "maybe later" },
    ],
    suggestion: "Happy to help whenever you are ready.",
    confidence: 0.9,
    confidenceProvided: true,
    knowledgeGrounded: true,
  });
  assert.equal(ambiguous.allowed, false);
  assert.equal(ambiguous.reason, "intent_unclear");
}

{
  const untrusted = evaluateFullAutoSend({
    businessMode: "auto",
    channel: "webchat",
    conversationHistory: [{ role: "user", content: "Book a demo" }],
    suggestion: "Book here: https://evil.example/book",
    confidence: 0.9,
    confidenceProvided: true,
    knowledgeGrounded: false,
    groundingViolations: ["incomplete_required_fact"],
    currentTurnAskIntent: { trusted: true, provenanceCurrentInbound: true, kind: "book_demo" },
    businessKnowledge: QUALIFYING_GAPS,
    verifiedBookingUrl: DEMO_URL,
  });
  assert.equal(untrusted.allowed, false);
  assert.match(untrusted.reason, /grounding_violation/);
  assert.equal(isSafeStructuredBookingCta("Book here: https://evil.example/book", DEMO_URL), false);
}

{
  const he = stampStructured("קביעת הדגמה", "in-claim", HE);
  const invented = bookingGate("קביעת הדגמה", he.intent, {
    suggestion: `Tuesday at 3:00 pm is available.\n${DEMO_URL}`,
    businessKnowledge: QUALIFYING_GAPS,
    verifiedBookingUrl: DEMO_URL,
  });
  assert.equal(invented.allowed, false);
  assert.equal(invented.reason, "missing_required_gt_one");
  assert.equal(isSafeStructuredBookingCta(`Tuesday at 3:00 pm is available.\n${DEMO_URL}`, DEMO_URL), false);
}

{
  const pricing = stampStructured("פיצ'רים ומחירים", "in-price", HE);
  assert.equal(pricing.matched.value, "Features & pricing");
  assert.equal(pricing.intent.kind, "features_pricing");
  const gate = bookingGate("פיצ'רים ומחירים", pricing.intent, {
    suggestion: "Pro is $49/month.",
    businessKnowledge: QUALIFYING_GAPS,
    verifiedBookingUrl: DEMO_URL,
  });
  assert.notEqual(gate.reason, "ok_structured_booking");
}

test("duplicate source event creates no duplicate send", async () => {
  const contact = { id: "c1", userId: "workspace-a" } as Contact;
  const conversation = { id: "conv-1", userId: "workspace-a", contactId: "c1" } as Conversation;
  const seen = new Set<string>();
  const runAi = async (p: { inboundMessageId: string }) => {
    if (seen.has(p.inboundMessageId)) return { decision: "skip_already_replied", sent: false };
    seen.add(p.inboundMessageId);
    return { decision: "send_auto", sent: true };
  };
  const args = {
    userId: "workspace-a",
    contact,
    conversation,
    inboundMessageId: "evt-book",
    inboundText: "קביעת הדגמה",
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
  assert.equal(webchatAutoSendIdempotencyKey("workspace-a", "evt-book"), "webchat_ai:workspace-a:evt-book");
});

{
  assert.equal(
    decideWebchatAiReply({
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
    }),
    "send_auto",
  );
  const auto = read("server/webchatAiAutoReply.ts");
  assert.match(auto, /resolveCurrentTurnStructuredAskIntent/);
  assert.match(auto, /currentTurnAskIntent/);
  assert.match(auto, /verifiedBookingUrl/);
  assert.match(auto, /type: "ai_review_draft"/);
  assert.match(auto, /already/);
  const gateSrc = read("server/aiAutoSendGate.ts");
  assert.match(gateSrc, /isSafeStructuredBookingCta/);
  assert.match(gateSrc, /!safeBookingCta/);
  const channel = read("server/channelService.ts");
  assert.match(channel, /inboundMessageId: message\.id/);
  const inbox = read("client/src/pages/UnifiedInbox.tsx");
  assert.match(inbox, /ai_review_draft/);
  assert.match(inbox, /timeline\?limit=60/);
  const engine = read("server/chatbotEngine.ts");
  assert.match(engine, /ask_question_structured/);
  assert.match(engine, /inboundMessageId: ctx\.inboundMessageId/);
}

console.log("webchat-structured-booking-auto-send.test.ts: all assertions passed");
