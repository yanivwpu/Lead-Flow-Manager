/**
 * Build InboxItem rows from a contact + conversations payload (deep-link pin).
 */

import { buildInboxItemsForContact } from "@shared/inboxRowModel";
import type { Channel, Contact, Conversation, InboxItem } from "@shared/schema";

export function inboxItemsFromContactDetail(
  contact: Contact,
  conversations: readonly Conversation[],
): InboxItem[] {
  const built = buildInboxItemsForContact({ contact, conversations });
  return built.map((row) => {
    const lastMessageAtDate =
      row.lastMessageAt instanceof Date
        ? row.lastMessageAt
        : row.lastMessageAt
          ? new Date(row.lastMessageAt)
          : null;
    return {
      contact: row.contact as Contact,
      conversation: (row.conversation as Conversation) || (null as unknown as Conversation),
      channel: row.channel as Channel,
      lastMessage: row.lastMessage,
      // Client inbox rows typically deserialize dates as ISO strings.
      lastMessageAt: lastMessageAtDate,
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
export function selectPinCandidates(
  items: InboxItem[],
  conversationId: string | null,
): InboxItem[] {
  if (!conversationId) return items;
  const match = items.filter((item) => item.conversation?.id === conversationId);
  return match.length > 0 ? match : items;
}
