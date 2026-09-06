/**
 * maybeRunWebchatServerAi race: takeover during generate discards the draft.
 * Run: npx tsx tests/webchat-ai-auto-reply-race.test.ts
 */
import assert from "node:assert/strict";
import {
  acquireWebchatGenerationLease,
  generationLeaseAllowsCommit,
  pauseAiControl,
  WEBCHAT_AI_GENERATION_TIMEOUT_MS,
} from "../shared/webchatAiPolicy";

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

{
  const started = acquireWebchatGenerationLease({
    previous: {},
    leaseId: "gen-1",
    inboundMessageId: "in-1",
  });
  assert.ok(started.ok);
  const gate = deferred<void>();
  const generate = async () => {
    await gate.promise;
    return { suggestion: "Should never send", confidence: 0.9 };
  };
  const work = (async () => {
    const suggestion = await generate();
    const afterHuman = pauseAiControl(
      { reason: "manual_takeover", actor: "user" },
      started.ok ? started.control : {},
    );
    if (!generationLeaseAllowsCommit(afterHuman, "gen-1")) {
      return { sent: false, decision: "skip_lease_invalid", text: suggestion.suggestion };
    }
    return { sent: true, decision: "send_auto", text: suggestion.suggestion };
  })();
  gate.resolve();
  const result = await work;
  assert.equal(result.sent, false);
  assert.equal(result.decision, "skip_lease_invalid");
}

{
  const started = acquireWebchatGenerationLease({
    previous: {},
    leaseId: "gen-2",
    inboundMessageId: "in-2",
  });
  assert.ok(started.ok);
  const afterReply = pauseAiControl(
    { reason: "human_reply", actor: "user", userId: "agent" },
    started.ok ? started.control : {},
  );
  assert.equal(generationLeaseAllowsCommit(afterReply, "gen-2"), false);
}

{
  assert.ok(WEBCHAT_AI_GENERATION_TIMEOUT_MS >= 5_000);
  assert.ok(WEBCHAT_AI_GENERATION_TIMEOUT_MS <= 60_000);
}

{
  const first = acquireWebchatGenerationLease({
    previous: {},
    leaseId: "rapid-1",
    inboundMessageId: "m1",
  });
  const second = acquireWebchatGenerationLease({
    previous: first.ok ? first.control : {},
    leaseId: "rapid-2",
    inboundMessageId: "m2",
  });
  assert.ok(first.ok && second.ok);
  if (first.ok && second.ok) {
    assert.equal(generationLeaseAllowsCommit(second.control, "rapid-1"), false);
    assert.equal(generationLeaseAllowsCommit(second.control, "rapid-2"), true);
  }
}

console.log("webchat-ai-auto-reply-race.test.ts: all assertions passed");
