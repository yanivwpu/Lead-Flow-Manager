/**
 * Web Chat Auto AI send vs draft policy and fail-closed unattended rollout.
 * Run: npx tsx --test tests/webchat-auto-ai-send-policy.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  evaluateFullAutoSend,
  isCasualWebchatGreeting,
  isClearKnowledgeQuestion,
  WEBCHAT_AUTO_SEND_MIN_CONFIDENCE,
} from "../server/aiAutoSendGate";
import { decideWebchatAiReply, webchatAutoSendIdempotencyKey } from "../shared/webchatAiPolicy";
import {
  logAiReplyDecision,
  outcomeForReasonCode,
  sanitizeEligibility,
} from "../shared/aiReplyDecisionLog";
import {
  isWebchatServerAiAllowlisted,
  isWebchatServerAiRolloutEnabled,
  isWebchatServerAiUnattendedEligible,
} from "../server/webchatServerAiRollout";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const ADVERTISING_Q = "Who should I contact with regards to advertising with you?";
const ADVERTISING_A =
  "Please email ads@example.com or call the published advertising line for packages.";
const TENANT_A = "workspace-a";
const TENANT_B = "workspace-b";

const knowledgeQs = {
  qualifyingQuestions: [
    { question: "What is your budget?", required: true, enabled: true },
    { question: "When do you want to start?", required: true, enabled: true },
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

function withRolloutEnv(flag: string, allowlist: string, fn: () => void) {
  const prevFlag = process.env.WEBCHAT_SERVER_AI_AUTO;
  const prevList = process.env.WEBCHAT_SERVER_AI_AUTO_ALLOWLIST;
  process.env.WEBCHAT_SERVER_AI_AUTO = flag;
  process.env.WEBCHAT_SERVER_AI_AUTO_ALLOWLIST = allowlist;
  try {
    fn();
  } finally {
    process.env.WEBCHAT_SERVER_AI_AUTO = prevFlag;
    process.env.WEBCHAT_SERVER_AI_AUTO_ALLOWLIST = prevList;
  }
}

test("unset global flag + tenant absent from allowlist never unattended-sends", () => {
  withRolloutEnv("", "", () => {
    assert.equal(isWebchatServerAiRolloutEnabled(), false);
    assert.equal(isWebchatServerAiAllowlisted(TENANT_A), false);
    assert.equal(isWebchatServerAiUnattendedEligible(TENANT_A), false);
    assert.equal(
      decideWebchatAiReply({ ...aiBase, rolloutEnabled: false, allowlisted: false }),
      "skip_flag_off",
    );
  });
});

test("allowlisted tenant can unattended-send a clear grounded question once", () => {
  withRolloutEnv("", TENANT_A, () => {
    assert.equal(isWebchatServerAiRolloutEnabled(), false);
    assert.equal(isWebchatServerAiAllowlisted(TENANT_A), true);
    assert.equal(isWebchatServerAiUnattendedEligible(TENANT_A), true);
    assert.equal(
      decideWebchatAiReply({ ...aiBase, rolloutEnabled: false, allowlisted: true }),
      "send_auto",
    );
  });
  const gate = evaluateFullAutoSend({
    businessMode: "auto",
    channel: "webchat",
    conversationHistory: [{ role: "user", content: ADVERTISING_Q }],
    suggestion: ADVERTISING_A,
    confidence: WEBCHAT_AUTO_SEND_MIN_CONFIDENCE,
    confidenceProvided: true,
    knowledgeGrounded: true,
    businessKnowledge: knowledgeQs,
  });
  assert.equal(gate.allowed, true);
  assert.equal(gate.reason, "ok_knowledge_question");
  assert.equal(gate.confidenceSource, "model");
  assert.equal(webchatAutoSendIdempotencyKey(TENANT_A, "in-1"), "webchat_ai:workspace-a:in-1");
});

test("explicit global enable lets eligible Auto tenants send without an allowlist", () => {
  withRolloutEnv("1", "", () => {
    assert.equal(isWebchatServerAiRolloutEnabled(), true);
    assert.equal(isWebchatServerAiAllowlisted(TENANT_A), false);
    assert.equal(isWebchatServerAiUnattendedEligible(TENANT_A), true);
    assert.equal(
      decideWebchatAiReply({ ...aiBase, rolloutEnabled: true, allowlisted: false }),
      "send_auto",
    );
  });
});

test("Suggest and Manual never auto-send", () => {
  const manual = evaluateFullAutoSend({
    businessMode: "off",
    channel: "webchat",
    conversationHistory: [{ role: "user", content: ADVERTISING_Q }],
    suggestion: ADVERTISING_A,
    confidence: 0.9,
    confidenceProvided: true,
    knowledgeGrounded: true,
  });
  assert.equal(manual.allowed, false);
  assert.equal(manual.reason, "business_mode_not_auto");
  assert.equal(decideWebchatAiReply({ ...aiBase, aiModeRaw: "off" }), "skip_manual");

  const suggest = evaluateFullAutoSend({
    businessMode: "suggest",
    channel: "webchat",
    conversationHistory: [{ role: "user", content: ADVERTISING_Q }],
    suggestion: ADVERTISING_A,
    confidence: 0.9,
    confidenceProvided: true,
    knowledgeGrounded: true,
  });
  assert.equal(suggest.allowed, false);
  assert.equal(suggest.reason, "business_mode_not_auto");
  assert.equal(decideWebchatAiReply({ ...aiBase, aiModeRaw: "suggest_only" }), "suggest_only");
  assert.equal(outcomeForReasonCode("suggest_only", { hasDraft: true }), "drafted");
});

test("missing confidence plus no verified grounding never sends", () => {
  const gate = evaluateFullAutoSend({
    businessMode: "auto",
    channel: "webchat",
    conversationHistory: [{ role: "user", content: ADVERTISING_Q }],
    suggestion: ADVERTISING_A,
    confidence: WEBCHAT_AUTO_SEND_MIN_CONFIDENCE,
    confidenceProvided: false,
    knowledgeGrounded: false,
  });
  assert.equal(gate.allowed, false);
  assert.equal(gate.reason, "confidence_not_provided");
  assert.equal(gate.confidenceSource, "missing");
});

test("missing confidence may default only for a verified grounded knowledge answer", () => {
  const gate = evaluateFullAutoSend({
    businessMode: "auto",
    channel: "webchat",
    conversationHistory: [{ role: "user", content: ADVERTISING_Q }],
    suggestion: ADVERTISING_A,
    confidence: WEBCHAT_AUTO_SEND_MIN_CONFIDENCE,
    confidenceProvided: false,
    knowledgeGrounded: true,
    businessKnowledge: knowledgeQs,
  });
  assert.equal(gate.allowed, true);
  assert.equal(gate.reason, "ok_knowledge_question");
  assert.equal(gate.confidenceSource, "defaulted");
});

test("greeting-only never sends", () => {
  assert.equal(isCasualWebchatGreeting("Hello guys."), true);
  assert.equal(isClearKnowledgeQuestion("Hello guys."), false);
  const gate = evaluateFullAutoSend({
    businessMode: "auto",
    channel: "webchat",
    conversationHistory: [{ role: "user", content: "Hello guys." }],
    suggestion: "Hi — how can I help today?",
    confidence: 0.9,
    confidenceProvided: true,
    knowledgeGrounded: true,
  });
  assert.equal(gate.allowed, false);
  assert.equal(gate.reason, "last_message_greeting_only");
});

test("another tenant cannot inherit the allowlist", () => {
  withRolloutEnv("", TENANT_A, () => {
    assert.equal(isWebchatServerAiAllowlisted(TENANT_A), true);
    assert.equal(isWebchatServerAiAllowlisted(TENANT_B), false);
    assert.equal(isWebchatServerAiUnattendedEligible(TENANT_B), false);
    assert.equal(
      decideWebchatAiReply({ ...aiBase, rolloutEnabled: false, allowlisted: false }),
      "skip_flag_off",
    );
  });
});

test("Inbox and server Auto cannot double-send the same inbound", () => {
  const key = webchatAutoSendIdempotencyKey("workspace-1", "msg-9");
  assert.equal(key, "webchat_ai:workspace-1:msg-9");
  const auto = read("server/webchatAiAutoReply.ts");
  const routes = read("server/routes.ts");
  assert.match(auto, /inboundTurnAlreadyReplied/);
  assert.match(auto, /withAutomationSendGuard/);
  assert.match(auto, /webchatAutoSendIdempotencyKey/);
  assert.match(routes, /webchatAutoSendIdempotencyKey/);
  assert.match(routes, /already_sent/);
  assert.match(auto, /idempotencyKey/);
});

test("low-confidence Auto response drafts with low_confidence", () => {
  const gate = evaluateFullAutoSend({
    businessMode: "auto",
    channel: "webchat",
    conversationHistory: [{ role: "user", content: ADVERTISING_Q }],
    suggestion: ADVERTISING_A,
    confidence: 0.4,
    confidenceProvided: true,
    knowledgeGrounded: true,
  });
  assert.equal(gate.allowed, false);
  assert.equal(gate.reason, "low_confidence");
  assert.equal(gate.confidenceSource, "model");
  assert.equal(outcomeForReasonCode("low_confidence", { hasDraft: true }), "drafted");
});

test("chatbot and away-message ownership skip Auto AI", () => {
  assert.equal(decideWebchatAiReply({ ...aiBase, chatbotOwnsReply: true }), "skip_chatbot_owns");
  assert.equal(outcomeForReasonCode("skip_chatbot_owns"), "owned_by_other_responder");
  assert.equal(decideWebchatAiReply({ ...aiBase, crmFallbackOwnsReply: true }), "skip_crm_fallback");
  assert.equal(outcomeForReasonCode("skip_crm_fallback"), "owned_by_other_responder");
});

test("entitlement and configuration gates remain mandatory", () => {
  assert.equal(decideWebchatAiReply({ ...aiBase, hasAiBrainAccess: false }), "skip_no_access");
  assert.equal(decideWebchatAiReply({ ...aiBase, widgetEnabled: false }), "skip_widget_disabled");
  assert.equal(outcomeForReasonCode("skip_no_access"), "skipped");
});

test("WhatsApp keeps the Copilot confidence gate", () => {
  const whatsapp = evaluateFullAutoSend({
    businessMode: "auto",
    channel: "whatsapp",
    conversationHistory: [
      { role: "user", content: "Hi there" },
      { role: "user", content: ADVERTISING_Q },
    ],
    suggestion: ADVERTISING_A,
    confidence: WEBCHAT_AUTO_SEND_MIN_CONFIDENCE,
    confidenceProvided: true,
    knowledgeGrounded: true,
    businessKnowledge: knowledgeQs,
  });
  assert.equal(whatsapp.allowed, false);
  assert.equal(whatsapp.reason, "low_confidence");
});

test("Inbox refresh cannot reprocess historical inbound or toast a blocked Auto send", () => {
  const composer = read("client/src/components/AIComposer.tsx");
  const inbox = read("client/src/pages/UnifiedInbox.tsx");
  const routes = read("server/routes.ts");
  assert.match(composer, /shouldTriggerInboxAutoSend/);
  assert.match(composer, /hydrationInboundIdRef/);
  assert.match(composer, /lastInboundId/);
  assert.match(composer, /autoDispatch: true/);
  assert.match(inbox, /id: m\.id/);
  assert.match(inbox, /createdAt: m\.createdAt/);
  assert.match(inbox, /isAutomatedInboxSendSource/);
  assert.match(routes, /auto_dispatch_not_requested/);
  const autoError = inbox.slice(inbox.indexOf("isAutomatedAutoSend"), inbox.indexOf("if (isReplyWindow"));
  assert.match(autoError, /automated_send_blocked/);
  assert.doesNotMatch(autoError, /Message not sent/);
});

test("privacy-safe diagnostics log confidence source without visitor or message fields", () => {
  const cleaned = sanitizeEligibility({
    reasonCode: "ok_knowledge_question",
    confidenceSource: "defaulted",
    contactId: "should-drop",
    conversationId: "should-drop",
    visitorId: "should-drop",
    suggestion: "secret reply",
    inboundMessageId: "should-drop",
    confidence: 0.7,
  });
  assert.equal(cleaned.reasonCode, "ok_knowledge_question");
  assert.equal(cleaned.confidenceSource, "defaulted");
  assert.equal(cleaned.confidence, 0.7);
  assert.equal("contactId" in cleaned, false);
  assert.equal("visitorId" in cleaned, false);
  assert.equal("suggestion" in cleaned, false);
  assert.equal("inboundMessageId" in cleaned, false);
  assert.equal(typeof logAiReplyDecision, "function");
  const routes = read("server/routes.ts");
  const auto = read("server/webchatAiAutoReply.ts");
  const logSrc = read("shared/aiReplyDecisionLog.ts");
  assert.match(routes, /confidenceSource/);
  assert.match(auto, /confidenceSource/);
  assert.match(logSrc, /\[AiReplyDecision\]/);
});
