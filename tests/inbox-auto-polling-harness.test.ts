/**
 * Production-equivalent Inbox Auto polling harness.
 * Mount → unchanged poll → new Hi → repeat ID → remount.
 * Run: npx tsx --test tests/inbox-auto-polling-harness.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  fingerprintInboxAutoKey,
  inboxAutoScopeKey,
  loadInboxAutoSession,
  reduceInboxAutoSession,
  resetInboxAutoSessionsForTests,
  saveInboxAutoSession,
} from "../shared/inboxAutoSendTrigger";
import { sanitizeEligibility } from "../shared/aiReplyDecisionLog";

const CONV = "conv-open-1";
const CONTACT = "contact-open-1";
const OLD = "inbound-old-1";
const HI = "inbound-hi-1";
const HELLO = "inbound-hello-1";

function mountOpenConversation(historyIds: string[]) {
  const scopeKey = inboxAutoScopeKey(CONV, CONTACT);
  let session = loadInboxAutoSession(scopeKey);
  const ready = reduceInboxAutoSession(session, { type: "thread_ready", inboundIds: historyIds });
  saveInboxAutoSession(ready.session);
  const poll = reduceInboxAutoSession(ready.session, {
    type: "poll",
    lastInboundId: historyIds[historyIds.length - 1] || "",
    lastTurnIsInbound: true,
    aiModeIsAuto: true,
    threadReady: true,
  });
  saveInboxAutoSession(poll.session);
  return poll;
}

function poll(lastInboundId: string, lastTurnIsInbound = true) {
  const session = loadInboxAutoSession(inboxAutoScopeKey(CONV, CONTACT));
  const decision = reduceInboxAutoSession(session, {
    type: "poll",
    lastInboundId,
    lastTurnIsInbound,
    aiModeIsAuto: true,
    threadReady: true,
  });
  saveInboxAutoSession(decision.session);
  if (decision.trigger) {
    const started = reduceInboxAutoSession(decision.session, {
      type: "started",
      inboundId: decision.handleKey,
    });
    saveInboxAutoSession(started.session);
  }
  return decision;
}

test("open conversation: unchanged poll does not send; new Hi sends once; remount does not replay", () => {
  resetInboxAutoSessionsForTests();

  const mounted = mountOpenConversation([OLD]);
  assert.equal(mounted.trigger, false);
  assert.equal(mounted.reason, "hydration_baseline");

  const unchanged = poll(OLD);
  assert.equal(unchanged.trigger, false);
  assert.equal(unchanged.reason, "hydration_baseline");

  const hi = poll(HI);
  assert.equal(hi.trigger, true);
  assert.equal(hi.reason, "live_inbound");
  assert.equal(hi.handleKey, HI);
  assert.equal(hi.supersedeInFlight, false);

  const hiRepeat = poll(HI);
  assert.equal(hiRepeat.trigger, false);
  assert.equal(hiRepeat.reason, "already_handled");

  const remounted = loadInboxAutoSession(inboxAutoScopeKey(CONV, CONTACT));
  assert.equal(remounted.captured, true);
  assert.deepEqual(remounted.baselineIds, [OLD]);
  const remountPoll = reduceInboxAutoSession(remounted, {
    type: "poll",
    lastInboundId: HI,
    lastTurnIsInbound: true,
    aiModeIsAuto: true,
    threadReady: true,
  });
  assert.equal(remountPoll.trigger, false);
  assert.equal(remountPoll.reason, "already_handled");
});

test("Hi then Hello? close together: latest turn wins, no duplicate dispatch", () => {
  resetInboxAutoSessionsForTests();
  mountOpenConversation([OLD]);

  const hi = poll(HI);
  assert.equal(hi.trigger, true);
  assert.equal(hi.handleKey, HI);

  const hello = poll(HELLO);
  assert.equal(hello.trigger, true);
  assert.equal(hello.handleKey, HELLO);
  assert.equal(hello.supersedeInFlight, true);

  const helloRepeat = poll(HELLO);
  assert.equal(helloRepeat.trigger, false);
  assert.equal(helloRepeat.reason, "already_handled");

  const hiAgain = poll(HI);
  assert.equal(hiAgain.trigger, false);
  assert.equal(hiAgain.reason, "already_handled");
});

test("composer remount during poll of a new Hi still dispatches once", () => {
  resetInboxAutoSessionsForTests();
  mountOpenConversation([OLD]);

  const beforeRemount = loadInboxAutoSession(inboxAutoScopeKey(CONV, CONTACT));
  assert.equal(beforeRemount.captured, true);
  assert.ok(!beforeRemount.baselineIds.includes(HI));

  const remountSession = loadInboxAutoSession(inboxAutoScopeKey(CONV, CONTACT));
  const recapture = reduceInboxAutoSession(remountSession, {
    type: "thread_ready",
    inboundIds: [OLD, HI],
  });
  assert.equal(recapture.session.captured, true);
  assert.deepEqual(recapture.session.baselineIds, [OLD], "poll remount must not recapture Hi as baseline");

  const live = reduceInboxAutoSession(recapture.session, {
    type: "poll",
    lastInboundId: HI,
    lastTurnIsInbound: true,
    aiModeIsAuto: true,
    threadReady: true,
  });
  assert.equal(live.trigger, true);
  assert.equal(live.reason, "live_inbound");
});

test("reopening after a fresh session snapshots current history and does not replay", () => {
  resetInboxAutoSessionsForTests();
  const replay = mountOpenConversation([OLD, HI, HELLO]);
  assert.equal(replay.trigger, false);
  assert.equal(replay.reason, "hydration_baseline");
});

test("client diagnostics never include inbound IDs or message fields", () => {
  const cleaned = sanitizeEligibility({
    willDispatch: true,
    inboundFp: fingerprintInboxAutoKey(HI),
    scopeFp: fingerprintInboxAutoKey(inboxAutoScopeKey(CONV, CONTACT)),
    inboundMessageId: HI,
    conversationId: CONV,
    contactId: CONTACT,
    content: "Hi",
  });
  assert.equal(cleaned.willDispatch, true);
  assert.equal(typeof cleaned.inboundFp, "string");
  assert.equal("inboundMessageId" in cleaned, false);
  assert.equal("conversationId" in cleaned, false);
  assert.equal("contactId" in cleaned, false);
  assert.equal("content" in cleaned, false);
  assert.notEqual(cleaned.inboundFp, HI);
});
