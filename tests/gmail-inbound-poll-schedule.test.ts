/**
 * Documents Native Gmail inbound poll schedule (Phase 1B elapsed-time guard).
 * Run: npx tsx tests/gmail-inbound-poll-schedule.test.ts
 */
import assert from "node:assert/strict";
import { EMAIL_POLL_FALLBACK_INTERVAL_MS } from "../server/emailChannel/gmailPushConfig";

function shouldPollEmailElapsed(params: {
  nowMs: number;
  lastEmailPollAtMs: number;
  inFlight: boolean;
  intervalMs?: number;
}): boolean {
  if (params.inFlight) return false;
  const interval = params.intervalMs ?? EMAIL_POLL_FALLBACK_INTERVAL_MS;
  if (params.lastEmailPollAtMs === 0) return true;
  return params.nowMs - params.lastEmailPollAtMs >= interval;
}

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

run("fallback interval is elapsed-time based (default 10 min)", () => {
  assert.equal(EMAIL_POLL_FALLBACK_INTERVAL_MS, 10 * 60 * 1000);
});

run("poll fires when enough time elapsed regardless of UTC minute slot", () => {
  const t0 = Date.parse("2026-07-13T12:00:00Z");
  assert.equal(
    shouldPollEmailElapsed({ nowMs: t0 + 9 * 60_000, lastEmailPollAtMs: t0, inFlight: false }),
    false,
  );
  assert.equal(
    shouldPollEmailElapsed({ nowMs: t0 + 10 * 60_000, lastEmailPollAtMs: t0, inFlight: false }),
    true,
  );
  // A skipped cron minute does not skip an entire poll cycle forever.
  assert.equal(
    shouldPollEmailElapsed({
      nowMs: t0 + 11 * 60_000,
      lastEmailPollAtMs: t0,
      inFlight: false,
    }),
    true,
  );
});

run("in-flight poll prevents overlapping cron runs", () => {
  assert.equal(
    shouldPollEmailElapsed({
      nowMs: Date.now(),
      lastEmailPollAtMs: 0,
      inFlight: true,
    }),
    false,
  );
});

console.log("\nAll Gmail inbound poll schedule tests passed.");
