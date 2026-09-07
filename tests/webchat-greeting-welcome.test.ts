/**
 * Web Chat greeting welcome: Auto may send one safe brief reply.
 * Run: npx tsx --test tests/webchat-greeting-welcome.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  evaluateFullAutoSend,
  isCasualWebchatGreeting,
} from "../server/aiAutoSendGate";
import { decideWebchatAiReply, webchatAutoSendIdempotencyKey } from "../shared/webchatAiPolicy";
import {
  coerceWebchatGreetingWelcome,
  isSafeWebchatGreetingWelcome,
  unsafeWebchatGreetingWelcomeReason,
  webchatSafeGreetingWelcome,
} from "../shared/webchatGreetingWelcome";
import { WEBCHAT_HARDCODED_IDENTITY_PROMPT } from "../shared/webchatReplyPolicy";
import { shouldTriggerInboxAutoSend } from "../shared/inboxAutoSendTrigger";
import {
  isWebchatServerAiRolloutEnabled,
  isWebchatServerAiUnattendedEligible,
} from "../server/webchatServerAiRollout";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const HELLO = "Hello guys.";
const SAFE_WELCOME = "Hi, thanks for reaching out. How can we help?";
const OPENED_AT = Date.parse("2026-09-07T21:00:00.000Z");
const TENANT = "workspace-a";

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

test("Auto may send one brief greeting welcome", () => {
  assert.equal(isCasualWebchatGreeting(HELLO), true);
  const gate = evaluateFullAutoSend({
    businessMode: "auto",
    channel: "webchat",
    conversationHistory: [{ role: "user", content: HELLO }],
    suggestion: SAFE_WELCOME,
    confidence: 0.9,
    confidenceProvided: true,
    knowledgeGrounded: false,
  });
  assert.equal(gate.allowed, true);
  assert.equal(gate.reason, "ok_greeting_welcome");
});

test("Suggest mode drafts a greeting and does not auto-send", () => {
  const gate = evaluateFullAutoSend({
    businessMode: "suggest",
    channel: "webchat",
    conversationHistory: [{ role: "user", content: HELLO }],
    suggestion: SAFE_WELCOME,
    confidence: 0.9,
    confidenceProvided: true,
  });
  assert.equal(gate.allowed, false);
  assert.equal(gate.reason, "business_mode_not_auto");
  assert.equal(decideWebchatAiReply({ ...aiBase, aiModeRaw: "suggest_only" }), "suggest_only");
  const composer = read("client/src/components/AIComposer.tsx");
  assert.match(composer, /loadSuggestDraftForInbound/);
  assert.match(composer, /aiMode === "suggest"/);
});

test("Manual mode produces no greeting send", () => {
  const gate = evaluateFullAutoSend({
    businessMode: "off",
    channel: "webchat",
    conversationHistory: [{ role: "user", content: HELLO }],
    suggestion: SAFE_WELCOME,
    confidence: 0.9,
    confidenceProvided: true,
  });
  assert.equal(gate.allowed, false);
  assert.equal(gate.reason, "business_mode_not_auto");
  assert.equal(decideWebchatAiReply({ ...aiBase, aiModeRaw: "off" }), "skip_manual");
});

test("greeting welcome must not request personal data", () => {
  assert.equal(isSafeWebchatGreetingWelcome(WEBCHAT_HARDCODED_IDENTITY_PROMPT), false);
  assert.equal(unsafeWebchatGreetingWelcomeReason(WEBCHAT_HARDCODED_IDENTITY_PROMPT), "personal_data_request");
  const pii = evaluateFullAutoSend({
    businessMode: "auto",
    channel: "webchat",
    conversationHistory: [{ role: "user", content: HELLO }],
    suggestion: WEBCHAT_HARDCODED_IDENTITY_PROMPT,
    confidence: 0.95,
    confidenceProvided: true,
  });
  assert.equal(pii.allowed, false);
  assert.match(pii.reason, /greeting_welcome_unsafe:personal_data_request/);

  const booking = evaluateFullAutoSend({
    businessMode: "auto",
    channel: "webchat",
    conversationHistory: [{ role: "user", content: HELLO }],
    suggestion: "Hi! Want to book a call? What’s your email?",
    confidence: 0.9,
    confidenceProvided: true,
  });
  assert.equal(booking.allowed, false);
  assert.match(booking.reason, /greeting_welcome_unsafe:personal_data_request/);
});

test("greeting welcome must not invent business facts", () => {
  const hours = evaluateFullAutoSend({
    businessMode: "auto",
    channel: "webchat",
    conversationHistory: [{ role: "user", content: HELLO }],
    suggestion: "Hi! We're open until 6pm and pricing starts at $99.",
    confidence: 0.9,
    confidenceProvided: true,
  });
  assert.equal(hours.allowed, false);
  assert.match(hours.reason, /greeting_welcome_unsafe:invented_business_fact/);
  assert.equal(isSafeWebchatGreetingWelcome(SAFE_WELCOME), true);
  assert.equal(webchatSafeGreetingWelcome("Acme Ads"), "Hi, thanks for reaching out to Acme Ads. How can we help?");
  assert.equal(isSafeWebchatGreetingWelcome(webchatSafeGreetingWelcome("Acme Ads")), true);
});

test("unsafe model copy is coerced to a safe welcome", () => {
  const coerced = coerceWebchatGreetingWelcome(WEBCHAT_HARDCODED_IDENTITY_PROMPT, "Acme Ads");
  assert.equal(coerced.coerced, true);
  assert.equal(coerced.text, "Hi, thanks for reaching out to Acme Ads. How can we help?");
});

test("Inbox-open Auto can handle a genuinely new greeting after mount", () => {
  const live = shouldTriggerInboxAutoSend({
    aiModeIsAuto: true,
    lastTurnIsInbound: true,
    lastInboundId: "greeting-live-1",
    lastInboundCreatedAt: "2026-09-07T21:00:01.000Z",
    composerOpenedAtMs: OPENED_AT,
    hydrationCaptured: true,
    hydratedInboundId: "",
    alreadyHandledKey: "",
    threadReady: true,
    nowMs: OPENED_AT + 5_000,
  });
  assert.equal(live.trigger, true);
  assert.equal(live.reason, "live_inbound");
});

test("refresh and historical greetings never trigger a reply", () => {
  const historical = shouldTriggerInboxAutoSend({
    aiModeIsAuto: true,
    lastTurnIsInbound: true,
    lastInboundId: "greeting-old-1",
    lastInboundCreatedAt: "2026-09-07T16:00:00.000Z",
    composerOpenedAtMs: OPENED_AT,
    hydrationCaptured: true,
    hydratedInboundId: "greeting-old-1",
    threadReady: true,
    nowMs: OPENED_AT + 5_000,
  });
  assert.equal(historical.trigger, false);
  assert.equal(historical.reason, "hydration_baseline");
});

test("Inbox-closed Auto greetings still require the global flag or allowlist", () => {
  withRolloutEnv("", "", () => {
    assert.equal(isWebchatServerAiRolloutEnabled(), false);
    assert.equal(isWebchatServerAiUnattendedEligible(TENANT), false);
    assert.equal(
      decideWebchatAiReply({ ...aiBase, rolloutEnabled: false, allowlisted: false }),
      "skip_flag_off",
    );
  });
  withRolloutEnv("", TENANT, () => {
    assert.equal(isWebchatServerAiUnattendedEligible(TENANT), true);
    assert.equal(
      decideWebchatAiReply({ ...aiBase, rolloutEnabled: false, allowlisted: true }),
      "send_auto",
    );
  });
});

test("a greeting inbound replies once via the shared idempotency key", () => {
  const key = webchatAutoSendIdempotencyKey(TENANT, "greeting-live-1");
  assert.equal(key, `webchat_ai:${TENANT}:greeting-live-1`);
  const once = shouldTriggerInboxAutoSend({
    aiModeIsAuto: true,
    lastTurnIsInbound: true,
    lastInboundId: "greeting-live-1",
    lastInboundCreatedAt: "2026-09-07T21:00:01.000Z",
    composerOpenedAtMs: OPENED_AT,
    hydrationCaptured: true,
    hydratedInboundId: "",
    alreadyHandledKey: "greeting-live-1",
    threadReady: true,
    nowMs: OPENED_AT + 5_000,
  });
  assert.equal(once.trigger, false);
  assert.equal(once.reason, "already_handled");
  const auto = read("server/webchatAiAutoReply.ts");
  const routes = read("server/routes.ts");
  assert.match(auto, /webchatAutoSendIdempotencyKey/);
  assert.match(routes, /webchatAutoSendIdempotencyKey/);
  assert.match(auto, /coerceWebchatGreetingWelcome/);
  assert.match(routes, /coerceWebchatGreetingWelcome/);
});

test("generation prompt forbids personal-data collection on Web Chat greetings", () => {
  const ai = read("server/aiService.ts");
  assert.match(ai, /WEB CHAT GREETING/);
  assert.match(ai, /Do not ask for name, email, phone/);
  assert.match(ai, /greetingTurn/);
});
