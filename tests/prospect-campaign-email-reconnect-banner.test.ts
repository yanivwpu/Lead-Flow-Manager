/**
 * Campaigns reconnect banner must follow live mailbox readiness (Settings syncStatus),
 * not sticky queueItem.lastError from a prior decrypt/auth pause.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isEmailMailboxUiConnected,
  shouldShowCampaignEmailReconnectBanner,
} from "../shared/emailMailboxAvailability";
import {
  filterQueueItemsForStaleSenderErrorClear,
  shouldClearStaleSenderNotConnectedLastError,
} from "../shared/prospectOutreachFailureScope";
import { PROSPECT_CAMPAIGN_RECONNECT_EMAIL_MESSAGE } from "../shared/prospectBulkOutreach";

const mailboxId = "7f279098-850a-4d86-bff1-1f9cd87973b9";

// connected mailbox + stale sender error → no reconnect banner
{
  assert.equal(isEmailMailboxUiConnected("connected"), true);
  assert.equal(
    shouldShowCampaignEmailReconnectBanner({
      campaignNeedsMailbox: true,
      mailboxSyncStatus: "connected",
      emailStatusKnown: true,
    }),
    false,
    "healthy Settings mailbox must not show Campaign reconnect copy",
  );
  assert.equal(
    shouldClearStaleSenderNotConnectedLastError("sender_not_connected:decrypt:access_token"),
    true,
  );
}

// disconnected / needs_reconnect mailbox → reconnect banner remains for draft/start
{
  assert.equal(isEmailMailboxUiConnected("needs_reconnect"), false);
  assert.equal(isEmailMailboxUiConnected("disconnected"), false);
  assert.equal(
    shouldShowCampaignEmailReconnectBanner({
      campaignNeedsMailbox: true,
      mailboxSyncStatus: "needs_reconnect",
      emailStatusKnown: true,
    }),
    true,
  );
  assert.equal(
    shouldShowCampaignEmailReconnectBanner({
      campaignNeedsMailbox: true,
      mailboxSyncStatus: null,
      emailStatusKnown: true,
    }),
    true,
  );
}

// Campaign paused for another reason (healthy mailbox) does not show Gmail reconnect copy
{
  assert.equal(
    shouldShowCampaignEmailReconnectBanner({
      campaignNeedsMailbox: true,
      mailboxSyncStatus: "connected",
      emailStatusKnown: true,
    }),
    false,
  );
  assert.equal(
    shouldShowCampaignEmailReconnectBanner({
      campaignNeedsMailbox: false,
      mailboxSyncStatus: "needs_reconnect",
      emailStatusKnown: true,
    }),
    false,
    "no reconnect when campaign does not need mailbox",
  );
  assert.equal(
    shouldShowCampaignEmailReconnectBanner({
      campaignNeedsMailbox: true,
      mailboxSyncStatus: "needs_reconnect",
      emailStatusKnown: false,
    }),
    false,
    "do not flash reconnect while email status is still loading",
  );
}

// healthy Resume clears stale sender errors; recipient-specific errors preserved
{
  const rows = [
    {
      id: "a",
      queueStatus: "queued",
      lastError: "sender_not_connected:decrypt:access_token",
      senderMailboxId: mailboxId,
    },
    {
      id: "b",
      queueStatus: "queued",
      lastError: "suppressed",
      senderMailboxId: mailboxId,
    },
    {
      id: "c",
      queueStatus: "failed",
      lastError: "sender_not_connected:decrypt:access_token",
      senderMailboxId: mailboxId,
    },
    {
      id: "d",
      queueStatus: "paused",
      lastError: "sender_not_connected:token_refresh",
      senderMailboxId: null,
    },
    {
      id: "e",
      queueStatus: "queued",
      lastError: "missing_identity",
      senderMailboxId: mailboxId,
    },
    {
      id: "f",
      queueStatus: "queued",
      lastError: "sender_not_connected:decrypt:access_token",
      senderMailboxId: "other-mailbox",
    },
  ];
  const cleared = filterQueueItemsForStaleSenderErrorClear(rows, mailboxId);
  assert.deepEqual(
    cleared.map((r) => r.id).sort(),
    ["a", "d"],
    "only Ready/Paused sender_not_connected rows for this mailbox (or null mailbox)",
  );
  assert.ok(rows.some((r) => r.id === "b" && r.lastError === "suppressed"));
  assert.ok(rows.some((r) => r.id === "e" && r.lastError === "missing_identity"));
}

// Settings + Campaigns share the same UI connected resolver + Campaigns fetches status
{
  const settingsSrc = readFileSync(
    join(import.meta.dirname, "..", "client/src/components/ChannelSettings.tsx"),
    "utf8",
  );
  const panelSrc = readFileSync(
    join(import.meta.dirname, "..", "client/src/components/settings/ProspectOutreachQueuePanel.tsx"),
    "utf8",
  );
  const queueSrc = readFileSync(
    join(import.meta.dirname, "..", "server/prospectImport/prospectOutreachQueueService.ts"),
    "utf8",
  );
  assert.ok(settingsSrc.includes("isEmailMailboxUiConnected"));
  assert.ok(settingsSrc.includes('"/api/integrations/email/status"'));
  assert.ok(panelSrc.includes("shouldShowCampaignEmailReconnectBanner"));
  assert.ok(panelSrc.includes('"/api/integrations/email/status"'));
  assert.ok(panelSrc.includes("globalSenderBlocker"));
  assert.ok(panelSrc.includes("PROSPECT_CAMPAIGN_RECONNECT_EMAIL_MESSAGE"));
  assert.ok(queueSrc.includes("clearStaleSenderNotConnectedQueueErrors"));
  assert.ok(queueSrc.includes("assertLiveEmailSenderForCampaignArm"));
  assert.match(PROSPECT_CAMPAIGN_RECONNECT_EMAIL_MESSAGE, /Reconnect your email account/i);
}

console.log("prospect-campaign-email-reconnect-banner.test.ts: ok");
