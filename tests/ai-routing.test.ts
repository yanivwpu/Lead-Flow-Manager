import assert from "node:assert/strict";
import {
  resolveAiRouting,
  routingAllowsSchedulingLink,
  routingShouldTriggerHandoff,
  stripSchedulingUrlsFromReply,
  matchesHandoffKeyword,
} from "../shared/aiRouting";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e);
    process.exitCode = 1;
  }
}

test("speak with an advisor → clarify before book or assign", () => {
  const r = resolveAiRouting({ inbound: "I'd like to speak with an advisor" });
  assert.equal(r.decision, "CONTINUE_AI");
  assert.equal(r.needsRoutingClarification, true);
  assert.equal(routingAllowsSchedulingLink(r), false);
  assert.equal(routingShouldTriggerHandoff(r), false);
});

test("pricing question → assign agent", () => {
  const r = resolveAiRouting({ inbound: "How much does your premium plan cost?" });
  assert.equal(r.decision, "ASSIGN_AGENT");
  assert.equal(routingShouldTriggerHandoff(r), true);
});

test("schedule a call → book appointment", () => {
  const r = resolveAiRouting({ inbound: "Can we schedule a call tomorrow?" });
  assert.equal(r.decision, "BOOK_APPOINTMENT");
  assert.equal(routingAllowsSchedulingLink(r), true);
});

test("clarify then live chat → assign agent", () => {
  const r = resolveAiRouting({
    inbound: "I have a pricing question",
    history: [
      {
        role: "assistant",
        content: "Happy to help — chat with someone now, or schedule a call?",
      },
      { role: "user", content: "I have a pricing question" },
    ],
  });
  assert.equal(r.decision, "ASSIGN_AGENT");
  assert.equal(r.reason, "clarified_live_chat");
});

test("clarify then schedule → book appointment", () => {
  const r = resolveAiRouting({
    inbound: "Let's book a meeting",
    history: [
      {
        role: "assistant",
        content: "Would you like to chat with someone now or schedule a call?",
      },
      { role: "user", content: "Let's book a meeting" },
    ],
  });
  assert.equal(r.decision, "BOOK_APPOINTMENT");
});

test("just browsing → nurture", () => {
  const r = resolveAiRouting({ inbound: "Just browsing for now, not ready yet" });
  assert.equal(r.decision, "START_NURTURE");
});

test("learn more about automation → continue AI (not assign)", () => {
  const r = resolveAiRouting({
    inbound: "I'd like to learn more about your automation.",
    handoffKeywords: ["call me", "human", "agent", "speak to someone"],
  });
  assert.equal(r.decision, "CONTINUE_AI");
  assert.equal(r.reason, "info_seeking_qualify");
  assert.equal(routingShouldTriggerHandoff(r), false);
  assert.ok(r.signals.includes("info_seeking"));
});

test("agent keyword does not match automation substring", () => {
  assert.equal(
    matchesHandoffKeyword("I'd like to learn more about your automation.", ["agent"]),
    false,
  );
  assert.equal(matchesHandoffKeyword("I need an agent please", ["agent"]), true);
});

test("tell me more → continue AI qualify", () => {
  const r = resolveAiRouting({ inbound: "Can you tell me more about your features?" });
  assert.equal(r.decision, "CONTINUE_AI");
  assert.equal(r.reason, "info_seeking_qualify");
});

test("how does it work → continue AI qualify", () => {
  const r = resolveAiRouting({ inbound: "How does your automation work?" });
  assert.equal(r.decision, "CONTINUE_AI");
});

test("interested in features → continue AI qualify", () => {
  const r = resolveAiRouting({ inbound: "I'm interested in your automation features" });
  assert.equal(r.decision, "CONTINUE_AI");
});

test("strip calendly urls from reply", () => {
  const raw = "Pick a time here:\n\nhttps://calendly.com/foo/bar\n\nThanks!";
  assert.equal(stripSchedulingUrlsFromReply(raw), "Pick a time here:\n\nThanks!");
});

if (process.exitCode !== 1) {
  console.log("ai-routing tests passed");
}
