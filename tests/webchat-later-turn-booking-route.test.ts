/**
 * Production-shaped Website Chat route: Features & pricing, then later
 * "I'd like to schedule a demo" must use the workspace Calendly URL.
 * Same inbound owner, completion context, retrieval, and URL enforcement as
 * webchatAiAutoReply.defaultGenerate → aiService.suggestReply.
 * Run: npx tsx tests/webchat-later-turn-booking-route.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Contact, Conversation } from "@shared/schema";
import { decideWebchatInboundAiEvaluation } from "@shared/webchatInboundAiDispatch";
import { dispatchWebchatInboundAi } from "../server/webchatInboundReplyDispatch";
import { decideWebchatTurnOwner } from "@shared/webchatTurnOwner";
import { detectHighConfidenceBookingIntent } from "@shared/bookingIntent";
import {
  applyChatbotAskAnswer,
  resolveCurrentTurnStructuredAskIntent,
  validateChatbotAskAnswer,
} from "@shared/chatbotAskQuestion";
import { matchAskQuestionQuickReply } from "@shared/chatbotAskQuestionOptions";
import {
  buildChatbotCompletionContactContext,
  chatbotCompletionPromptRules,
  isCanonicalBookingTurn,
  resolveChatbotCompletionRouting,
} from "@shared/chatbotCompletionContext";
import { retrieveFactsForTurnWithNextAction } from "@shared/knowledgeRetrieval";
import { factKey, type KnowledgeFact } from "@shared/businessKnowledgeFacts";
import {
  assembleDeterministicGroundedDraft,
  validateResponseCompleteness,
} from "@shared/factGrounding";
import {
  ensureVerifiedBookingUrlInDraft,
  replaceRetrievedBookingWithVerifiedUrl,
  replaceUntrustedBookingUrlsInKnowledgeText,
} from "@shared/verifiedBookingUrl";
import { evaluateFullAutoSend } from "../server/aiAutoSendGate";
import { applyBookDemoVerifiedBookingGrounding } from "../server/websiteKnowledge/factContext";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const DEMO_URL = "https://calendly.com/yanivharamaty/whachatcrm-live-product-demo";
const CONTACT_URL = "https://www.whachatcrm.com/contact";
const CANONICAL = [
  { label: "Features & pricing", value: "Features & pricing" },
  { label: "Find my solution", value: "Find my solution" },
  { label: "Book a demo", value: "Book a demo" },
];

function fact(factType: KnowledgeFact["factType"], data: unknown, sourceUrl: string): KnowledgeFact {
  return {
    id: `fact-${factType}`,
    userId: "workspace-a",
    factType,
    factKey: factKey(factType, data as never),
    data,
    state: "published",
    proposedAction: null,
    origin: "website_verified",
    confidence: 0.9,
    isPinned: false,
    userEdited: false,
    conflictGroup: null,
    conflictResolution: null,
    supersededByFactId: null,
    sourceId: "src-1",
    sourceUrl,
    sourceTitle: "Site",
    excerpt: null,
    provenance: [],
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastVerifiedAt: "2026-08-01T00:00:00.000Z",
    publishedAt: "2026-08-01T00:00:00.000Z",
    retiredAt: null,
  } as KnowledgeFact;
}

const WEBSITE_BOOKING = fact("booking_link", { url: CONTACT_URL, label: "Book a Demo" }, CONTACT_URL);
const PRICING = fact(
  "pricing_plan",
  {
    name: "Pro",
    description: null,
    price: { amount: 49, currency: "USD", billingPeriod: "month" },
    priceQualifier: "exact",
    benefits: ["Inbox", "AI Brain"],
  },
  "https://www.whachatcrm.com/pricing",
);

function stampFeaturesAndPricing(inboundMessageId: string) {
  const matched = matchAskQuestionQuickReply("Features & pricing", CANONICAL);
  assert.ok(matched);
  const validated = validateChatbotAskAnswer("visitor_intent", matched!.value);
  assert.equal(validated.ok, true);
  if (!validated.ok) throw new Error("expected valid");
  const applied = applyChatbotAskAnswer({
    contact: { userId: "workspace-a", customFields: {} },
    expectedUserId: "workspace-a",
    variableName: "visitor_intent",
    validated,
    channel: "webchat",
    conversationId: "conv-later",
    flowRunId: "run-later",
    inboundMessageId,
    sourceEventId: inboundMessageId,
    resolution: "ask_question_structured",
  });
  assert.equal(applied.ok, true);
  if (!applied.ok) throw new Error("expected apply");
  return applied.patch.customFields;
}

/**
 * Same order as defaultGenerate + suggestReply booking enforcement,
 * without calling the model. The draft starts as the production-wrong /contact CTA.
 */
function generateLaterTurnBookingReply(input: {
  inboundText: string;
  visitorIntent: string | undefined;
  history: Array<{ role: string; content: string }>;
  customFields: unknown;
}): { suggestion: string; routingDecision: string; subIntents: string[] } {
  const completion = buildChatbotCompletionContactContext({
    customFields: input.customFields,
    leadSource: "webchat",
  });
  assert.equal(completion.visitorIntent, "Features & pricing");
  const routing = resolveChatbotCompletionRouting({
    inbound: input.inboundText,
    visitorIntent: completion.visitorIntent,
    history: input.history,
  });
  const retrieved = retrieveFactsForTurnWithNextAction({
    facts: [WEBSITE_BOOKING, PRICING],
    message: input.inboundText,
    subIntents: routing.subIntents,
  });
  const grounding = applyBookDemoVerifiedBookingGrounding(
    {
      retrieved,
      block: { text: "", factCount: retrieved.length, staleFactCount: 0, coveredTypes: [] },
      conflictingKeys: [],
    },
    DEMO_URL,
  );
  const prompt = chatbotCompletionPromptRules({
    visitorIntent: completion.visitorIntent,
    inbound: input.inboundText,
    bookingUrl: DEMO_URL,
    history: input.history,
  });
  const knowledge = replaceUntrustedBookingUrlsInKnowledgeText(
    `Book a Demo: ${CONTACT_URL}`,
    DEMO_URL,
  );
  const productionWrongDraft = `Book a Demo: ${CONTACT_URL}`;
  const suggestion = ensureVerifiedBookingUrlInDraft(productionWrongDraft, DEMO_URL);
  const completeness = validateResponseCompleteness({
    draft: suggestion,
    retrieved: grounding.retrieved,
    subIntents: routing.subIntents,
  });
  assert.equal(routing.decision, "BOOK_APPOINTMENT");
  assert.ok(routing.subIntents.includes("booking_question"));
  assert.ok(!routing.subIntents.includes("pricing_question"));
  assert.match(prompt, /yanivharamaty\/whachatcrm-live-product-demo/);
  assert.doesNotMatch(prompt, /Do not add a booking CTA/);
  assert.doesNotMatch(knowledge, /whachatcrm\.com\/contact/);
  assert.equal(completeness.ok, true);
  return { suggestion, routingDecision: routing.decision, subIntents: routing.subIntents };
}

await (async () => {
  assert.equal(isCanonicalBookingTurn({ inbound: "I'd like to schedule a demo" }), true);
  assert.equal(detectHighConfidenceBookingIntent("I'd like to schedule a demo"), false);
  const customFields = stampFeaturesAndPricing("in-pricing");
  const stampedIntent = resolveCurrentTurnStructuredAskIntent({
    customFields,
    inboundMessageId: "in-later-demo",
  });
  assert.equal(stampedIntent.trusted, false, "stale Features & pricing must not be current-turn structured booking");

  const history = [
    { role: "user", content: "Features & pricing" },
    { role: "assistant", content: "Pro is $49/month with inbox and AI Brain." },
    { role: "user", content: "I'd like to schedule a demo" },
  ];

  const owner = decideWebchatTurnOwner({
    bookingIntent: detectHighConfidenceBookingIntent("I'd like to schedule a demo"),
    chatbot: { triggered: true, visitorFacing: false, reason: "pending_ask_complete" },
  });
  assert.equal(owner.owner, "ai_eligible");
  assert.equal(owner.chatbotOwnsReply, false);
  assert.equal(
    decideWebchatInboundAiEvaluation({
      channel: "webchat",
      chatbotOwnsReply: false,
      turnOwner: owner.owner,
      awayReplyWillSend: false,
    }).evaluateAi,
    true,
  );

  const generated = generateLaterTurnBookingReply({
    inboundText: "I'd like to schedule a demo",
    visitorIntent: "Features & pricing",
    history,
    customFields,
  });
  assert.match(generated.suggestion, /yanivharamaty\/whachatcrm-live-product-demo/);
  assert.doesNotMatch(generated.suggestion, /whachatcrm\.com\/contact/);

  const det = assembleDeterministicGroundedDraft({
    retrieved: replaceRetrievedBookingWithVerifiedUrl(
      retrieveFactsForTurnWithNextAction({
        facts: [WEBSITE_BOOKING, PRICING],
        message: "I'd like to schedule a demo",
        subIntents: generated.subIntents,
      }),
      DEMO_URL,
    ),
    subIntents: generated.subIntents,
  });
  assert.match(det, /yanivharamaty\/whachatcrm-live-product-demo/);
  assert.doesNotMatch(det, /whachatcrm\.com\/contact/);

  const gate = evaluateFullAutoSend({
    businessMode: "auto",
    channel: "webchat",
    conversationHistory: history,
    suggestion: generated.suggestion,
    confidence: 0.9,
    confidenceProvided: true,
    knowledgeGrounded: true,
    verifiedBookingUrl: DEMO_URL,
    currentTurnAskIntent: stampedIntent,
  });
  assert.equal(gate.allowed, true);

  const contact = {
    id: "c-later",
    userId: "workspace-a",
    customFields,
  } as Contact;
  const conversation = {
    id: "conv-later",
    userId: "workspace-a",
    contactId: "c-later",
  } as Conversation;
  let sentText = "";
  const dispatched = await dispatchWebchatInboundAi(
    {
      userId: "workspace-a",
      contact,
      conversation,
      inboundMessageId: "in-later-demo",
      inboundText: "I'd like to schedule a demo",
      contentType: "text",
      channel: "webchat",
      chatbotOwnsReply: false,
      turnOwner: "ai_eligible",
      awayConfigured: false,
      awayReplyWillSend: false,
      widgetSettings: { enabled: true },
    },
    {
      runAi: async (p) => {
        const out = generateLaterTurnBookingReply({
          inboundText: p.inboundText,
          visitorIntent: "Features & pricing",
          history,
          customFields,
        });
        sentText = out.suggestion;
        return { decision: "send_auto", sent: true };
      },
    },
  );
  assert.equal(dispatched.evaluated, true);
  assert.equal(dispatched.sent, true);
  assert.match(sentText, /yanivharamaty\/whachatcrm-live-product-demo/);
  assert.doesNotMatch(sentText, /whachatcrm\.com\/contact/);

  const auto = read("server/webchatAiAutoReply.ts");
  assert.match(auto, /resolveChatbotCompletionRouting/);
  assert.match(auto, /applyCalendlyBookingLinkForAi/);
  assert.match(auto, /buildChatbotCompletionContactContext/);
  const ai = read("server/aiService.ts");
  assert.match(ai, /isCanonicalBookingTurn/);
  assert.match(ai, /ensureVerifiedBookingUrlInDraft/);
  assert.match(ai, /applyBookDemoVerifiedBookingGrounding/);
})();

console.log("webchat-later-turn-booking-route.test.ts: all assertions passed");
