/**
 * Structured Ask Question Book a demo must Auto-send; stale/free-text stay gated.
 * Run: npx tsx tests/webchat-structured-booking-auto-send.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { matchAskQuestionQuickReply } from "../shared/chatbotAskQuestionOptions";
import { matchAskQuestionOpeningMessage } from "../shared/chatbotAskOpeningMatch";
import {
  applyChatbotAskAnswer,
  resolveCurrentTurnStructuredAskIntent,
  validateChatbotAskAnswer,
} from "../shared/chatbotAskQuestion";
import { classifyChatbotVisitorIntent } from "../shared/chatbotCompletionContext";
import { evaluateFullAutoSend } from "../server/aiAutoSendGate";
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

function bookingGate(
  lastInbound: string,
  intent: ReturnType<typeof resolveCurrentTurnStructuredAskIntent> | null,
  extras?: { suggestion?: string; grounded?: boolean; priorInbound?: string },
) {
  return evaluateFullAutoSend({
    businessMode: "auto",
    channel: "webchat",
    conversationHistory: extras?.priorInbound
      ? [
          { role: "user", content: extras.priorInbound },
          { role: "assistant", content: "How can I help?" },
          { role: "user", content: lastInbound },
        ]
      : [{ role: "user", content: lastInbound }],
    suggestion: extras?.suggestion ?? HE_REPLY,
    confidence: 0.9,
    confidenceProvided: true,
    knowledgeGrounded: extras?.grounded !== false,
    currentTurnAskIntent: intent,
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
  const sent = bookingGate("קביעת הדגמה", he.intent);
  assert.equal(sent.allowed, true);
  assert.equal(sent.reason, "ok_structured_booking");
  assert.match(HE_REPLY, new RegExp(DEMO_URL.replace(/\//g, "\\/")));
}

{
  const en = stampStructured("Book a demo", "in-en", []);
  assert.equal(en.intent.kind, "book_demo");
  const sent = bookingGate("Book a demo", en.intent);
  assert.equal(sent.allowed, true);
  assert.equal(sent.reason, "ok_structured_booking");

  const es = stampStructured("Reservar una demo", "in-es", ES);
  assert.equal(es.matched.value, "Book a demo");
  const esSent = bookingGate("Reservar una demo", es.intent);
  assert.equal(esSent.allowed, true);
  assert.equal(esSent.reason, "ok_structured_booking");
}

{
  const opening = matchAskQuestionOpeningMessage("אני רוצה לקבוע הדגמה", CANONICAL, [HE]);
  assert.equal(opening.matched, true);
  if (opening.matched) assert.equal(opening.option.value, "Book a demo");
}

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
  });
  assert.equal(untrusted.allowed, false);
  assert.match(untrusted.reason, /grounding_violation/);
}

{
  const pricing = stampStructured("פיצ'רים ומחירים", "in-price", HE);
  assert.equal(pricing.matched.value, "Features & pricing");
  assert.equal(pricing.intent.kind, "features_pricing");
  const gate = bookingGate("פיצ'רים ומחירים", pricing.intent, {
    suggestion: "Pro is $49/month.",
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
  assert.match(auto, /type: "ai_review_draft"/);
  assert.match(auto, /already/);
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
