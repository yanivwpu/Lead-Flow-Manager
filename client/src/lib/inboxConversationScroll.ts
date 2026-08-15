/**
 * Channel-aware Inbox conversation viewport policy.
 * Email document: open at top, never pin to newest/bottom.
 * Chat bubbles: keep existing newest-message / bottom pin.
 */

import { resolveConversationLayoutMode } from "./inboxConversationPresentation";

export type InboxScrollMode = "email-document-top" | "chat-pin-bottom";

export function resolveInboxScrollMode(
  channel: string | null | undefined,
): InboxScrollMode {
  return resolveConversationLayoutMode(channel) === "email-document"
    ? "email-document-top"
    : "chat-pin-bottom";
}

/** Stable key for initial viewport: contact + selected/active conversation. */
export function inboxThreadScrollKey(params: {
  contactId: string | null | undefined;
  conversationId: string | null | undefined;
}): string {
  return `${String(params.contactId || "")}::${String(params.conversationId || "")}`;
}

export function inboxOpenScrollAction(mode: InboxScrollMode): "top" | "bottom" {
  return mode === "email-document-top" ? "top" : "bottom";
}

export function inboxShouldPinOnOpen(mode: InboxScrollMode): boolean {
  return mode === "chat-pin-bottom";
}

/** Chat: re-pin on inner resize when pinned/just-sent. Email: never. */
export function inboxShouldFollowResizeToBottom(
  mode: InboxScrollMode,
  opts: { shouldPin: boolean; justSent: boolean },
): boolean {
  if (mode === "email-document-top") return false;
  return opts.shouldPin || opts.justSent;
}

/** Chat: auto-scroll new/tail messages when pinned. Email: never. */
export function inboxShouldFollowNewMessagesToBottom(
  mode: InboxScrollMode,
  opts: { shouldPin: boolean; justSent: boolean },
): boolean {
  if (mode === "email-document-top") return false;
  return opts.shouldPin || opts.justSent;
}

export function inboxShouldTrackNearBottomPin(mode: InboxScrollMode): boolean {
  return mode === "chat-pin-bottom";
}
