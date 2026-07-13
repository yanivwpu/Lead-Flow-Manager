/**
 * Pure helpers for email unread source-of-truth rules.
 * CRM conversations.unreadCount is authoritative; Gmail UNREAD is not mapped.
 */

/** Existing provider message must never bump conversation unread on re-sync. */
export function shouldBumpUnreadOnEmailPersist(input: {
  messageAlreadyExists: boolean;
  direction: "inbound" | "outbound";
}): boolean {
  if (input.messageAlreadyExists) return false;
  return input.direction === "inbound";
}

/** Next unread count when persisting a normalized email into an existing conversation. */
export function nextEmailConversationUnreadCount(input: {
  messageAlreadyExists: boolean;
  direction: "inbound" | "outbound";
  currentUnread: number;
}): number {
  if (!shouldBumpUnreadOnEmailPersist(input)) {
    return Math.max(0, input.currentUnread);
  }
  return Math.max(0, input.currentUnread) + 1;
}

/** After CRM mark-read, contact-level total is the sum of conversation unread. */
export function sumContactUnread(conversationUnreadCounts: number[]): number {
  return conversationUnreadCounts.reduce((sum, n) => sum + Math.max(0, n || 0), 0);
}

/**
 * Inbox row badge must use the primary/row conversation unread — never the
 * contact-wide sum (which made one thread look unread after siblings stayed unread).
 */
export function inboxRowUnreadBadgeCount(input: {
  primaryConversationUnread: number;
  contactUnreadTotal: number;
}): number {
  return Math.max(0, input.primaryConversationUnread || 0);
}

