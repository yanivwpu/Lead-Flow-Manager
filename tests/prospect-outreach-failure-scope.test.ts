/**
 * Campaign failure scope — prospect vs campaign vs transient.
 * Run: npx tsx tests/prospect-outreach-failure-scope.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyProspectOutreachFailureScope,
  isProspectScopedOutreachFailure,
  isTransientOutreachFailure,
  prospectTransientRetryDelayMs,
  shouldGloballyPauseProspectCampaign,
} from "../shared/prospectOutreachFailureScope";
import {
  formatProspectQueueItemError,
  isProspectOutreachQueueArmed,
  nextProspectQueueControlFlags,
  PROSPECT_CAMPAIGN_RECONNECT_EMAIL_MESSAGE,
} from "../shared/prospectBulkOutreach";

// Prospect-specific — must never globally pause
{
  for (const reason of [
    "missing_identity",
    "suppressed",
    "opted_out",
    "not_qualified",
    "permanent:550 mailbox unavailable",
    "invalid recipient",
  ]) {
    assert.equal(classifyProspectOutreachFailureScope(reason), "prospect", reason);
    assert.equal(shouldGloballyPauseProspectCampaign(reason), false, reason);
    assert.equal(isProspectScopedOutreachFailure(reason), true, reason);
  }
}

// Campaign-wide sender / limits
{
  for (const reason of [
    "sender_not_connected",
    "sender_not_connected:decrypt:access_token",
    "sender_not_connected:token_refresh",
    "No connected email mailbox",
    "daily email send limit reached",
    "hourly email send limit",
    "oauth token revoked",
  ]) {
    assert.equal(classifyProspectOutreachFailureScope(reason), "campaign", reason);
    assert.equal(shouldGloballyPauseProspectCampaign(reason), true, reason);
  }
}

// Transient — backoff, no immediate global pause
{
  for (const reason of ["429 Too Many Requests", "timeout waiting for provider", "ECONNRESET", "503 unavailable"]) {
    assert.equal(classifyProspectOutreachFailureScope(reason), "transient", reason);
    assert.equal(isTransientOutreachFailure(reason), true, reason);
    assert.equal(shouldGloballyPauseProspectCampaign(reason), false, reason);
  }
  assert.ok(prospectTransientRetryDelayMs(1) >= 30_000);
  assert.ok(prospectTransientRetryDelayMs(3) > prospectTransientRetryDelayMs(1));
  assert.ok(prospectTransientRetryDelayMs(10) <= 15 * 60_000);
}

// UI copy for decrypt vs missing mailbox
{
  assert.equal(
    formatProspectQueueItemError("sender_not_connected:decrypt:access_token"),
    "Reconnect Gmail before Start Sending",
  );
  assert.match(PROSPECT_CAMPAIGN_RECONNECT_EMAIL_MESSAGE, /Reconnect Gmail/i);
}

// Resume arming only when not paused
{
  const paused = nextProspectQueueControlFlags("pause", { queueRunning: true, paused: false });
  assert.equal(isProspectOutreachQueueArmed(paused), false);
  const resumed = nextProspectQueueControlFlags("resume", paused);
  assert.equal(isProspectOutreachQueueArmed(resumed), true);
}

// Worker source contracts: prospect fail does not call pauseQueue; resume validates sender
{
  const src = readFileSync(
    join(import.meta.dirname, "..", "server/prospectImport/prospectOutreachQueueService.ts"),
    "utf8",
  );
  assert.ok(src.includes("isProspectScopedOutreachFailure"));
  assert.ok(src.includes("scheduleTransientRetry"));
  assert.ok(src.includes("assertLiveEmailSenderForCampaignArm"));
  assert.ok(src.includes("handleSenderNotConnectedInfraPause"));
  // Eligibility fall-through removed — missing_identity must markItemFailed, not prepare
  const eligBlock = src.slice(
    src.indexOf("if (!eligibility.channels[channel]?.eligible)"),
    src.indexOf("const prepared = await sender.prepare"),
  );
  assert.ok(eligBlock.includes('await markItemFailed(item, reason, false)'));
  assert.ok(eligBlock.includes("shouldGloballyPauseProspectCampaign(reason)"));
  assert.ok(!eligBlock.includes("fall through"));
}

{
  const senderSrc = readFileSync(
    join(import.meta.dirname, "..", "server/prospectImport/prospectOutreachSenders.ts"),
    "utf8",
  );
  assert.ok(senderSrc.includes("shouldGloballyPauseProspectCampaign"));
}

console.log("prospect-outreach-failure-scope.test.ts: all assertions passed");
