/**
 * Sidebar Inbox "new activity since last checked" badge helpers (browser-safe).
 * Count is message-based inbound activity — not total unread / Needs Reply.
 */

export const INBOX_ACTIVITY_QUERY_KEY = ["/api/inbox/activity"] as const;

/** Soft DB cap so the counter cannot grow without bound. */
export const INBOX_ACTIVITY_COUNT_SOFT_CAP = 9999;

export type InboxActivityPayload = {
  count: number;
  lastInboxCheckedAt: string | null;
};

/** Display label for nav badge; null means hide. */
export function formatInboxActivityBadge(count: number): string | null {
  const n = Math.floor(Number(count) || 0);
  if (n <= 0) return null;
  if (n >= 100) return "99+";
  return String(n);
}

export function isInboxAppPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === "/app/inbox" || pathname.startsWith("/app/inbox/");
}
