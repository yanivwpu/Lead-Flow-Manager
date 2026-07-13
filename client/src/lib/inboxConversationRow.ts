/**
 * Inbox unread + conversation row layout helpers (testable, shared with UnifiedInbox).
 */

export type InboxUnreadItem = {
  contact: { id: string };
  unreadCount: number;
  conversation?: { unreadCount?: number | null } | null;
};

/** Optimistically clear contact-level unread (inbox list sums all conversations). */
export function applyInboxContactMarkRead<T extends InboxUnreadItem>(
  items: T[] | undefined | null,
  contactId: string,
): T[] | undefined | null {
  if (!items) return items;
  return items.map((item) =>
    item.contact.id === contactId
      ? {
          ...item,
          unreadCount: 0,
          conversation: item.conversation
            ? { ...item.conversation, unreadCount: 0 }
            : item.conversation,
        }
      : item,
  );
}

/** Preserve a zeroed contact unread across a stale inbox refetch. */
export function mergeInboxUnreadPreservingLocalRead<T extends InboxUnreadItem>(
  previous: T[] | undefined | null,
  incoming: T[],
  recentlyReadContactIds: ReadonlySet<string>,
): T[] {
  if (!recentlyReadContactIds.size) return incoming;
  const prevById = new Map((previous || []).map((i) => [i.contact.id, i]));
  return incoming.map((item) => {
    if (!recentlyReadContactIds.has(item.contact.id)) return item;
    const prev = prevById.get(item.contact.id);
    // If we already cleared locally, do not let a stale server sum restore the badge.
    if (prev && prev.unreadCount === 0 && item.unreadCount > 0) {
      return {
        ...item,
        unreadCount: 0,
        conversation: item.conversation
          ? { ...item.conversation, unreadCount: 0 }
          : item.conversation,
      };
    }
    return item;
  });
}

export type InboxRowChromeInput = {
  selected: boolean;
  overdue?: boolean;
};

/**
 * Stable row chrome — always reserve left border width so selection does not
 * change row height/width. Avoid ring/outline that expands layout box.
 */
export function inboxConversationRowChromeClassName(input: InboxRowChromeInput): string {
  const parts = [
    "p-3 border-b border-l-2 cursor-pointer transition-colors bg-transparent hover:bg-gray-100/70",
  ];
  if (input.selected) {
    parts.push("bg-white hover:bg-white shadow-[inset_0_0_0_1px_rgba(229,231,235,1)]");
    parts.push(input.overdue ? "border-l-red-400" : "border-l-gray-300");
  } else if (input.overdue) {
    parts.push("border-l-red-400");
  } else {
    parts.push("border-l-transparent");
  }
  return parts.join(" ");
}

/** Fixed band for status chips so Needs Reply mount/unmount does not change row height. */
export const INBOX_ROW_STATUS_BAND_CLASS = "flex items-center gap-1 flex-wrap min-h-[22px]";

/** Name/time/badge row — stable height whether unread badge is present. */
export const INBOX_ROW_HEADER_CLASS = "flex items-center gap-1 mb-0.5 min-h-[20px]";
