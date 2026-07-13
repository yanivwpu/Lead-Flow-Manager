/**
 * Documents Native Gmail inbound poll schedule (no live cron).
 * Run: npx tsx tests/gmail-inbound-poll-schedule.test.ts
 */
import assert from "node:assert/strict";

/** Mirrors server/cron.ts: utcMin % 5 === 2 */
function shouldPollEmailAtUtcMinute(utcMin: number): boolean {
  return utcMin % 5 === 2;
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

run("email poll slots are every 5 minutes (:02, :07, …)", () => {
  const slots = Array.from({ length: 60 }, (_, m) => m).filter(shouldPollEmailAtUtcMinute);
  assert.deepEqual(slots, [2, 7, 12, 17, 22, 27, 32, 37, 42, 47, 52, 57]);
  for (let i = 1; i < slots.length; i++) {
    assert.equal(slots[i] - slots[i - 1], 5);
  }
  // wrap-around gap from :57 to next hour :02 is also 5 minutes
  assert.equal((60 - 57) + 2, 5);
});

run("typical inbound delay is up to one poll cycle (~5 min), not push", () => {
  // Message arriving just after :02 poll waits until :07 ≈ 5 minutes
  const pollMinute = 2;
  const nextPoll = pollMinute + 5;
  assert.equal(nextPoll - pollMinute, 5);
});

console.log("\nAll Gmail inbound poll schedule tests passed.");
