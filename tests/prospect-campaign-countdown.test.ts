/**
 * Prospect AI campaign countdown helpers (display-only).
 * Run: npx tsx tests/prospect-campaign-countdown.test.ts
 */
import assert from "node:assert/strict";
import {
  formatCampaignSendCountdown,
  formatCountdownMmSs,
  formatNextQueuedStatusSuffix,
  resolveCampaignSendActivityStatus,
  selectNextQueuedCampaignItem,
} from "../shared/prospectCampaignCountdown";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

const now = Date.parse("2026-07-25T18:00:00.000Z");

run("future countdown formatting", () => {
  const due = new Date(now + 84_000).toISOString();
  const r = formatCampaignSendCountdown(due, now);
  assert.equal(r.kind, "countdown");
  assert.equal(r.label, "1:24");
  assert.equal(formatCountdownMmSs(84_000), "1:24");
});

run("under-one-minute countdown", () => {
  const due = new Date(now + 9_000).toISOString();
  const r = formatCampaignSendCountdown(due, now);
  assert.equal(r.kind, "countdown");
  assert.equal(r.label, "0:09");
});

run("overdue => Sending shortly…", () => {
  const due = new Date(now - 5_000).toISOString();
  const r = formatCampaignSendCountdown(due, now);
  assert.equal(r.kind, "shortly");
  assert.equal(r.label, "Sending shortly…");
  assert.equal(r.remainingMs, 0);
  assert.equal(formatNextQueuedStatusSuffix(due, now), "Sending shortly…");
});

run("null scheduledAt => Sending shortly…", () => {
  const r = formatCampaignSendCountdown(null, now);
  assert.equal(r.kind, "shortly");
});

run("never negative timer", () => {
  const r = formatCampaignSendCountdown(new Date(now - 120_000).toISOString(), now);
  assert.ok(r.remainingMs >= 0);
  assert.equal(formatCountdownMmSs(-50_000), "0:00");
});

run("select next queued item by earliest scheduledAt", () => {
  const next = selectNextQueuedCampaignItem([
    { id: "b", queueStatus: "queued", scheduledAt: "2026-07-25T18:03:00.000Z" },
    { id: "a", queueStatus: "queued", scheduledAt: "2026-07-25T18:01:00.000Z" },
    { id: "sent", queueStatus: "sent", scheduledAt: "2026-07-25T17:00:00.000Z" },
    { id: "sending", queueStatus: "sending", scheduledAt: "2026-07-25T18:00:30.000Z" },
  ]);
  assert.equal(next?.id, "a");
});

run("null scheduledAt sorts as next (already due)", () => {
  const next = selectNextQueuedCampaignItem([
    { id: "later", queueStatus: "queued", scheduledAt: "2026-07-25T18:05:00.000Z" },
    { id: "due", queueStatus: "queued", scheduledAt: null },
  ]);
  assert.equal(next?.id, "due");
});

run("paused status", () => {
  const s = resolveCampaignSendActivityStatus({
    queueRunning: true,
    queuePaused: true,
    items: [{ id: "a", queueStatus: "queued", scheduledAt: "2026-07-25T18:02:00.000Z" }],
    nowMs: now,
  });
  assert.equal(s.kind, "paused");
  assert.equal(s.label, "Campaign paused");
});

run("complete status", () => {
  const s = resolveCampaignSendActivityStatus({
    queueRunning: true,
    queuePaused: false,
    items: [
      { id: "a", queueStatus: "sent", scheduledAt: null },
      { id: "b", queueStatus: "failed", scheduledAt: null },
    ],
    nowMs: now,
  });
  assert.equal(s.kind, "complete");
  assert.equal(s.label, "Campaign complete");
});

run("empty never-started campaign stays idle", () => {
  const s = resolveCampaignSendActivityStatus({
    queueRunning: false,
    queuePaused: false,
    items: [],
    nowMs: now,
  });
  assert.equal(s.kind, "idle");
  assert.equal(s.label, "");
});

run("active countdown status", () => {
  const s = resolveCampaignSendActivityStatus({
    queueRunning: true,
    queuePaused: false,
    items: [{ id: "a", queueStatus: "queued", scheduledAt: new Date(now + 90_000).toISOString() }],
    nowMs: now,
  });
  assert.equal(s.kind, "active_countdown");
  assert.equal(s.label, "Sending active · Next email in 1:30");
});

run("active shortly status", () => {
  const s = resolveCampaignSendActivityStatus({
    queueRunning: true,
    queuePaused: false,
    items: [{ id: "a", queueStatus: "queued", scheduledAt: new Date(now - 1_000).toISOString() }],
    nowMs: now,
  });
  assert.equal(s.kind, "active_shortly");
  assert.equal(s.label, "Sending active · Sending shortly…");
});

run("idle when not armed (empty label)", () => {
  const s = resolveCampaignSendActivityStatus({
    queueRunning: false,
    queuePaused: false,
    items: [{ id: "a", queueStatus: "queued", scheduledAt: new Date(now + 60_000).toISOString() }],
    nowMs: now,
  });
  assert.equal(s.kind, "idle");
  assert.equal(s.label, "");
});

run("next-row status suffix", () => {
  assert.equal(
    formatNextQueuedStatusSuffix(new Date(now + 65_000).toISOString(), now),
    "Sending in 1:05",
  );
});

console.log("\nAll prospect-campaign-countdown tests passed.");
