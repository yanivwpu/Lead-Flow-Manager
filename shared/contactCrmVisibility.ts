/**
 * CRM Contacts vs Inbox-only email identities.
 *
 * Unified Inbox conversations require a contactId (NOT NULL).
 * Passive/system Email still needs a sender identity for threading, but that
 * row must not appear on the Contacts page as a lead.
 */
export const EMAIL_INBOX_IDENTITY_SOURCE = "email_inbox";

/** Pass to storage.getContacts / searchContacts when matching identities (avoid duplicates). */
export type GetContactsOptions = {
  includeInboxIdentities?: boolean;
};

export const INCLUDE_INBOX_IDENTITIES: GetContactsOptions = { includeInboxIdentities: true };

export function isEmailInboxIdentitySource(source: string | null | undefined): boolean {
  return String(source || "") === EMAIL_INBOX_IDENTITY_SOURCE;
}

export function isCrmListedContact(contact: {
  source?: string | null;
  sourceDetails?: unknown;
}): boolean {
  if (isEmailInboxIdentitySource(contact.source)) return false;
  const details = contact.sourceDetails as { inboxIdentity?: unknown } | null | undefined;
  if (details && details.inboxIdentity === true) return false;
  return true;
}

export function filterCrmListedContacts<T extends { source?: string | null; sourceDetails?: unknown }>(
  rows: T[],
): T[] {
  return rows.filter(isCrmListedContact);
}
