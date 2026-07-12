/**
 * Inbox selection isolation — prevents Contact A header + Contact B messages
 * (and vice versa) when switching to contact-only records with no conversation.
 */

export type InboxConversationLike = {
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
  primaryConversation: InboxConversationLike | null;
  activeConversationId: string | null;
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
      activeConversationId: null,
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
  const primaryConversation =
    (preferred
      ? conversations.find((c) => c.channel === preferred)
      : undefined) ||
    conversations[0] ||
    null;

  const activeConversationId = primaryConversation?.id ?? null;

  // Never render messages unless we have a conversation for the matched contact.
  const messages =
    contactMatchesSelection && activeConversationId
      ? ((input.messagesQueryData as TMsg[] | null | undefined) ?? [])
      : [];

  return {
    contactMatchesSelection,
    contact,
    displayContact,
    conversations,
    primaryConversation,
    activeConversationId,
    messages,
    hasConversation: !!activeConversationId,
  };
}

/** Whether a messages query may run for the current selection. */
export function shouldFetchInboxMessages(params: {
  selectedContactId: string | null | undefined;
  contactMatchesSelection: boolean;
  conversationId: string | null | undefined;
}): boolean {
  return (
    !!params.selectedContactId &&
    params.contactMatchesSelection &&
    !!params.conversationId
  );
}
