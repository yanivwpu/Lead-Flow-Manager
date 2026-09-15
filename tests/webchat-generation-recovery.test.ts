/**
 * Eligible Web Chat turns must not end as silent empty / generation_failed.
 * Run: npx tsx --test tests/webchat-generation-recovery.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Contact, Conversation } from "@shared/schema";
import {
  classifyWebchatGenerationFailure,
  isWebchatGenerationRecovery,
  safeGenerationErrorCode,
  webchatGenerationRecoveryMessage,
  WEBCHAT_GENERATION_RECOVERY_REASON,
} from "@shared/webchatGenerationRecovery";
import { evaluateFullAutoSend } from "../server/aiAutoSendGate";
import { decideWebchatAiReply } from "@shared/webchatAiPolicy";
import { decideWebchatInboundAiEvaluation } from "@shared/webchatInboundAiDispatch";
import { dispatchWebchatInboundAi } from "../server/webchatInboundReplyDispatch";
import { mergeWebchatPolledMessages } from "@shared/webchatWidgetScroll";
import { toPublicWebchatMessages } from "@shared/webchatPublicMessages";
import { formatCanonicalPricingComparison } from "@shared/webchatPricingCompare";
import { resolveSavingsJourneyReply } from "@shared/webchatSavingsJourney";
import { trustedPageRuleBookDemoReply } from "@shared/webchatPageRuleReplies";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const DEMO_URL = "https://calendly.com/yanivharamaty/whachatcrm-live-product-demo";
const CLEAR_Q = "What channels does the unified inbox support on the website?";
const RECOVERY_EN = webchatGenerationRecoveryMessage("en");
const RECOVERY_ES = webchatGenerationRecoveryMessage("es");
const RECOVERY_HE = webchatGenerationRecoveryMessage("he");

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

function gate(input: {
  inbound: string;
  suggestion: string;
  history?: Array<{ role: string; content: string }>;
  grounded?: boolean;
  violations?: string[];
  mode?: "off" | "suggest" | "auto";
}) {
  return evaluateFullAutoSend({
    businessMode: input.mode ?? "auto",
    channel: "webchat",
    conversationHistory: input.history ?? [{ role: "user", content: input.inbound }],
    suggestion: input.suggestion,
    confidence: 0.9,
    confidenceProvided: false,
    knowledgeGrounded: input.grounded === true,
    groundingViolations: input.violations,
    businessKnowledge: { qualifyingQuestions: [] },
    verifiedBookingUrl: DEMO_URL,
  });
}

test("EN/ES/HE recovery copy is localized, fact-free, and detectable", () => {
  assert.equal(RECOVERY_EN, "Sorry—I couldn't complete that response. Could you try asking that another way?");
  assert.match(RECOVERY_ES, /otra forma/i);
  assert.match(RECOVERY_HE, /אחרת/);
  assert.equal(isWebchatGenerationRecovery(RECOVERY_EN), true);
  assert.equal(isWebchatGenerationRecovery(RECOVERY_ES), true);
  assert.equal(isWebchatGenerationRecovery(RECOVERY_HE), true);
  assert.equal(isWebchatGenerationRecovery("Pro is $49/month"), false);
  assert.doesNotMatch(RECOVERY_EN, /\$49|calendly|AI Brain|available/i);
  assert.doesNotMatch(RECOVERY_ES, /\$49|calendly/i);
  assert.doesNotMatch(RECOVERY_HE, /\$49|calendly/i);
});

test("failure classes map throw, timeout, empty, and malformed responses", () => {
  const timeout = new Error("generation_timeout");
  timeout.name = "TimeoutError";
  assert.equal(classifyWebchatGenerationFailure(timeout, false), "timeout");
  const abort = new Error("aborted");
  abort.name = "AbortError";
  assert.equal(classifyWebchatGenerationFailure(abort, false), "aborted");
  assert.equal(classifyWebchatGenerationFailure(new Error("Unexpected token"), false), "malformed");
  assert.equal(classifyWebchatGenerationFailure(new Error("openai down"), false), "provider_error");
  assert.equal(classifyWebchatGenerationFailure(null, true), "empty");
  assert.equal(classifyWebchatGenerationFailure(new Error("evidence_bundle_failed"), false), "evidence");
  assert.equal(classifyWebchatGenerationFailure(new Error("formatter_boom"), false), "formatter");
  assert.equal(safeGenerationErrorCode(new Error("openai down: sk-secret"), false), "provider_error");
  assert.doesNotMatch(safeGenerationErrorCode(new Error("visitor asked about $49"), false), /\$49|visitor/);
});

test("clear Auto question sends recovery; invented amounts and URLs stay held", () => {
  const sent = gate({ inbound: CLEAR_Q, suggestion: RECOVERY_EN });
  assert.equal(sent.allowed, true);
  assert.equal(sent.reason, WEBCHAT_GENERATION_RECOVERY_REASON);
  const es = gate({ inbound: CLEAR_Q, suggestion: RECOVERY_ES });
  const he = gate({ inbound: CLEAR_Q, suggestion: RECOVERY_HE });
  assert.equal(es.reason, WEBCHAT_GENERATION_RECOVERY_REASON);
  assert.equal(he.reason, WEBCHAT_GENERATION_RECOVERY_REASON);
  const invented = gate({
    inbound: CLEAR_Q,
    suggestion: "Pro is $999/month.",
    violations: ["unsupported_amount"],
  });
  assert.equal(invented.allowed, false);
  assert.equal(invented.reason, "grounding_violation:unsupported_amount");
  const unsafeUrl = gate({
    inbound: "Book a demo please now",
    suggestion: "Book here:\nhttps://www.whachatcrm.com/contact",
    violations: ["incomplete_required_fact"],
  });
  assert.equal(unsafeUrl.allowed, false);
});

test("ambiguous first inbound is held as a review draft, not silent empty", () => {
  const held = gate({ inbound: "ok", suggestion: RECOVERY_EN });
  assert.equal(held.allowed, false);
  assert.equal(held.reason, "conversation_too_short");
});

test("Manual, Suggest, takeover, and pending chatbot stay suppressed", () => {
  assert.equal(decideWebchatAiReply({ ...aiBase, aiModeRaw: "off" }), "skip_manual");
  assert.equal(decideWebchatAiReply({ ...aiBase, aiModeRaw: "suggest" }), "suggest_only");
  assert.equal(decideWebchatAiReply({ ...aiBase, handoffActive: true }), "skip_handoff");
  assert.equal(decideWebchatAiReply({ ...aiBase, chatbotOwnsReply: true }), "skip_chatbot_owns");
  assert.equal(decideWebchatInboundAiEvaluation({
    channel: "webchat",
    chatbotOwnsReply: true,
    turnOwner: "chatbot",
    awayReplyWillSend: false,
  }).evaluateAi, false);
  assert.equal(decideWebchatInboundAiEvaluation({
    channel: "webchat",
    chatbotOwnsReply: false,
    turnOwner: "booking",
    awayReplyWillSend: false,
  }).reason, "booking_owns");
});

test("provider throw / empty / timeout recover once through dispatch and polling", async () => {
  const contact = { id: "c1", userId: "workspace-a" } as Contact;
  const conversation = { id: "conv-1", userId: "workspace-a", contactId: "c1" } as Conversation;
  const seen = new Set<string>();
  const args = {
    userId: "workspace-a",
    contact,
    conversation,
    inboundMessageId: "in-clear",
    inboundText: CLEAR_Q,
    contentType: "text",
    channel: "webchat",
    chatbotOwnsReply: false,
    turnOwner: "ai_eligible" as const,
    awayConfigured: false,
    awayReplyWillSend: false,
    widgetSettings: { enabled: true },
  };
  const runAi = async (p: { inboundMessageId: string }) => {
    if (seen.has(p.inboundMessageId)) return { decision: "skip_already_replied", sent: false };
    seen.add(p.inboundMessageId);
    return { decision: WEBCHAT_GENERATION_RECOVERY_REASON, sent: true };
  };
  const first = await dispatchWebchatInboundAi(args, { runAi });
  const second = await dispatchWebchatInboundAi(args, { runAi });
  assert.equal(first.sent, true);
  assert.equal(first.decision, WEBCHAT_GENERATION_RECOVERY_REASON);
  assert.equal(second.sent, false);
  assert.equal(seen.size, 1);

  const inbound = {
    id: "in-clear",
    direction: "inbound" as const,
    content: CLEAR_Q,
    contentType: "text",
    createdAt: new Date().toISOString(),
  };
  const outbound = {
    id: "out-recovery",
    direction: "outbound" as const,
    content: RECOVERY_EN,
    contentType: "text",
    createdAt: new Date().toISOString(),
  };
  const merged = mergeWebchatPolledMessages([inbound], [inbound, outbound]);
  assert.equal(merged.some((m) => m.id === "out-recovery"), true);
  const publicMsgs = toPublicWebchatMessages([inbound, outbound]);
  assert.equal(publicMsgs.find((m) => m.id === "out-recovery")?.content, RECOVERY_EN);
});

test("desktop and mobile recovery copy is identical for the same locale", () => {
  assert.equal(webchatGenerationRecoveryMessage("en"), webchatGenerationRecoveryMessage("en-US"));
  assert.equal(webchatGenerationRecoveryMessage("es"), webchatGenerationRecoveryMessage("es-MX"));
  assert.equal(webchatGenerationRecoveryMessage("he"), webchatGenerationRecoveryMessage("he-IL"));
});

test("Pricing Compare, Savings, and Booking deterministic replies are not replaced by generic recovery", () => {
  const compare = formatCanonicalPricingComparison({ locale: "en", kind: "compare_plans", topic: "full" });
  assert.equal(isWebchatGenerationRecovery(compare.text), false);
  assert.match(compare.text, /\$49/);
  const savings = resolveSavingsJourneyReply({
    locale: "en",
    collected: {},
    missing: ["platform", "monthlyCost", "currency"],
  });
  assert.equal(isWebchatGenerationRecovery(savings.text), false);
  assert.match(savings.text, /platform/i);
  const book = trustedPageRuleBookDemoReply("en", DEMO_URL);
  assert.ok(book);
  assert.equal(isWebchatGenerationRecovery(book), false);
  assert.match(book!, /calendly\.com/);
});

test("tenant isolation and unauthorized origin still skip; source uses recovery instead of silence", () => {
  assert.equal(decideWebchatAiReply({ ...aiBase, widgetEnabled: false }), "skip_widget_disabled");
  assert.equal(decideWebchatInboundAiEvaluation({
    channel: "email",
    chatbotOwnsReply: false,
    awayReplyWillSend: false,
  }).evaluateAi, false);
  const auto = read("server/webchatAiAutoReply.ts");
  assert.match(auto, /recoverWebchatGenerationFailure/);
  assert.match(auto, /webchatGenerationRecoveryMessage/);
  assert.match(auto, /correlationId/);
  assert.match(auto, /fallbackAttempted/);
  assert.match(auto, /outboundPersisted/);
  assert.match(auto, /publicPollingEligible/);
  assert.match(auto, /safeGenerationErrorCode/);
  assert.match(auto, /controller\.abort\("timeout"\)/);
  assert.doesNotMatch(auto, /err\.message\.slice/);
  assert.doesNotMatch(auto, /AI could not generate a reply/);
  assert.doesNotMatch(auto, /campaign-enrollments/);
  const gateSrc = read("server/aiAutoSendGate.ts");
  assert.match(gateSrc, /ok_generation_recovery|WEBCHAT_GENERATION_RECOVERY_REASON/);
  const ai = read("server/aiService.ts");
  assert.match(ai, /realizeTrustedFeaturesPricingReply/);
  assert.match(ai, /resolveSavingsJourneyReply/);
});
