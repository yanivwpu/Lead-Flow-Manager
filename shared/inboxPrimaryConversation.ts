/**
 * Inbox primary conversation selection for contacts with multiple sibling
 * conversations on the same channel (native Email threads).
 *
 * Row + center must share the same primary: newest by lastMessageAt within the
 * preferred channel (fallback: all conversations).
 */

export type ConversationForPrimaryPick = {
  id: string;
  channel?: string | null;
  lastMessageAt?: Date | string | null;
  unreadCount?: number | null;
  subject?: string | null;
  lastMessagePreview?: string | null;
  lastMessageDirection?: string | null;
  status?: string | null;
  channelAccountId?: string | null;
  externalThreadId?: string | null;
};

export function conversationLastMessageTimeMs(
  conversation: ConversationForPrimaryPick | null | undefined,
): number {
  const v = conversation?.lastMessageAt;
  if (v == null) return 0;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? t : 0;
  }
  const t = new Date(String(v)).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Newest conversation by lastMessageAt.
 * When preferredChannel is set, choose among that channel first; if none match,
 * fall back to all conversations.
 */
export function selectPrimaryConversation<T extends ConversationForPrimaryPick>(
  conversations: readonly T[],
  preferredChannel?: string | null,
): T | null {
  if (!conversations.length) return null;
  const preferred = preferredChannel?.trim() || null;
  const pool = preferred
    ? conversations.filter((c) => (c.channel || null) === preferred)
    : null;
  const list = pool && pool.length > 0 ? pool : [...conversations];

  let best = list[0];
  for (let i = 1; i < list.length; i++) {
    const cur = list[i];
    const curMs = conversationLastMessageTimeMs(cur);
    const bestMs = conversationLastMessageTimeMs(best);
    if (curMs > bestMs) {
      best = cur;
    } else if (curMs === bestMs && String(cur.id) > String(best.id)) {
      best = cur;
    }
  }
  return best;
}

/**
 * Resolve center-panel conversation for a contact.
 * - newestPrimary: row / default open target
 * - stickyConversationId: keep an older sibling open while the user is reading it
 * - inboxRowConversation: authoritative GET /api/inbox primary (may be ahead of stale contact detail)
 */
export function resolveContactCenterConversation<T extends ConversationForPrimaryPick>(params: {
  conversations: readonly T[];
  preferredChannel?: string | null;
  stickyConversationId?: string | null;
  inboxRowConversation?: T | null;
}): {
  newestPrimary: T | null;
  centerConversation: T | null;
  usedSticky: boolean;
  usedInboxRow: boolean;
} {
  const fromList = selectPrimaryConversation(params.conversations, params.preferredChannel);
  const inbox = params.inboxRowConversation ?? null;
  const inboxInList = inbox
    ? params.conversations.find((c) => c.id === inbox.id) ?? null
    : null;

  // Prefer inbox-aligned conversation when present in detail; otherwise trust inbox row object
  // so a stale /api/contacts payload cannot keep an older sibling as primary.
  let newestPrimary: T | null = inboxInList || fromList;
  if (!newestPrimary && inbox) {
    newestPrimary = inbox;
  } else if (inboxInList) {
    newestPrimary = inboxInList;
  } else if (inbox && fromList) {
    const inboxMs = conversationLastMessageTimeMs(inbox);
    const fromMs = conversationLastMessageTimeMs(fromList);
    newestPrimary = inboxMs >= fromMs ? inbox : fromList;
  }

  const stickyId = params.stickyConversationId?.trim() || null;
  if (stickyId) {
    const sticky =
      params.conversations.find((c) => c.id === stickyId) ||
      (inbox && inbox.id === stickyId ? inbox : null);
    if (sticky && sticky.id !== newestPrimary?.id) {
      return {
        newestPrimary,
        centerConversation: sticky,
        usedSticky: true,
        usedInboxRow: Boolean(inbox && newestPrimary?.id === inbox.id),
      };
    }
  }

  return {
    newestPrimary,
    centerConversation: newestPrimary,
    usedSticky: false,
    usedInboxRow: Boolean(inbox && newestPrimary?.id === inbox.id),
  };
}
