/**
 * Inbox unread + conversation row layout helpers (testable, shared with UnifiedInbox).
 */

export type InboxUnreadItem = {
  contact: { id: string };
  unreadCount: number;
  conversation?: { id?: string; unreadCount?: number | null } | null;
};

export type ConversationUnreadLike = {
  id: string;
  unreadCount?: number | null;
};

/**
 * After marking one conversation read, recompute contact aggregate badge.
 * Does NOT zero unread on other conversations/channels for the same contact.
 */
export function remainingContactUnreadAfterMarkingConversation(input: {
  conversations: ConversationUnreadLike[];
  markedConversationId: string;
}): number {
  return input.conversations.reduce((sum, c) => {
    if (c.id === input.markedConversationId) return sum;
    return sum + Math.max(0, c.unreadCount || 0);
  }, 0);
}

/**
 * Optimistically clear unread for one conversation and set contact aggregate
 * to the remaining sum (other channels/threads stay unread).
 */
export function applyInboxConversationMarkRead<T extends InboxUnreadItem>(
  items: T[] | undefined | null,
  contactId: string,
  opts: {
    conversationId: string;
    remainingUnread: number;
  },
): T[] | undefined | null {
  if (!items) return items;
  const remaining = Math.max(0, opts.remainingUnread);
  return items.map((item) => {
    if (item.contact.id !== contactId) return item;
    const conversation =
      item.conversation &&
      (item.conversation.id == null || item.conversation.id === opts.conversationId)
        ? { ...item.conversation, unreadCount: 0 }
        : item.conversation;
    return {
      ...item,
      unreadCount: remaining,
      conversation,
    };
  });
}

/** @deprecated Use applyInboxConversationMarkRead — contact-wide clear hides other channels. */
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

/**
 * Preserve local remaining unread for a contact when a stale inbox refetch
 * reports a higher aggregate (e.g. still includes a conversation we just cleared).
 * Never forces the badge to 0 if other conversations remain unread.
 */
export function mergeInboxUnreadPreservingLocalRead<T extends InboxUnreadItem>(
  previous: T[] | undefined | null,
  incoming: T[],
  localRemainingByContactId: ReadonlyMap<string, number>,
): T[] {
  if (!localRemainingByContactId.size) return incoming;
  return incoming.map((item) => {
    const localRemaining = localRemainingByContactId.get(item.contact.id);
    if (localRemaining == null) return item;
    if (item.unreadCount > localRemaining) {
      return {
        ...item,
        unreadCount: localRemaining,
        conversation:
          item.conversation && localRemaining === 0
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
