/**
 * Shared helper: is a mailbox usable for outbound send the same way manual PI outreach is.
 * Sticky `needs_reconnect` / `error` can still send when credentials decrypt + refresh.
 */
export function isEmailMailboxSyncStatusSendable(syncStatus: string | null | undefined): boolean {
  const status = String(syncStatus || "").toLowerCase();
  if (!status || status === "disconnected") return false;
  // Manual send does not hard-block on sticky needs_reconnect/error — tokens decide.
  return ["connected", "syncing", "connecting", "error", "needs_reconnect"].includes(status);
}

/**
 * Settings Channels + Campaigns UI: mailbox appears Connected / Syncing.
 * Both surfaces must use this — never infer UI health from sticky queueItem.lastError.
 */
export function isEmailMailboxUiConnected(syncStatus: string | null | undefined): boolean {
  const status = String(syncStatus || "").toLowerCase();
  return status === "connected" || status === "syncing";
}

/**
 * Campaigns reconnect banner — live mailbox readiness only (Settings syncStatus),
 * not stale sender_not_connected lastError on queue rows.
 * Shown whenever Campaigns needs a healthy mailbox (draft Start or Pause/Resume).
 */
export function shouldShowCampaignEmailReconnectBanner(input: {
  /** Campaign has ready rows or is mid-flight / paused. */
  campaignNeedsMailbox?: boolean;
  /** @deprecated use campaignNeedsMailbox — kept for older call sites. */
  queuePaused?: boolean;
  mailboxSyncStatus: string | null | undefined;
  /** False while `/api/integrations/email/status` is still loading. */
  emailStatusKnown: boolean;
}): boolean {
  const needsMailbox =
    input.campaignNeedsMailbox === true || input.queuePaused === true;
  if (!needsMailbox || !input.emailStatusKnown) return false;
  return !isEmailMailboxUiConnected(input.mailboxSyncStatus);
}
