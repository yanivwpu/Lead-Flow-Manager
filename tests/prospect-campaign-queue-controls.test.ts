/**
 * Campaign Start / Pause / Resume control regressions.
 * Run: npx tsx tests/prospect-campaign-queue-controls.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatProspectQueueItemError,
  isProspectOutreachQueueArmed,
  nextProspectQueueControlFlags,
  nextQueueItemAfterInfraPause,
  buildStaggeredQueueSchedule,
  PROSPECT_CAMPAIGN_CONNECT_EMAIL_MESSAGE,
} from "../shared/prospectBulkOutreach";

// Ready + globally paused → Start clears pause and arms without rewriting Ready
{
  const before = { queueRunning: false, paused: true };
  assert.equal(isProspectOutreachQueueArmed(before), false);

  const afterStart = nextProspectQueueControlFlags("start", before);
  assert.deepEqual(afterStart, { queueRunning: true, paused: false });
  assert.equal(isProspectOutreachQueueArmed(afterStart), true);

  // Start must not imply item-level paused status
  const release = nextQueueItemAfterInfraPause({
    currentAttempts: 0,
    reason: "sender_not_connected",
  });
  assert.equal(release.queueStatus, "queued");
  assert.equal(release.attempts, 0);
}

// Pause Sending → queue stops (not armed); Ready rows stay processable once resumed
{
  const running = { queueRunning: true, paused: false };
  const afterPause = nextProspectQueueControlFlags("pause", running);
  assert.deepEqual(afterPause, { queueRunning: true, paused: true });
  assert.equal(isProspectOutreachQueueArmed(afterPause), false);
}

// Resume Sending → processable again
{
  const paused = { queueRunning: true, paused: true };
  const afterResume = nextProspectQueueControlFlags("resume", paused);
  assert.deepEqual(afterResume, { queueRunning: true, paused: false });
  assert.equal(isProspectOutreachQueueArmed(afterResume), true);
}

// Attempts unchanged by infra release (claim no longer increments)
{
  const released = nextQueueItemAfterInfraPause({
    currentAttempts: 0,
    reason: "sender_not_connected",
  });
  assert.equal(released.attempts, 0);
  assert.equal(released.queueStatus, "queued");
}

// pauseQueue must not bulk-rewrite queued → paused; Start requires live mailbox
{
  const src = readFileSync(
    join(import.meta.dirname, "..", "server/prospectImport/prospectOutreachQueueService.ts"),
    "utf8",
  );
  const pauseStart = src.indexOf("export async function pauseQueue");
  const resumeStart = src.indexOf("export async function resumeQueue");
  assert.ok(pauseStart >= 0 && resumeStart > pauseStart);
  const pauseFn = src.slice(pauseStart, resumeStart);
  assert.ok(pauseFn.includes("global_pause_only") || pauseFn.includes("nextProspectQueueControlFlags"));
  assert.ok(!pauseFn.includes('queueStatus: "paused"'));
  assert.ok(src.includes("releaseClaimedItemAfterInfraPause"));
  assert.ok(src.includes("nextQueueItemAfterInfraPause"));
  assert.ok(src.includes("PROSPECT_CAMPAIGN_CONNECT_EMAIL_MESSAGE"));
  assert.ok(src.includes("PROSPECT_CAMPAIGN_RECONNECT_EMAIL_MESSAGE"));
  assert.ok(src.includes("assertLiveEmailSenderForCampaignArm"));
  assert.ok(src.includes("classifyProspectOutreachFailureScope"));
  assert.ok(src.includes("markItemFailed(item, reason, false)"));
  assert.ok(src.includes("resolveEmailSenderForBulkOutreach"));
  assert.ok(src.includes("rescheduleQueuedOutreachItems"));
  assert.ok(src.includes("wakeProspectOutreachQueueWorker"));
  assert.ok(src.includes("armQueueAndWake"));
}

{
  assert.equal(
    formatProspectQueueItemError("sender_not_connected"),
    "Connect an email account before starting the campaign",
  );
  assert.equal(
    formatProspectQueueItemError("sender_not_connected:decrypt"),
    "Reconnect your email account before resuming",
  );
  assert.match(PROSPECT_CAMPAIGN_CONNECT_EMAIL_MESSAGE, /Connect an email account/i);

  const panelSrc = readFileSync(
    join(import.meta.dirname, "..", "client/src/components/settings/ProspectOutreachQueuePanel.tsx"),
    "utf8",
  );
  assert.ok(panelSrc.includes("formatProspectQueueItemError"));
  assert.ok(panelSrc.includes("po-queue-sender-blocker"));
  assert.ok(panelSrc.includes("queueArmed"));
  assert.ok(panelSrc.includes("globalSenderBlocker"));
  assert.ok(panelSrc.includes("shouldShowCampaignEmailReconnectBanner"));
  assert.ok(panelSrc.includes('"/api/integrations/email/status"'));
  assert.ok(panelSrc.includes("resolveProspectCampaignPrimaryControl"));
  assert.ok(panelSrc.includes("primaryControl === \"start\""));
  assert.ok(panelSrc.includes("primaryControl === \"resume\""));
}

// Resume semantics: clear pause + restagger so first item is soon due
{
  const fromMs = Date.parse("2026-07-25T04:00:00.000Z");
  const stamps = buildStaggeredQueueSchedule({
    itemCount: 12,
    fromMs,
    minDelaySeconds: 90,
    maxDelaySeconds: 180,
    firstDelayMs: 0,
    deterministicDelaysMs: Array(12).fill(90_000),
  });
  assert.equal(stamps.length, 12);
  assert.equal(stamps[0], fromMs);
  assert.equal(stamps[1], fromMs + 90_000);
  // First item eligible immediately on Resume
  assert.equal(stamps[0]! - fromMs, 0);
  assert.equal(stamps[11]! - stamps[10]!, 90_000);

  const afterResume = nextProspectQueueControlFlags("resume", {
    queueRunning: true,
    paused: true,
  });
  assert.equal(isProspectOutreachQueueArmed(afterResume), true);
}

// Worker wake export exists
{
  const workerSrc = readFileSync(
    join(import.meta.dirname, "..", "server/prospectImport/prospectOutreachQueueWorker.ts"),
    "utf8",
  );
  assert.ok(workerSrc.includes("export function wakeProspectOutreachQueueWorker"));
  assert.ok(workerSrc.includes("processDueOutreach"));
}

console.log("prospect-campaign-queue-controls.test.ts: all assertions passed");
