/**
 * Pure helpers for Inbox list loading UX (skeleton / error / pin visibility).
 */

export function shouldShowInboxListSkeleton(input: {
  isServerSearching: boolean;
  inboxPending: boolean;
  inboxData: unknown;
  searchPending: boolean;
  searchData: unknown;
  pinnedRowCount: number;
}): boolean {
  if (input.isServerSearching) {
    return input.searchPending && input.searchData === undefined;
  }
  // Deep-linked pins must be visible while the recent page is still loading.
  if (input.pinnedRowCount > 0) return false;
  return input.inboxPending && input.inboxData === undefined;
}

export function shouldShowInboxListError(input: {
  isServerSearching: boolean;
  inboxError: unknown;
  inboxData: unknown;
  pinnedRowCount: number;
}): boolean {
  if (input.isServerSearching) return false;
  return Boolean(input.inboxError) && input.inboxData === undefined && input.pinnedRowCount === 0;
}

/**
 * Only cancel the recent Inbox query when cached data exists.
 * Cancelling an in-flight initial fetch leaves data undefined and can stick the list on skeletons.
 */
export function shouldCancelInboxRecentQuery(cachedRecent: unknown): boolean {
  return cachedRecent !== undefined;
}

/** Stable exact key for the recent Inbox page (not search). */
export const INBOX_RECENT_QUERY_KEY = ["/api/inbox"] as const;

export function inboxSearchQueryKey(sanitizedQ: string) {
  return ["/api/inbox", "search", sanitizedQ] as const;
}
