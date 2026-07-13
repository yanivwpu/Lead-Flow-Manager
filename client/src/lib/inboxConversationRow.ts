/**
 * Inbox conversation list row — fixed compact layout contract.
 * Unread mark-read helpers live below; row chrome is independent of unread logic.
 */

export type InboxUnreadItem = {
  contact: { id: string };
  unreadCount: number;
  /** Aggregate across all conversations — used for Unread filter, not row badge. */
  contactUnreadTotal?: number;
  conversation?: { id?: string; unreadCount?: number | null } | null;
};

export type ConversationUnreadLike = {
  id: string;
  unreadCount?: number | null;
};

/**
 * After marking one conversation read, recompute contact aggregate.
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
 * Optimistically clear unread for the conversation represented by the inbox row.
 * `unreadCount` on the item is the ROW conversation unread (not contact aggregate).
 * `contactUnreadTotal` tracks remaining unread across siblings.
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
    const isRowConversation = item.conversation?.id === opts.conversationId;
    return {
      ...item,
      // Row badge follows the conversation shown on the row.
      unreadCount: isRowConversation ? 0 : item.unreadCount,
      contactUnreadTotal: remaining,
      conversation:
        isRowConversation && item.conversation
          ? { ...item.conversation, unreadCount: 0 }
          : item.conversation,
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
          contactUnreadTotal: 0,
          conversation: item.conversation
            ? { ...item.conversation, unreadCount: 0 }
            : item.conversation,
        }
      : item,
  );
}

/**
 * Preserve cleared row-conversation unread when a stale inbox refetch still
 * reports unreadCount > 0 for a conversation we just marked read.
 */
export function mergeInboxUnreadPreservingLocalRead<T extends InboxUnreadItem>(
  previous: T[] | undefined | null,
  incoming: T[],
  recentlyClearedConversationIds: ReadonlySet<string>,
): T[] {
  if (!recentlyClearedConversationIds.size) return incoming;
  return incoming.map((item) => {
    const convId = item.conversation?.id;
    if (!convId || !recentlyClearedConversationIds.has(convId)) return item;
    if ((item.unreadCount || 0) <= 0 && (item.conversation?.unreadCount || 0) <= 0) {
      return item;
    }
    return {
      ...item,
      unreadCount: 0,
      conversation: item.conversation
        ? { ...item.conversation, unreadCount: 0 }
        : item.conversation,
    };
  });
}

// ── Fixed compact row layout contract ───────────────────────────────────────

/**
 * Outer row: fixed height + identical padding/border box for every state.
 * Selected/unread/status MUST NOT add padding, ring, outer shadow, or wrap.
 *
 * Height budget (68px):
 *   py-2 (16) + line1 20 + gap 2 + line2 16 + gap 2 + line3 20 + border ≈ 68
 */
export const INBOX_ROW_OUTER_BASE =
  "box-border h-[68px] px-3 py-2 border-b border-l-2 border-l-transparent cursor-pointer overflow-hidden transition-colors bg-transparent hover:bg-gray-100/70";

export const INBOX_ROW_INNER =
  "flex h-full min-h-0 items-center gap-2.5 overflow-hidden";

export const INBOX_ROW_BODY =
  "flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-0.5 overflow-hidden";

/** Line 1 — name / time / unread */
export const INBOX_ROW_LINE1 =
  "flex h-5 min-h-[20px] max-h-[20px] items-center gap-1 overflow-hidden";

/** Line 2 — channel icon + single-line preview */
export const INBOX_ROW_LINE2 =
  "flex h-4 min-h-[16px] max-h-[16px] items-center gap-1 overflow-hidden";

/** Line 3 — status/tag chips, single line, clip overflow (never wrap) */
export const INBOX_ROW_LINE3 =
  "flex h-5 min-h-[20px] max-h-[20px] items-center gap-1 overflow-hidden whitespace-nowrap";

export const INBOX_ROW_NAME =
  "min-w-0 flex-1 truncate text-sm font-medium leading-5";

export const INBOX_ROW_NAME_UNREAD = "font-semibold";

export const INBOX_ROW_TIME =
  "shrink-0 text-[10px] leading-none text-muted-foreground whitespace-nowrap";

export const INBOX_ROW_UNREAD_BADGE =
  "ml-0.5 inline-flex h-4 min-h-[16px] max-h-[16px] shrink-0 items-center justify-center rounded-full bg-gray-200 px-1.5 text-[10px] font-medium leading-none text-gray-800";

export const INBOX_ROW_PREVIEW =
  "min-w-0 flex-1 truncate text-xs leading-4 text-muted-foreground whitespace-nowrap";

export const INBOX_ROW_PREVIEW_UNREAD = "font-medium text-gray-700";

export const INBOX_ROW_CHANNEL_ICON_WRAP =
  "inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center";

/** Compact chips — fixed height, never grow the row */
export const INBOX_ROW_CHIP =
  "inline-flex h-4 max-h-4 shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full border px-1.5 text-[10px] font-medium leading-none";

export type InboxRowChromeInput = {
  selected: boolean;
  overdue?: boolean;
};

/**
 * Outer chrome classes. Selected/overdue only change color/background —
 * never padding, height, border width, or box model.
 */
export function inboxConversationRowChromeClassName(input: InboxRowChromeInput): string {
  const parts = [INBOX_ROW_OUTER_BASE];
  if (input.selected) {
    parts.push("bg-white hover:bg-white");
    parts.push(input.overdue ? "!border-l-red-400" : "!border-l-gray-300");
  } else if (input.overdue) {
    parts.push("!border-l-red-400");
  }
  return parts.join(" ");
}

/** Layout contract shared by all row variants — for regression tests. */
export function inboxConversationRowLayoutContract(input: InboxRowChromeInput): {
  outer: string;
  inner: string;
  body: string;
  line1: string;
  line2: string;
  line3: string;
  heightClass: string;
  paddingClass: string;
  borderWidthClass: string;
} {
  const outer = inboxConversationRowChromeClassName(input);
  return {
    outer,
    inner: INBOX_ROW_INNER,
    body: INBOX_ROW_BODY,
    line1: INBOX_ROW_LINE1,
    line2: INBOX_ROW_LINE2,
    line3: INBOX_ROW_LINE3,
    heightClass: "h-[68px]",
    paddingClass: "px-3 py-2",
    borderWidthClass: "border-l-2",
  };
}

/** @deprecated — use INBOX_ROW_LINE3 */
export const INBOX_ROW_STATUS_BAND_CLASS = INBOX_ROW_LINE3;
/** @deprecated — use INBOX_ROW_LINE1 */
export const INBOX_ROW_HEADER_CLASS = INBOX_ROW_LINE1;
