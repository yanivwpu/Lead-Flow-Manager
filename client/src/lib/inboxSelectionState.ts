/**
 * Inbox selection isolation — prevents Contact A header + Contact B messages
 * (and vice versa) when switching to contact-only records with no conversation.
 *
 * Native Email: multiple sibling threads share channel "email". Primary is the
 * newest by lastMessageAt (not Array.find(channel)).
 */

import {
  resolveContactCenterConversation,
  type ConversationForPrimaryPick,
} from "@shared/inboxPrimaryConversation";

export type InboxConversationLike = ConversationForPrimaryPick & {
  id: string;
  channel?: string | null;
  channelAccountId?: string | null;
};

export type InboxContactDataLike = {
  contact: { id: string };
  conversations?: InboxConversationLike[] | null;
};

export type ResolveInboxSelectionInput = {
  selectedContactId: string | null | undefined;
  /** Raw React Query result for GET /api/contacts/:id (may be keepPreviousData). */
  contactQueryData: InboxContactDataLike | null | undefined;
  /** Preferred channel for picking among conversations. */
  preferredChannel?: string | null;
  /** Raw messages query data (may be keepPreviousData from a prior conversation). */
  messagesQueryData: unknown[] | null | undefined;
  /** Fallback contact from inbox list while detail query loads. */
  inboxListContact?: { id: string } | null;
  /**
   * Authoritative primary conversation from GET /api/inbox for this contact / row.
   */
  inboxRowConversation?: InboxConversationLike | null;
  /**
   * Explicit conversation from URL (`?conversation=`) — opens that exact email thread.
   */
  selectedConversationId?: string | null;
  /**
   * While reading an older sibling without URL identity, keep center on this id.
   */
  stickyConversationId?: string | null;
};

export type ResolvedInboxSelection<TMsg = unknown> = {
  /** True when contactQueryData.contact.id === selectedContactId. */
  contactMatchesSelection: boolean;
  /** Contact from detail query only when ids match. */
  contact: InboxContactDataLike["contact"] | null;
  /**
   * Contact for header/CRM panel: matched detail contact, else inbox list row
   * for the selected id (never a mismatched previous contact).
   */
  displayContact: { id: string } | null;
  conversations: InboxConversationLike[];
  /** Conversation the center panel / composer / messages use. */
  primaryConversation: InboxConversationLike | null;
  /** Newest conversation by lastMessageAt (row-aligned); may differ when sticky. */
  newestPrimaryConversation: InboxConversationLike | null;
  activeConversationId: string | null;
  usedStickyConversation: boolean;
  /** Messages safe to render for the current selection (never previous contact). */
  messages: TMsg[];
  hasConversation: boolean;
};

/**
 * Resolve which contact/conversation/messages are safe to render for the
 * currently selected inbox contact. Callers must not pass previous-contact
 * placeholders into the UI without going through this.
 */
export function resolveInboxSelectionState<TMsg = unknown>(
  input: ResolveInboxSelectionInput,
): ResolvedInboxSelection<TMsg> {
  const selectedContactId = input.selectedContactId?.trim() || null;

  if (!selectedContactId) {
    return {
      contactMatchesSelection: false,
      contact: null,
      displayContact: null,
      conversations: [],
      primaryConversation: null,
      newestPrimaryConversation: null,
      activeConversationId: null,
      usedStickyConversation: false,
      messages: [],
      hasConversation: false,
    };
  }

  const contactMatchesSelection = input.contactQueryData?.contact?.id === selectedContactId;
  const contact = contactMatchesSelection ? input.contactQueryData!.contact : null;

  const inboxListContact =
    input.inboxListContact?.id === selectedContactId ? input.inboxListContact : null;
  const displayContact = contact ?? inboxListContact;

  const conversations =
    contactMatchesSelection && Array.isArray(input.contactQueryData?.conversations)
      ? (input.contactQueryData!.conversations as InboxConversationLike[])
      : [];

  const preferred = input.preferredChannel?.trim() || null;
  const inboxRow =
    input.inboxRowConversation && typeof input.inboxRowConversation.id === "string"
      ? input.inboxRowConversation
      : null;

  const explicitId = input.selectedConversationId?.trim() || null;
  const explicitConversation =
    (explicitId ? conversations.find((c) => c.id === explicitId) : null) ||
    (explicitId && inboxRow?.id === explicitId ? inboxRow : null) ||
    null;

  const resolved = resolveContactCenterConversation({
    conversations,
    preferredChannel: preferred,
    stickyConversationId: explicitConversation ? null : input.stickyConversationId,
    inboxRowConversation: inboxRow,
  });

  const primaryConversation = explicitConversation || resolved.centerConversation;
  const activeConversationId = primaryConversation?.id ?? null;
  const usedStickyConversation = Boolean(explicitConversation)
    ? false
    : resolved.usedSticky;

  // Never render messages unless we have a conversation for the matched contact
  // — or an inbox-row conversation we can open before contact detail catches up.
  const messagesAllowed =
    !!activeConversationId && (contactMatchesSelection || !!inboxListContact);

  const messages = messagesAllowed
    ? ((input.messagesQueryData as TMsg[] | null | undefined) ?? [])
    : [];

  return {
    contactMatchesSelection,
    contact,
    displayContact,
    conversations,
    primaryConversation,
    newestPrimaryConversation: resolved.newestPrimary,
    activeConversationId,
    usedStickyConversation,
    messages,
    hasConversation: !!activeConversationId,
  };
}

/** Whether a messages query may run for the current selection. */
export function shouldFetchInboxMessages(params: {
  selectedContactId: string | null | undefined;
  contactMatchesSelection: boolean;
  conversationId: string | null | undefined;
  /** Allow fetch from inbox-row conversation before contact detail matches. */
  allowInboxRowFallback?: boolean;
}): boolean {
  return (
    !!params.selectedContactId &&
    (!!params.contactMatchesSelection || !!params.allowInboxRowFallback) &&
    !!params.conversationId
  );
}
