/**
 * Website Chat booking journey: name safety, acknowledgment, score/recommendation,
 * Auto projection, Calendly identity promotion.
 * Run: npx tsx tests/webchat-booking-intelligence.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveAiRouting, routingAllowsSchedulingLink } from "../shared/aiRouting";
import {
  detectBookingAcknowledgment,
  detectBookingLinkResendRequest,
  detectHighConfidenceBookingIntent,
  lastAssistantCalendlyUrl,
} from "../shared/bookingIntent";
import {
  buildChatbotCompletionContactContext,
  chatbotCompletionPromptRules,
  classifyChatbotVisitorIntent,
  isCanonicalBookingTurn,
  resolveChatbotCompletionRouting,
} from "../shared/chatbotCompletionContext";
import {
  formatPersonalizedBookingLinkReply,
  usableVisitorPersonalizationFirstName,
  usableVisitorPersonalizationName,
} from "../shared/visitorNamePersonalization";
import { scoreLead } from "../client/src/lib/leadScoring";
import {
  buildContextualNextActions,
  buildCustomerInsights,
} from "../shared/customerInsights";
import {
  collectValidatedIdentity,
  meetsWebchatPromotionThreshold,
} from "../shared/webchatIdentityFields";
import { decideWebchatTurnOwner } from "../shared/webchatTurnOwner";
import { webchatAutoSendIdempotencyKey } from "../shared/webchatAiPolicy";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const DEMO_URL = "https://calendly.com/whachatcrm/product-demo";
const BOOKING_HISTORY = [
  { role: "user", content: "Book a demo" },
  { role: "assistant", content: `Sure — you can pick a time here:\n${DEMO_URL}` },
];

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`ok ${name}`))
    .catch((err) => {
      console.error(`FAIL ${name}`, err);
      process.exitCode = 1;
    });
}

await test("unknown Web Chat visitor never receives Hi Website", () => {
  assert.equal(usableVisitorPersonalizationName({ name: "Website Visitor" }), null);
  assert.equal(usableVisitorPersonalizationFirstName({ name: "Website Visitor" }), null);
  assert.equal(usableVisitorPersonalizationName({ name: "Website" }), null);
  assert.equal(usableVisitorPersonalizationName({ name: "Web Chat" }), null);
  assert.equal(usableVisitorPersonalizationName({ name: "Unknown" }), null);
  assert.equal(usableVisitorPersonalizationName({ name: "Visitor" }), null);
  assert.equal(usableVisitorPersonalizationName({ name: "Guest" }), null);
  assert.equal(
    usableVisitorPersonalizationName({ name: "Acme CRM", workspaceName: "Acme CRM" }),
    null,
  );
  const reply = formatPersonalizedBookingLinkReply(DEMO_URL, { name: "Website Visitor" });
  assert.doesNotMatch(reply, /Hi Website/i);
  assert.match(reply, new RegExp(DEMO_URL.replace(/\//g, "\\/")));
  const ctx = buildChatbotCompletionContactContext({
    name: "Website Visitor",
    source: "webchat",
    customFields: { webchatIdentity: { status: "anonymous" } },
  });
  assert.equal(ctx.name, undefined);
});

await test("legitimate verified name may be used", () => {
  assert.equal(usableVisitorPersonalizationName({ name: "Ada Lovelace" }), "Ada Lovelace");
  assert.equal(usableVisitorPersonalizationFirstName({ name: "Ada Lovelace" }), "Ada");
  const reply = formatPersonalizedBookingLinkReply(DEMO_URL, { name: "Ada Lovelace" });
  assert.match(reply, /Hi Ada!/);
  const ctx = buildChatbotCompletionContactContext({ name: "Ada Lovelace" });
  assert.equal(ctx.name, "Ada Lovelace");
});

await test("EN/ES/HE booking acknowledgment does not repeat the URL", () => {
  for (const inbound of ["Thanks I'll pick a time", "Gracias, elegiré un horario", "תודה, אבחר שעה"]) {
    assert.equal(detectBookingAcknowledgment(inbound), true);
    assert.equal(detectHighConfidenceBookingIntent(inbound), false);
    const routing = resolveAiRouting({ inbound, history: BOOKING_HISTORY });
    assert.equal(routing.decision, "CONTINUE_AI");
    assert.equal(routing.reason, "booking_acknowledgment");
    assert.equal(routingAllowsSchedulingLink(routing), false);
    const completion = resolveChatbotCompletionRouting({
      inbound,
      visitorIntent: "Book a demo",
      history: BOOKING_HISTORY,
    });
    assert.equal(completion.decision, "CONTINUE_AI");
    const prompt = chatbotCompletionPromptRules({
      visitorIntent: "Book a demo",
      bookingUrl: DEMO_URL,
      inbound,
      history: BOOKING_HISTORY,
    });
    assert.doesNotMatch(prompt, /Share this exact workspace-selected Calendly/);
    assert.match(prompt, /Do not repeat the scheduling URL/);
    assert.match(prompt, /Never invent availability/);
  }
  assert.equal(lastAssistantCalendlyUrl(BOOKING_HISTORY), DEMO_URL);
});

await test("explicit send the link again resends the exact verified URL", () => {
  const inbound = "Can you send the link again?";
  assert.equal(detectBookingLinkResendRequest(inbound), true);
  const routing = resolveAiRouting({ inbound, history: BOOKING_HISTORY });
  assert.equal(routing.decision, "BOOK_APPOINTMENT");
  assert.equal(routing.reason, "booking_link_resend");
  const prompt = chatbotCompletionPromptRules({
    visitorIntent: "Book a demo",
    bookingUrl: DEMO_URL,
    inbound,
    history: BOOKING_HISTORY,
  });
  assert.match(prompt, /https:\/\/calendly.com\/whachatcrm\/product-demo/);
});

await test("broken-link request can safely resend the same URL", () => {
  const inbound = "The link didn't work";
  assert.equal(detectBookingLinkResendRequest(inbound), true);
  const he = resolveAiRouting({ inbound: "הקישור לא עובד", history: BOOKING_HISTORY });
  assert.equal(he.decision, "BOOK_APPOINTMENT");
  const es = resolveAiRouting({ inbound: "El enlace no funciona", history: BOOKING_HISTORY });
  assert.equal(es.decision, "BOOK_APPOINTMENT");
});

await test("no invented booking confirmation", () => {
  const routing = resolveAiRouting({ inbound: "Thanks I'll pick a time", history: BOOKING_HISTORY });
  assert.match(routing.promptGuidance, /Do NOT invent availability, appointment confirmation/);
  const prompt = chatbotCompletionPromptRules({
    visitorIntent: "Book a demo",
    bookingUrl: DEMO_URL,
    inbound: "Thanks I'll pick a time",
    history: BOOKING_HISTORY,
  });
  assert.match(prompt, /Never invent availability, appointment confirmation/);
  assert.doesNotMatch(prompt, /you(?:'re| are) booked|appointment is confirmed/i);
});

await test("current demo request affects scoring and recommendation consistently", () => {
  const scored = scoreLead(
    [{ direction: "inbound", content: "Book a demo" }],
    { qualifyingQuestions: [{ key: "budget", question: "What is your budget?", required: true }] },
  );
  assert.ok(scored.score >= 45, `warm floor, got ${scored.score}`);
  assert.equal(scored.bucket, "warm");
  assert.ok(scored.score < 80, "not an arbitrary Hot score");
  assert.ok(scored.reasons.includes("Customer requested a demo and is awaiting scheduling"));
  assert.ok(!scored.reasons.includes("Customer appears ready to move forward"));
  assert.ok(scored.signals.detected.includes("decision:demo_requested"));
  assert.ok(scored.missingRequired.length > 0, "qualification gaps remain visible");

  const insights = buildCustomerInsights({
    reasons: scored.reasons,
    bucket: scored.bucket,
    score: scored.score,
    intent: "Booking",
    inboundCount: 1,
    inboundText: "Book a demo",
  });
  assert.ok(insights.includes("Demo requested — awaiting scheduling"));
  assert.ok(!insights.includes("Ready to move forward"));

  const actions = buildContextualNextActions({
    latestInboundText: "Book a demo",
    inboundText: "Book a demo",
    bucket: scored.bucket,
    leadLabel: "Warm",
    schedulingLinkSent: true,
    aiRoutingDecision: "CONTINUE_AI",
    confidence: 0.7,
  });
  assert.equal(actions[0]?.label, "Help complete scheduling");
  assert.ok(!actions.some((a) => /nurture follow-up/i.test(a.label)));
});

await test("missing qualification fields do not erase strong booking intent", () => {
  const scored = scoreLead(
    [
      { direction: "inbound", content: "Book a demo" },
      { direction: "outbound", content: `Sure — you can pick a time here:\n${DEMO_URL}` },
      { direction: "inbound", content: "Thanks I'll pick a time" },
    ],
    {
      qualifyingQuestions: [
        { key: "budget", question: "Budget?", required: true },
        { key: "timeline", question: "When?", required: true },
      ],
    },
  );
  assert.ok(scored.score >= 45, `got ${scored.score}`);
  assert.notEqual(scored.bucket, "cold");
  assert.ok(scored.missingRequired.length >= 1);
});

await test("unrelated low-intent conversations retain existing scoring", () => {
  const browsing = scoreLead([{ direction: "inbound", content: "Just browsing for now, not ready yet" }]);
  assert.ok(browsing.score < 45, `browsing stayed below Warm, got ${browsing.score}`);
  const hello = scoreLead([{ direction: "inbound", content: "hello" }]);
  assert.ok(hello.score < 45, `hello stayed below Warm, got ${hello.score}`);
  const browseActions = buildContextualNextActions({
    latestInboundText: "Just browsing for now, not ready yet",
    inboundText: "Just browsing for now, not ready yet",
    bucket: "cold",
    leadLabel: "Cold",
    aiRoutingDecision: "START_NURTURE",
    confidence: 0.7,
  });
  assert.ok(browseActions.some((a) => /nurture/i.test(a.label)));
});

await test("Auto remains Auto unless explicit takeover occurs", () => {
  const inbox = read("client/src/pages/UnifiedInbox.tsx");
  assert.match(inbox, /inboundId !== tailInboundMessageId/);
  assert.match(inbox, /if \(!holdReason\) return false/);
  const fast = read("server/bookingFastPath.ts");
  assert.doesNotMatch(fast, /pauseAiControl/);
  const auto = read("server/webchatAiAutoReply.ts");
  assert.doesNotMatch(auto, /pauseAiControl/);
  const composer = read("client/src/components/AIComposer.tsx");
  assert.match(composer, /autoOverride/);
  assert.match(composer, /serverHeldDraft/);
});

await test("duplicate inbound produces no duplicate response key", () => {
  const a = webchatAutoSendIdempotencyKey("user-1", "in-1");
  const b = webchatAutoSendIdempotencyKey("user-1", "in-1");
  const other = webchatAutoSendIdempotencyKey("user-1", "in-2");
  assert.equal(a, b);
  assert.notEqual(a, other);
});

await test("Calendly identity promotion requires at least two valid factors", () => {
  assert.equal(meetsWebchatPromotionThreshold(collectValidatedIdentity({ name: "Ada Lovelace" })), false);
  assert.equal(
    meetsWebchatPromotionThreshold(collectValidatedIdentity({ name: "Ada Lovelace", email: "ada@example.com" })),
    true,
  );
  assert.equal(
    meetsWebchatPromotionThreshold(collectValidatedIdentity({ name: "Website Visitor", email: "ada@example.com" })),
    false,
  );
  const calendly = read("server/calendlyWebhook.ts");
  assert.match(calendly, /Never match or merge solely by invitee name/);
  assert.match(calendly, /c\?\.userId === userId/);
});

await test("tenant and conversation isolation stay on existing Calendly keys", () => {
  const calendly = read("server/calendlyWebhook.ts");
  assert.match(calendly, /reason: "tracking" \| "email" \| "recent_context"/);
  assert.match(calendly, /utmContactId/);
  assert.doesNotMatch(calendly, /inviteeName === /);
  const promo = read("server/webchatIdentityPromotionService.ts");
  assert.match(promo, /contact\.userId !== params\.userId/);
});

await test("route-level production-shaped booking sequence", async () => {
  assert.equal(classifyChatbotVisitorIntent("Book a demo"), "book_demo");
  assert.equal(detectHighConfidenceBookingIntent("Book a demo"), false);
  const first = resolveChatbotCompletionRouting({ inbound: "Book a demo", visitorIntent: "Book a demo" });
  assert.equal(first.decision, "BOOK_APPOINTMENT");
  const firstOwner = decideWebchatTurnOwner({
    bookingIntent: false,
    chatbot: { triggered: true, visitorFacing: false, reason: "pending_ask_complete" },
  });
  assert.equal(firstOwner.owner, "ai_eligible");

  const ack = "Thanks I'll pick a time";
  assert.equal(detectHighConfidenceBookingIntent(ack), false);
  const second = resolveChatbotCompletionRouting({
    inbound: ack,
    visitorIntent: "Book a demo",
    history: BOOKING_HISTORY,
  });
  assert.equal(second.decision, "CONTINUE_AI");
  assert.equal(second.reason, "booking_acknowledgment");
  const secondOwner = decideWebchatTurnOwner({
    bookingIntent: detectHighConfidenceBookingIntent(ack),
    chatbot: { triggered: false, visitorFacing: false, reason: "no_match" },
  });
  assert.equal(secondOwner.owner, "ai_eligible");
  assert.equal(secondOwner.chatbotOwnsReply, false);

  const scored = scoreLead([
    { direction: "inbound", content: "Book a demo" },
    { direction: "outbound", content: `Sure — you can pick a time here:\n${DEMO_URL}` },
    { direction: "inbound", content: ack },
  ]);
  assert.equal(scored.bucket, "warm");
  const actions = buildContextualNextActions({
    latestInboundText: ack,
    inboundText: `Book a demo\n${ack}`,
    bucket: scored.bucket,
    leadLabel: "Warm",
    schedulingLinkSent: true,
    aiRoutingDecision: second.decision,
    confidence: scored.confidence,
  });
  assert.equal(actions[0]?.label, "Help complete scheduling");
});

await test("later-turn schedule a demo after Features & pricing uses canonical booking", () => {
  assert.equal(isCanonicalBookingTurn({ inbound: "I'd like to schedule a demo" }), true);
  assert.equal(detectHighConfidenceBookingIntent("I'd like to schedule a demo"), false);
  const later = resolveChatbotCompletionRouting({
    inbound: "I'd like to schedule a demo",
    visitorIntent: "Features & pricing",
    history: [
      { role: "user", content: "Features & pricing" },
      { role: "assistant", content: "Pro is $49/month." },
    ],
  });
  assert.equal(later.decision, "BOOK_APPOINTMENT");
  assert.equal(later.turnIntent, "appointment");
  assert.ok(later.subIntents.includes("booking_question"));
  const laterOwner = decideWebchatTurnOwner({
    bookingIntent: detectHighConfidenceBookingIntent("I'd like to schedule a demo"),
    chatbot: { triggered: true, visitorFacing: false, reason: "pending_ask_complete" },
  });
  assert.equal(laterOwner.owner, "ai_eligible");
  const prompt = chatbotCompletionPromptRules({
    visitorIntent: "Features & pricing",
    inbound: "I'd like to schedule a demo",
    bookingUrl: DEMO_URL,
  });
  assert.match(prompt, /calendly\.com/);
  assert.doesNotMatch(prompt, /Do not add a booking CTA/);
});

if (process.exitCode !== 1) {
  console.log("webchat-booking-intelligence.test.ts: all assertions passed");
}
