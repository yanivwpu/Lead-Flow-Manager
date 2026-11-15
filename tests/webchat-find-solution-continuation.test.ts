import assert from "node:assert/strict";
import test from "node:test";
import { startFindSolutionJourney, resolveCurrentTurnJourney, markJourneyStatus } from "../shared/webchatActiveJourney";
import { evaluateFullAutoSend } from "../server/aiAutoSendGate";
import { trustedPageRuleFindSolutionReply } from "../shared/webchatPageRuleReplies";
import { webchatGenerationRecoveryMessage } from "../shared/webchatGenerationRecovery";
import { toPublicWebchatMessages } from "../shared/webchatPublicMessages";
import { mergeWebchatPolledMessages } from "../shared/webchatWidgetScroll";
import { chatbotCompletionPromptRules } from "../shared/chatbotCompletionContext";

const scope = { userId: "marketing", visitorId: "visitor", conversationId: "conversation" };
const journey = startFindSolutionJourney({ ...scope, ruleKey: "home", actionIndex: 1, originInboundId: "click" });
function run(answer: string, overrides: Record<string, unknown> = {}) {
  return evaluateFullAutoSend({
    businessMode: "auto", channel: "webchat",
    conversationHistory: [
      { role: "user", content: "Find my solution" },
      { role: "assistant", content: trustedPageRuleFindSolutionReply("en") },
      { role: "user", content: answer },
    ],
    currentTurnJourney: resolveCurrentTurnJourney({ ...scope, journey, inboundMessageId: "answer" }),
    suggestion: "Thanks. What is the main problem you want to solve first?",
    confidence: .9, confidenceProvided: true, knowledgeGrounded: true,
    ...overrides,
  });
}
for (const answer of ["נדל״ן", "נדלן", "real estate", "inmobiliaria", "retail", "ventas", "לידים", "more leads", "yes", "sí", "כן"]) {
  test(`qualification continuation: ${answer}`, () => {
    assert.equal(run(answer).reason, "ok_active_journey");
    const received = { id: "in", direction: "inbound", content: answer, status: "delivered" };
    const outbound = { id: "out", direction: "outbound", content: "What is your main goal?", status: "sent" };
    const polled = toPublicWebchatMessages([received, outbound]);
    const rendered = mergeWebchatPolledMessages([], polled);
    assert.equal(rendered.length, 2);
    assert.equal(rendered[1].content, outbound.content);
    assert.equal(mergeWebchatPolledMessages(rendered, polled).length, 2);
  });
}
test("trust is scoped, expiring, and pausable; stale clicks are not continuation", () => {
  for (const changed of [{ userId: "other" }, { visitorId: "other" }, { conversationId: "other" }, { journey: markJourneyStatus(journey, "paused") }, { now: new Date(Date.now() + 86400001) }]) {
    assert.equal(resolveCurrentTurnJourney({ ...scope, journey, inboundMessageId: "answer", ...changed }).trusted, false);
  }
  assert.equal(resolveCurrentTurnJourney({ ...scope, journey, inboundMessageId: "click" }).continuation, false);
  assert.equal(run("real estate", { currentTurnJourney: null }).allowed, false);
  assert.equal(run("👍").reason, "ok_greeting_welcome");
  assert.equal(run("[image]").allowed, false);
});
test("confidence, grounding, opt-outs, modes and question provenance remain required", () => {
  for (const overrides of [{confidence: .4}, {confidenceProvided: false}, {groundingViolations: ["invented_claim"]}, {businessMode: "suggest"}, {businessMode: "off"}, {conversationHistory: [{role: "assistant", content: "Welcome."}, {role: "user", content: "retail"}]}]) assert.equal(run("real estate", overrides).allowed, false);
  assert.equal(run("stop").allowed, false);
  assert.equal(run("this is a scam").allowed, false);
  assert.equal(run("retail", {knowledgeGrounded: false, suggestion: "It costs $500 monthly."}).allowed, false);
});
test("localized held recovery is fact-free and cannot override disqualifiers or mode", () => {
  for (const locale of ["en", "es", "he"]) {
    const suggestion = webchatGenerationRecoveryMessage(locale);
    assert.equal(run("unclear", {suggestion, currentTurnJourney: null, confidenceProvided: false}).allowed, true);
    assert.equal(run("stop", {suggestion}).allowed, false);
    assert.equal(run("retail", {suggestion, businessMode: "suggest"}).allowed, false);
  }
});
test("completion keeps answered qualification context", () => {
  assert.match(chatbotCompletionPromptRules({ inbound: "נדל״ן", journeyKind: "find_solution", journeyContinuation: true }), /do not repeat answered questions/);
});

test("a new substantive question remains answerable after qualification ends", () => {
  assert.equal(run("What channels does your inbox support?", {
    conversationHistory: [{role:"assistant",content:"Thanks for sharing."}, {role:"user",content:"What channels does your inbox support?"}],
  }).allowed, true);
});
