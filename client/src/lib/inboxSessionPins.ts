/**
 * Build InboxItem rows from a contact + conversations payload (deep-link pin).
 */

import { buildInboxItemsForContact, type InboxRowContactLike, type InboxRowConversationLike } from "@shared/inboxRowModel";

export type PinInboxItem<C extends InboxRowContactLike, V extends InboxRowConversationLike> = {
  contact: C;
  conversation: V | null;
  channel: string;
  lastMessage: string;
  lastMessageAt: string | null;
  unreadCount: number;
  contactUnreadTotal: number;
  lastEmailMessageId: null;
  formIdentity: null;
};

export function inboxItemsFromContactDetail<
  C extends InboxRowContactLike,
  V extends InboxRowConversationLike,
>(
  contact: C,
  conversations: readonly V[],
): PinInboxItem<C, V>[] {
  return buildInboxItemsForContact({ contact, conversations }).map((row) => {
    const lastMessageAt =
      row.lastMessageAt == null
        ? null
        : row.lastMessageAt instanceof Date
          ? row.lastMessageAt.toISOString()
          : String(row.lastMessageAt);
    return {
      contact: row.contact,
      conversation: row.conversation,
      channel: row.channel,
      lastMessage: row.lastMessage,
      lastMessageAt,
      unreadCount: row.unreadCount,
      contactUnreadTotal: row.contactUnreadTotal,
      lastEmailMessageId: null,
      formIdentity: null,
    };
  });
}

/**
 * Prefer the deep-linked conversation row when `conversationId` is set;
 * otherwise keep all built rows for that contact (chat primary + email threads).
 */
export function selectPinCandidates<T extends { conversation?: { id: string } | null }>(
  items: T[],
  conversationId: string | null,
): T[] {
  if (!conversationId) return items;
  const match = items.filter((item) => item.conversation?.id === conversationId);
  return match.length > 0 ? match : items;
}
