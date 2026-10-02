import assert from "node:assert/strict";
import test from "node:test";
import { evaluateFullAutoSend } from "../server/aiAutoSendGate";

const url = "https://calendly.com/yanivharamaty/whachatcrm-live-product-demo";
const reply = `Sure — you can pick a time here:\n${url}\nI'll make sure we have the right details ready.`;
function gate(inbound: string, extra: Record<string, unknown> = {}) {
  return evaluateFullAutoSend({
    businessMode: "auto", channel: "webchat",
    conversationHistory: [
      { role: "user", content: "Features & pricing" },
      { role: "assistant", content: "There are two plans: Free and Pro." },
      { role: "user", content: inbound },
    ],
    suggestion: reply, confidence: 0.9, confidenceProvided: true,
    knowledgeGrounded: true, verifiedBookingUrl: url,
    businessKnowledge: { qualifyingQuestions: [
      { key: "budget", question: "What is your budget?", required: true },
      { key: "timeline", question: "When do you want to start?", required: true },
      { key: "package", question: "Which package?", required: true },
    ] },
    ...extra,
  });
}

test("later typed demo requests send the verified link despite qualification gaps", () => {
  for (const inbound of ["Book a demo", "I'd like to schedule a demo", "Reservar una demo", "Quiero agendar una demostración", "קביעת הדגמה", "אני רוצה לקבוע הדגמה"]) {
    const result = gate(inbound);
    assert.equal(result.allowed, true, inbound);
    assert.equal(result.reason, "ok_explicit_demo_booking", inbound);
    assert.ok(result.missingRequiredLen > 1);
  }
  assert.equal(gate("Book a demo", { confidenceProvided: false }).allowed, true);
});

test("typed demo path retains confidence, grounding and booking-safety holds", () => {
  for (const extra of [
    { verifiedBookingUrl: "" },
    { verifiedBookingUrl: "https://calendly.com/another-workspace/demo" },
    { knowledgeGrounded: false },
    { groundingViolations: ["unsupported_claim"] },
    { confidence: 0.1 },
    { suggestion: `Tuesday at 3:00 pm is available.\n${url}` },
    { suggestion: `Book here: https://evil.example/book` },
    { suggestion: `Book here: ${url}\nhttps://evil.example/book` },
    { suggestion: `Your demo is $100.\n${url}` },
  ]) assert.equal(gate("Book a demo", extra).allowed, false, JSON.stringify(extra));
});

test("old booking context, ambiguous text and negated requests cannot use the exception", () => {
  for (const inbound of ["Thanks", "maybe later", "Don't book a demo", "לא רוצה לקבוע הדגמה"]) {
    assert.equal(gate(inbound).allowed, false, inbound);
  }
  assert.notEqual(gate("No quiero reservar una demo").reason, "ok_explicit_demo_booking");
});
