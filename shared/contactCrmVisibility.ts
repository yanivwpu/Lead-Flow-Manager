/**
 * CRM Contacts vs Inbox-only email identities.
 *
 * Unified Inbox conversations require a contactId (NOT NULL).
 * Passive Gmail still needs a sender identity for threading, but that
 * row must not appear on the Contacts page until the user saves it.
 *
 * Lifecycle is stored on sourceDetails.contactLifecycle (no schema migration):
 * - inbox_only — usable in Inbox, hidden from Contacts
 * - saved — intentionally visible in Contacts
 * Website Chat anonymous/identified states stay on customFields.webchatIdentity.
 */
export const EMAIL_INBOX_IDENTITY_SOURCE = "email_inbox";
export const CONTACT_LIFECYCLE_INBOX_ONLY = "inbox_only";
export const CONTACT_LIFECYCLE_SAVED = "saved";

export type ContactLifecycleState =
  | typeof CONTACT_LIFECYCLE_INBOX_ONLY
  | typeof CONTACT_LIFECYCLE_SAVED;

/** Pass to storage.getContacts / searchContacts when matching identities (avoid duplicates). */
export type GetContactsOptions = {
  includeInboxIdentities?: boolean;
};

export const INCLUDE_INBOX_IDENTITIES: GetContactsOptions = { includeInboxIdentities: true };

export function isEmailInboxIdentitySource(source: string | null | undefined): boolean {
  return String(source || "") === EMAIL_INBOX_IDENTITY_SOURCE;
}

export function contactLifecycleFromDetails(sourceDetails: unknown): ContactLifecycleState | null {
  const details = sourceDetails as { contactLifecycle?: unknown } | null | undefined;
  const raw = details?.contactLifecycle;
  if (raw === CONTACT_LIFECYCLE_INBOX_ONLY || raw === CONTACT_LIFECYCLE_SAVED) return raw;
  return null;
}

export function inboxOnlySourceDetails(extra?: Record<string, unknown>): Record<string, unknown> {
  return {
    ...(extra || {}),
    inboxIdentity: true,
    contactLifecycle: CONTACT_LIFECYCLE_INBOX_ONLY,
  };
}

export function savedContactSourceDetails(
  prev?: unknown,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const base =
    prev && typeof prev === "object" && !Array.isArray(prev)
      ? { ...(prev as Record<string, unknown>) }
      : {};
  return {
    ...base,
    ...(extra || {}),
    inboxIdentity: false,
    contactLifecycle: CONTACT_LIFECYCLE_SAVED,
  };
}

export function isCrmListedContact(contact: {
  source?: string | null;
  sourceDetails?: unknown;
}): boolean {
  if (isEmailInboxIdentitySource(contact.source)) return false;
  const details = contact.sourceDetails as
    | { inboxIdentity?: unknown; contactLifecycle?: unknown }
    | null
    | undefined;
  if (details && details.inboxIdentity === true) return false;
  if (details && details.contactLifecycle === CONTACT_LIFECYCLE_INBOX_ONLY) return false;
  return true;
}

export function filterCrmListedContacts<T extends { source?: string | null; sourceDetails?: unknown }>(
  rows: T[],
): T[] {
  return rows.filter(isCrmListedContact);
}
