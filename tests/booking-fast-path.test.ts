/**
 * Booking fast-path — no chatbot delay, no buyer-pref debounce.
 * Run: npx tsx tests/booking-fast-path.test.ts
 */
import { detectHighConfidenceBookingIntent, bookingIntentRouteLabel } from "../shared/bookingIntent";
import { resolveAiRouting } from "../shared/aiRouting";
import { detectStrongAutoIntent } from "../server/aiAutoSendGate";
import { evaluateChatbotInboundArbitration } from "../server/chatbotEngine";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const msg = "Let's schedule a showing on Monday";

assert(detectHighConfidenceBookingIntent(msg), "detects schedule showing");
assert(!detectHighConfidenceBookingIntent("hello there"), "ignores greeting");
assert(bookingIntentRouteLabel() === "book", "route label book");

const routing = resolveAiRouting({ inbound: msg });
assert(routing.decision === "BOOK_APPOINTMENT", `BOOK_APPOINTMENT, got ${routing.decision}`);
assert(routing.needsRoutingClarification === false, "no clarify for clear showing request");

assert(detectStrongAutoIntent(msg, msg), "strong auto intent for booking");

const arb = await evaluateChatbotInboundArbitration({
  userId: "user-test",
  contactId: "contact-test",
  conversationId: "conv-test",
  channel: "whatsapp",
  message: msg,
  isNewConversation: false,
});
assert(arb.flowMatched === false, "chatbot does not steal booking");
assert(arb.reason === "booking_fast_path_priority", "chatbot yields to fast path");

const DEBOUNCE_MS = 7 * 60 * 1000;
assert(
  detectHighConfidenceBookingIntent(msg) === true,
  "booking intent should skip 7-minute buyer pref debounce path",
);
void DEBOUNCE_MS;

console.log("booking-fast-path.test.ts: OK");
