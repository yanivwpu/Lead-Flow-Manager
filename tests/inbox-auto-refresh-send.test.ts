/**
 * Inbox Auto must not send on refresh/hydration of an existing conversation.
 * Run: npx tsx --test tests/inbox-auto-refresh-send.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isAutomatedInboxSendSource,
  shouldTriggerInboxAutoSend,
} from "../shared/inboxAutoSendTrigger";
import { decideWebchatAiReply, webchatAutoSendIdempotencyKey } from "../shared/webchatAiPolicy";
import { outcomeForReasonCode } from "../shared/aiReplyDecisionLog";
import {
  isWebchatServerAiRolloutEnabled,
  isWebchatServerAiUnattendedEligible,
} from "../server/webchatServerAiRollout";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const TENANT = "workspace-a";
const INBOUND_ID = "inbound-advertising-1";
const OPENED_AT = Date.parse("2026-09-07T21:00:00.000Z");
const LIVE_AT = "2026-09-07T21:00:01.000Z";

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

const hydrated = {
  aiModeIsAuto: true,
  lastTurnIsInbound: true,
  composerOpenedAtMs: OPENED_AT,
  hydrationCaptured: true,
  threadReady: true,
  nowMs: OPENED_AT + 5_000,
} as const;

test("thread still loading never captures or sends", () => {
  const decision = shouldTriggerInboxAutoSend({
    ...hydrated,
    threadReady: false,
    hydrationCaptured: false,
    lastInboundId: INBOUND_ID,
    lastInboundCreatedAt: LIVE_AT,
  });
  assert.equal(decision.trigger, false);
  assert.equal(decision.reason, "thread_not_ready");
});

test("first ready observation is hydration and never sends, even if createdAt is recent", () => {
  const pending = shouldTriggerInboxAutoSend({
    ...hydrated,
    hydrationCaptured: false,
    lastInboundId: INBOUND_ID,
    lastInboundCreatedAt: LIVE_AT,
  });
  assert.equal(pending.trigger, false);
  assert.equal(pending.reason, "hydration_pending");

  const baseline = shouldTriggerInboxAutoSend({
    ...hydrated,
    lastInboundId: INBOUND_ID,
    lastInboundCreatedAt: LIVE_AT,
    hydratedInboundId: INBOUND_ID,
  });
  assert.equal(baseline.trigger, false);
  assert.equal(baseline.reason, "hydration_baseline");
});

test("switching or remounting the same last inbound ID cannot mark it newly arrived", () => {
  const remount = shouldTriggerInboxAutoSend({
    ...hydrated,
    lastInboundId: INBOUND_ID,
    lastInboundCreatedAt: LIVE_AT,
    hydratedInboundId: INBOUND_ID,
    alreadyHandledKey: "",
  });
  assert.equal(remount.trigger, false);
  assert.equal(remount.reason, "hydration_baseline");
});

test("polling the same inbound ID never retriggers Auto", () => {
  const poll = shouldTriggerInboxAutoSend({
    ...hydrated,
    lastInboundId: INBOUND_ID,
    lastInboundCreatedAt: LIVE_AT,
    hydratedInboundId: INBOUND_ID,
    alreadyHandledKey: INBOUND_ID,
  });
  assert.equal(poll.trigger, false);
  assert.equal(poll.reason, "already_handled");
});

test("a new inbound ID after hydration can trigger exactly once", () => {
  const live = shouldTriggerInboxAutoSend({
    ...hydrated,
    lastInboundId: "inbound-live-1",
    lastInboundCreatedAt: LIVE_AT,
    hydratedInboundId: INBOUND_ID,
    alreadyHandledKey: INBOUND_ID,
  });
  assert.equal(live.trigger, true);
  assert.equal(live.reason, "live_inbound");

  const once = shouldTriggerInboxAutoSend({
    ...hydrated,
    lastInboundId: "inbound-live-1",
    lastInboundCreatedAt: LIVE_AT,
    hydratedInboundId: INBOUND_ID,
    alreadyHandledKey: "inbound-live-1",
  });
  assert.equal(once.trigger, false);
  assert.equal(once.reason, "already_handled");
});

test("refreshing Auto with a held review draft still does not send", () => {
  const decision = shouldTriggerInboxAutoSend({
    ...hydrated,
    lastInboundId: INBOUND_ID,
    lastInboundCreatedAt: "2026-09-07T16:00:00.000Z",
    hydratedInboundId: INBOUND_ID,
    alreadyHandledKey: INBOUND_ID,
  });
  assert.equal(decision.trigger, false);
  assert.equal(decision.reason, "already_handled");
  assert.equal(outcomeForReasonCode("low_confidence", { hasDraft: true }), "drafted");
  assert.equal(outcomeForReasonCode("auto_dispatch_not_requested", { hasDraft: true }), "drafted");
});

test("an inbound ID present at conversation entry never sends later", () => {
  const historical = shouldTriggerInboxAutoSend({
    ...hydrated,
    lastInboundId: INBOUND_ID,
    hydratedInboundId: INBOUND_ID,
    alreadyHandledKey: "",
  });
  assert.equal(historical.trigger, false);
  assert.equal(historical.reason, "hydration_baseline");
});

test("missing inbound id fail-closes; unseen IDs do not require a timestamp", () => {
  const missingId = shouldTriggerInboxAutoSend({
    ...hydrated,
    lastInboundId: "",
    lastInboundCreatedAt: LIVE_AT,
    hydratedInboundId: INBOUND_ID,
  });
  assert.equal(missingId.trigger, false);
  assert.equal(missingId.reason, "missing_inbound_id");

  const liveWithoutTs = shouldTriggerInboxAutoSend({
    ...hydrated,
    lastInboundId: "inbound-live-1",
    lastInboundCreatedAt: null,
    hydratedInboundId: INBOUND_ID,
  });
  assert.equal(liveWithoutTs.trigger, true);
  assert.equal(liveWithoutTs.reason, "live_inbound");
});

test("absent unattended allowlist cannot create a user-facing send from Inbox open", () => {
  withRolloutEnv("", "", () => {
    assert.equal(isWebchatServerAiRolloutEnabled(), false);
    assert.equal(isWebchatServerAiUnattendedEligible(TENANT), false);
    assert.equal(
      decideWebchatAiReply({
        rolloutEnabled: false,
        allowlisted: false,
        widgetEnabled: true,
        hasAiBrainAccess: true,
        planIsProOrTrial: true,
        aiModeRaw: "full_auto",
        chatbotOwnsReply: false,
        bookingOwnsReply: false,
        crmFallbackOwnsReply: false,
        handoffActive: false,
        aiPaused: false,
        automationsPaused: false,
        optedOut: false,
        rateLimited: false,
      }),
      "skip_flag_off",
    );
  });
  const inbox = read("client/src/pages/UnifiedInbox.tsx");
  const composer = read("client/src/components/AIComposer.tsx");
  const routes = read("server/routes.ts");
  assert.match(composer, /reduceInboxAutoSession/);
  assert.match(composer, /loadInboxAutoSession/);
  assert.match(composer, /lastInboundId/);
  assert.match(composer, /messagesReady/);
  assert.match(composer, /autoDispatch:\s*true/);
  assert.match(composer, /executeAutoReply\(messagesRef\.current/);
  assert.match(inbox, /messagesReady=\{Boolean\(hasConversation && !messagesLoading\)\}/);
  assert.match(routes, /auto_dispatch_not_requested/);
  assert.match(inbox, /isAutomatedInboxSendSource/);
  assert.match(inbox, /automated_send_blocked/);
  assert.doesNotMatch(
    inbox.slice(inbox.indexOf("isAutomatedAutoSend"), inbox.indexOf("if (isReplyWindow")),
    /Message not sent/,
  );
});

test("already-consumed idempotency key is shared and must not surface as a failed manual send", () => {
  const key = webchatAutoSendIdempotencyKey(TENANT, INBOUND_ID);
  assert.equal(key, `webchat_ai:${TENANT}:${INBOUND_ID}`);
  assert.equal(isAutomatedInboxSendSource("ai_auto"), true);
  assert.equal(isAutomatedInboxSendSource(undefined), false);
  assert.equal(isAutomatedInboxSendSource("manual"), false);
  const auto = read("server/webchatAiAutoReply.ts");
  const routes = read("server/routes.ts");
  const contacts = read("server/routes/contacts.ts");
  const inbox = read("client/src/pages/UnifiedInbox.tsx");
  const composer = read("client/src/components/AIComposer.tsx");
  assert.match(auto, /webchatAutoSendIdempotencyKey/);
  assert.match(routes, /webchatAutoSendIdempotencyKey/);
  assert.match(auto, /inboundTurnAlreadyReplied/);
  assert.match(routes, /already_sent/);
  assert.match(contacts, /withAutomationSendGuard/);
  assert.match(inbox, /idempotencyKey: meta\?\.idempotencyKey/);
  assert.match(composer, /autoSendIdempotencyKey/);
  const handleSend = inbox.slice(inbox.indexOf("const handleSendMessage"), inbox.indexOf("const handleAutoSend"));
  assert.doesNotMatch(handleSend, /source:\s*"ai_auto"/);
  const handleAuto = inbox.slice(inbox.indexOf("const handleAutoSend"), inbox.indexOf("const ACCEPTED_TYPES"));
  assert.match(handleAuto, /source:\s*"ai_auto"/);
  const autoError = inbox.slice(inbox.indexOf("isAutomatedAutoSend"), inbox.indexOf("if (isReplyWindow"));
  assert.doesNotMatch(autoError, /Message not sent/);
  const manualError = inbox.slice(inbox.indexOf("if (isMediaValidation"), inbox.indexOf("onSettled:"));
  assert.match(manualError, /Message not sent/);
});

test("hydration suggest-reply cannot auto-dispatch without autoDispatch", () => {
  const routes = read("server/routes.ts");
  const suggest = routes.slice(
    routes.indexOf('app.post("/api/ai/suggest-reply"'),
    routes.indexOf('app.post("/api/ai/extract-lead"'),
  );
  assert.match(suggest, /autoDispatchRequested = autoDispatch === true/);
  assert.match(suggest, /auto_dispatch_not_requested/);
  const alreadySentIdx = suggest.indexOf('autoSendReason = "already_sent"');
  const dispatchIdx = suggest.indexOf("auto_dispatch_not_requested");
  assert.ok(alreadySentIdx > 0 && dispatchIdx > alreadySentIdx, "already_sent must win over missing autoDispatch");
});
