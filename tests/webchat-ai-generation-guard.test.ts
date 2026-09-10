/**
 * Conversation AI lease: takeover and supersession.
 * Run: npx tsx tests/webchat-ai-generation-guard.test.ts
 */
import assert from "node:assert/strict";
import {
  acquireWebchatGenerationLease,
  generationLeaseAllowsCommit,
  pauseAiControl,
  readConversationAiControl,
  resumeAiControl,
} from "../shared/webchatAiPolicy";
import { decideWebchatTurnOwner, flowWouldOwnVisitorTurn } from "../shared/webchatTurnOwner";
import { timingSafeStringEqual } from "../shared/timingSafeEqual";

const first = acquireWebchatGenerationLease({
  previous: {},
  leaseId: "lease-1",
  inboundMessageId: "in-1",
});
assert.equal(first.ok, true);
if (first.ok) {
  assert.equal(generationLeaseAllowsCommit(first.control, "lease-1"), true);
  const paused = pauseAiControl(
    { reason: "manual_takeover", actor: "user", userId: "agent-1" },
    first.control,
  );
  assert.equal(paused.paused, true);
  assert.equal(generationLeaseAllowsCommit(paused, "lease-1"), false);
  assert.equal(paused.generationLease?.status, "cancelled");
}

{
  const a = acquireWebchatGenerationLease({
    previous: {},
    leaseId: "lease-a",
    inboundMessageId: "m1",
  });
  assert.ok(a.ok);
  const b = acquireWebchatGenerationLease({
    previous: a.ok ? a.control : {},
    leaseId: "lease-b",
    inboundMessageId: "m2",
  });
  assert.ok(b.ok);
  if (a.ok && b.ok) {
    assert.equal(generationLeaseAllowsCommit(b.control, "lease-a"), false);
    assert.equal(generationLeaseAllowsCommit(b.control, "lease-b"), true);
  }
}

{
  const started = acquireWebchatGenerationLease({
    previous: {},
    leaseId: "lease-r",
    inboundMessageId: "m3",
  });
  assert.ok(started.ok);
  const resumed = resumeAiControl(started.ok ? started.control : {});
  assert.equal(resumed.paused, false);
  assert.equal(generationLeaseAllowsCommit(resumed, "lease-r"), false);
}

{
  const pausedFirst = pauseAiControl({ reason: "human_reply", actor: "user" }, {});
  const blocked = acquireWebchatGenerationLease({
    previous: pausedFirst,
    leaseId: "late",
    inboundMessageId: "m4",
  });
  assert.equal(blocked.ok, false);
}

{
  const booking = decideWebchatTurnOwner({
    bookingIntent: true,
    chatbot: { triggered: true, visitorFacing: true, reason: "scripted_reply" },
  });
  assert.equal(booking.owner, "booking");
  assert.equal(booking.chatbotOwnsReply, false);
  const scripted = decideWebchatTurnOwner({
    bookingIntent: false,
    chatbot: { triggered: true, visitorFacing: true, reason: "scripted_reply" },
  });
  assert.equal(scripted.chatbotOwnsReply, true);
  const actionOnly = decideWebchatTurnOwner({
    bookingIntent: false,
    chatbot: { triggered: true, visitorFacing: false, reason: "action_only_or_empty" },
  });
  assert.equal(actionOnly.chatbotOwnsReply, false);
}

{
  const scripted = flowWouldOwnVisitorTurn(
    [
      { id: "start", type: "message", data: { content: "Hi" } },
    ],
    [],
  );
  assert.equal(scripted.visitorFacing, true);
  const delay = flowWouldOwnVisitorTurn(
    [
      { id: "start", type: "delay", data: { delayMinutes: 5 } },
      { id: "n2", type: "message", data: { content: "Later" } },
    ],
    [{ source: "start", target: "n2" }],
  );
  assert.equal(delay.reason, "delay_scheduled");
  const tagOnly = flowWouldOwnVisitorTurn(
    [{ id: "start", type: "action", data: { actionType: "set_tag" } }],
    [],
  );
  assert.equal(tagOnly.visitorFacing, false);
  const question = flowWouldOwnVisitorTurn(
    [{ id: "start", type: "question", data: { messageType: "buttons", buttons: ["Yes"] } }],
    [],
  );
  assert.equal(question.reason, "wait_for_input");
  const askText = flowWouldOwnVisitorTurn(
    [{ id: "start", type: "question", data: { content: "What is your name?" } }],
    [],
  );
  assert.equal(askText.reason, "wait_for_input");
  const assign = flowWouldOwnVisitorTurn(
    [{ id: "start", type: "action", data: { action: { type: "assign" } } }],
    [],
  );
  assert.equal(assign.reason, "handoff");
}

{
  assert.equal(timingSafeStringEqual("secret-a", "secret-a"), true);
  assert.equal(timingSafeStringEqual("secret-a", "secret-b"), false);
  assert.equal(timingSafeStringEqual("ab", "a"), false);
  assert.equal(readConversationAiControl({ paused: true }).paused, true);
}

console.log("webchat-ai-generation-guard.test.ts: all assertions passed");
