/**
 * Unified Inbox row expansion rules.
 *
 * - Email: one row per conversation/thread (never collapse siblings).
 * - Chat-style channels (whatsapp, facebook, instagram, telegram, sms, …):
 *   one row per contact using the newest non-email conversation.
 */

import { selectPrimaryConversation } from "./inboxPrimaryConversation";

export type InboxRowContactLike = {
  id: string;
  primaryChannel?: string | null;
  primaryChannelOverride?: string | null;
};

export type InboxRowConversationLike = {
  id: string;
  channel: string;
  lastMessageAt?: Date | string | null;
  lastMessagePreview?: string | null;
  lastMessageDirection?: string | null;
  unreadCount?: number | null;
  subject?: string | null;
  status?: string | null;
  channelAccountId?: string | null;
  externalThreadId?: string | null;
};

export type BuiltInboxRow<C extends InboxRowContactLike, V extends InboxRowConversationLike> = {
  contact: C;
  conversation: V | null;
  channel: string;
  lastMessage: string;
  lastMessageAt: Date | string | null;
  unreadCount: number;
  contactUnreadTotal: number;
};

export function isEmailConversationChannel(channel: string | null | undefined): boolean {
  return String(channel || "").toLowerCase() === "email";
}

/** Prefer subject for email thread distinguishability; fall back to preview. */
export function inboxEmailRowPreview(conversation: InboxRowConversationLike): string {
  const subject = String(conversation.subject || "").trim();
  if (subject) return subject.slice(0, 100);
  return String(conversation.lastMessagePreview || "").slice(0, 100);
}

/**
 * Expand one contact's conversations into inbox list rows.
 * Pure / unit-testable — used by `storage.getUnifiedInbox`.
 */
export function buildInboxItemsForContact<
  C extends InboxRowContactLike,
  V extends InboxRowConversationLike,
>(params: {
  contact: C;
  conversations: readonly V[];
}): BuiltInboxRow<C, V>[] {
  const { contact, conversations } = params;
  const contactUnreadTotal = conversations.reduce(
    (sum, c) => sum + Math.max(0, c.unreadCount || 0),
    0,
  );

  const emailConvs = conversations.filter((c) => isEmailConversationChannel(c.channel));
  const nonEmailConvs = conversations.filter((c) => !isEmailConversationChannel(c.channel));

  const items: BuiltInboxRow<C, V>[] = [];

  for (const conv of emailConvs) {
    items.push({
      contact,
      conversation: conv,
      channel: "email",
      lastMessage: inboxEmailRowPreview(conv),
      lastMessageAt: conv.lastMessageAt ?? null,
      unreadCount: Math.max(0, conv.unreadCount || 0),
      contactUnreadTotal,
    });
  }

  if (nonEmailConvs.length > 0) {
    const primary =
      selectPrimaryConversation(nonEmailConvs) || nonEmailConvs[0];
    items.push({
      contact,
      conversation: primary,
      channel: primary.channel,
      lastMessage: String(primary.lastMessagePreview || "").slice(0, 100),
      lastMessageAt: primary.lastMessageAt ?? null,
      unreadCount: Math.max(0, primary.unreadCount || 0),
      contactUnreadTotal,
    });
  } else if (emailConvs.length === 0) {
    // Contact with no conversations — keep CRM-openable row.
    const channel =
      contact.primaryChannelOverride || contact.primaryChannel || "whatsapp";
    items.push({
      contact,
      conversation: null,
      channel,
      lastMessage: "",
      lastMessageAt: null,
      unreadCount: 0,
      contactUnreadTotal: 0,
    });
  }

  return items;
}

/** Stable React / DOM identity for an inbox row. */
export function inboxRowKey(item: {
  contact: { id: string };
  conversation?: { id?: string | null } | null;
}): string {
  return item.conversation?.id || item.contact.id;
}
