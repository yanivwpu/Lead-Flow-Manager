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
