/**
 * Repair script rules for Meta-safe RGE no-reply (pure logic).
 * Run: npx tsx tests/rge-no-reply-repair-rules.test.ts
 */
import assert from "node:assert/strict";
import {
  RGE_NO_REPLY_ANCHOR,
  RGE_W4_DELAY_HOURS,
  RGE_W4_LEGACY_DELAY_HOURS,
  RGE_W5_DELAY_HOURS,
  RGE_W6_DELAY_HOURS,
} from "../shared/rgeNoReplyWorkflows";

/** Mirrors scripts/repair-rge-no-reply-meta-safe.ts delay selection. */
function nextDelayHours(key: "W4" | "W5" | "W6", current: number | undefined): number | undefined {
  if (key === "W4") {
    if (current == null || !Number.isFinite(current) || current === RGE_W4_LEGACY_DELAY_HOURS) {
      return RGE_W4_DELAY_HOURS;
    }
    return undefined;
  }
  if (key === "W5") {
    if (current == null || current === RGE_W5_DELAY_HOURS) return RGE_W5_DELAY_HOURS;
    return undefined;
  }
  if (current == null || current === RGE_W6_DELAY_HOURS) return RGE_W6_DELAY_HOURS;
  return undefined;
}

assert.equal(nextDelayHours("W4", 24), 20);
assert.equal(nextDelayHours("W4", undefined), 20);
assert.equal(nextDelayHours("W4", 48), undefined, "custom W4 delay preserved");
assert.equal(nextDelayHours("W5", 72), 72);
assert.equal(nextDelayHours("W5", 96), undefined);
assert.equal(nextDelayHours("W6", 168), 168);
assert.equal(RGE_NO_REPLY_ANCHOR, "last_inbound");

console.log("PASS rge-no-reply-repair-rules");
