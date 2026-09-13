/**
 * Book a demo grounding: workspace Calendly URL vs scanned website booking_link.
 * Run: npx tsx tests/webchat-booking-grounding.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyChatbotVisitorIntent,
  chatbotCompletionPromptRules,
  resolveChatbotCompletionRouting,
} from "../shared/chatbotCompletionContext";
import { matchAskQuestionOpeningMessage } from "../shared/chatbotAskOpeningMatch";
import { decideWebchatAiReply, webchatAutoSendIdempotencyKey } from "../shared/webchatAiPolicy";
import { evaluateFullAutoSend } from "../server/aiAutoSendGate";
import {
  incompleteRequiredFactCodes,
  validateResponseCompleteness,
} from "../shared/factGrounding";
import { retrieveFactsForTurnWithNextAction } from "../shared/knowledgeRetrieval";
import {
  draftContainsVerifiedBookingUrl,
  ensureVerifiedBookingUrlInDraft,
  isTrustedCalendlySchedulingUrl,
  normalizeSchedulingUrlForCompare,
  replaceRetrievedBookingWithVerifiedUrl,
} from "../shared/verifiedBookingUrl";
import { factKey, type KnowledgeFact } from "../shared/businessKnowledgeFacts";
import { dispatchWebchatInboundAi } from "../server/webchatInboundReplyDispatch";
import type { Contact, Conversation } from "@shared/schema";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const DEMO_URL = "https://calendly.com/yanivharamaty/whachatcrm-live-product-demo";
const DEMO_URL_SLASH = `${DEMO_URL}/`;
const CONTACT_URL = "https://www.whachatcrm.com/contact";
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

function fact(factType: KnowledgeFact["factType"], data: unknown, sourceUrl: string): KnowledgeFact {
  return {
    id: `fact-${factType}`,
    userId: "workspace-a",
    factType,
    factKey: factKey(factType, data),
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

const WEBSITE_BOOKING = fact(
  "booking_link",
  { url: CONTACT_URL, label: "Book a Demo" },
  CONTACT_URL,
);
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

const aiBase = {
  rolloutEnabled: true,
  allowlisted: true,
  widgetEnabled: true,
  hasAiBrainAccess: true,
  planIsProOrTrial: true,
  aiModeRaw: "full_auto" as const,
  chatbotOwnsReply: false,
  bookingOwnsReply: false,
  crmFallbackOwnsReply: false,
  handoffActive: false,
  aiPaused: false,
  automationsPaused: false,
  optedOut: false,
  rateLimited: false,
};

function productionMismatchCheck(draft: string) {
  const retrieved = retrieveFactsForTurnWithNextAction({
    facts: [WEBSITE_BOOKING, PRICING],
    message: "Book a demo",
    subIntents: ["booking_question"],
  });
  return validateResponseCompleteness({
    draft,
    retrieved,
    subIntents: ["booking_question"],
  });
}

{
  const before = productionMismatchCheck(
    "אפשר לקבוע הדגמה כאן:\nhttps://calendly.com/yanivharamaty/whachatcrm-live-product-demo",
  );
  assert.equal(before.ok, false, "production mismatch: Calendly draft vs /contact fact");
  assert.deepEqual(incompleteRequiredFactCodes(before), ["next_action_omitted"]);

  const retrieved = retrieveFactsForTurnWithNextAction({
    facts: [WEBSITE_BOOKING, PRICING],
    message: "Book a demo",
    subIntents: ["booking_question"],
  });
  const replaced = replaceRetrievedBookingWithVerifiedUrl(retrieved, DEMO_URL);
  const after = validateResponseCompleteness({
    draft: ensureVerifiedBookingUrlInDraft("נשמח לקבוע הדגמה.", DEMO_URL),
    retrieved: replaced,
    subIntents: ["booking_question"],
  });
  assert.equal(after.ok, true, JSON.stringify(after.violations));
  assert.match(ensureVerifiedBookingUrlInDraft("נשמח לקבוע הדגמה.", DEMO_URL), new RegExp(DEMO_URL.replace(/\//g, "\\/")));
}

{
  assert.equal(classifyChatbotVisitorIntent("Book a demo"), "book_demo");
  assert.equal(classifyChatbotVisitorIntent("קביעת הדגמה"), "book_demo");
  assert.equal(classifyChatbotVisitorIntent("Reservar una demo"), "book_demo");
  const he = matchAskQuestionOpeningMessage("קביעת הדגמה", CANONICAL, [HE]);
  assert.equal(he.matched, true);
  if (he.matched) assert.equal(classifyChatbotVisitorIntent(he.option.value), "book_demo");
  const es = matchAskQuestionOpeningMessage("Reservar una demo", CANONICAL, [ES]);
  assert.equal(es.matched, true);
  if (es.matched) assert.equal(classifyChatbotVisitorIntent(es.option.value), "book_demo");
  const opening = matchAskQuestionOpeningMessage("אני רוצה לקבוע הדגמה", CANONICAL, [HE]);
  assert.equal(opening.matched, true);
  if (opening.matched) assert.equal(classifyChatbotVisitorIntent(opening.option.value), "book_demo");
}

{
  const he = resolveChatbotCompletionRouting({
    inbound: "קביעת הדגמה",
    visitorIntent: "Book a demo",
  });
  assert.ok(he.subIntents.includes("booking_question"));
  const en = resolveChatbotCompletionRouting({ inbound: "Book a demo", visitorIntent: "Book a demo" });
  assert.ok(en.subIntents.includes("booking_question"));
  const es = resolveChatbotCompletionRouting({
    inbound: "Reservar una demo",
    visitorIntent: "Book a demo",
  });
  assert.ok(es.subIntents.includes("booking_question"));
  const pricing = resolveChatbotCompletionRouting({
    inbound: "What does Pro cost?",
    visitorIntent: "Features & pricing",
  });
  assert.ok(!pricing.subIntents.includes("booking_question"));
}

{
  const hePrompt = chatbotCompletionPromptRules({
    visitorIntent: "Book a demo",
    conversationLanguage: "he",
    bookingUrl: DEMO_URL,
  });
  assert.match(hePrompt, /yanivharamaty\/whachatcrm-live-product-demo/);
  const pricingPrompt = chatbotCompletionPromptRules({
    visitorIntent: "Features & pricing",
    conversationLanguage: "en",
    bookingUrl: DEMO_URL,
  });
  assert.doesNotMatch(pricingPrompt, /yanivharamaty\/whachatcrm-live-product-demo/);
}

{
  assert.equal(isTrustedCalendlySchedulingUrl(DEMO_URL), true);
  assert.equal(isTrustedCalendlySchedulingUrl(DEMO_URL_SLASH), true);
  assert.equal(isTrustedCalendlySchedulingUrl("https://calendly.com/yanivharamaty"), false);
  assert.equal(isTrustedCalendlySchedulingUrl("http://calendly.com/yanivharamaty/demo"), false);
  assert.equal(isTrustedCalendlySchedulingUrl("https://evil.example/book"), false);
  assert.equal(isTrustedCalendlySchedulingUrl("javascript:alert(1)"), false);
  const untrusted = "https://evil.example/book";
  const untrustedRetrieved = replaceRetrievedBookingWithVerifiedUrl(
    retrieveFactsForTurnWithNextAction({
      facts: [WEBSITE_BOOKING, PRICING],
      message: "Book a demo",
      subIntents: ["booking_question"],
    }),
    untrusted,
  );
  assert.ok(!untrustedRetrieved.some((entry) => entry.fact.factType === "booking_link"));
  assert.doesNotMatch(ensureVerifiedBookingUrlInDraft("Happy to help.", untrusted), /evil\.example/);
  assert.equal(
    normalizeSchedulingUrlForCompare(DEMO_URL_SLASH),
    normalizeSchedulingUrlForCompare(DEMO_URL),
  );
  assert.equal(draftContainsVerifiedBookingUrl(`See ${DEMO_URL_SLASH}`, DEMO_URL), true);
  const omitted = ensureVerifiedBookingUrlInDraft("Happy to book a walkthrough.", DEMO_URL);
  assert.match(omitted, /whachatcrm-live-product-demo/);
  const held = evaluateFullAutoSend({
    businessMode: "auto",
    channel: "webchat",
    conversationHistory: [{ role: "user", content: "Book a demo" }],
    suggestion: "Happy to help.",
    confidence: 0.9,
    confidenceProvided: true,
    knowledgeGrounded: false,
    groundingViolations: ["incomplete_required_fact"],
  });
  assert.equal(held.allowed, false);
  assert.equal(held.reason, "grounding_violation:incomplete_required_fact");
}

{
  const pricingDraft = "Pro is $49/month.";
  const retrieved = retrieveFactsForTurnWithNextAction({
    facts: [WEBSITE_BOOKING, PRICING],
    message: "What does Pro cost?",
    subIntents: ["pricing_question"],
  });
  const withoutBooking = replaceRetrievedBookingWithVerifiedUrl(retrieved, "");
  assert.ok(!withoutBooking.some((r) => r.fact.factType === "booking_link"));
  assert.doesNotMatch(pricingDraft, /calendly/);
}

{
  assert.equal(decideWebchatAiReply(aiBase), "send_auto");
  const key = webchatAutoSendIdempotencyKey("workspace-a", "evt-book");
  assert.equal(key, "webchat_ai:workspace-a:evt-book");
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
});

{
  const auto = read("server/webchatAiAutoReply.ts");
  assert.match(auto, /inboundMessageId: params\.inboundMessageId/);
  assert.match(auto, /eventType: "ai_suggestion"/);
  assert.match(auto, /holdReason: reasonCode/);
  const channel = read("server/channelService.ts");
  assert.match(channel, /await dispatchWebchatInboundAi/);
  const ai = read("server/aiService.ts");
  assert.match(ai, /applyBookDemoVerifiedBookingGrounding/);
  assert.match(ai, /ensureVerifiedBookingUrlInDraft/);
  assert.match(ai, /!isTrustedCalendlySchedulingUrl\(verifiedBookingUrl\)/);
  assert.match(auto, /already/);
  const composer = read("client/src/components/AIComposer.tsx");
  assert.match(composer, /serverHeldDraft/);
}

console.log("webchat-booking-grounding.test.ts: all assertions passed");
