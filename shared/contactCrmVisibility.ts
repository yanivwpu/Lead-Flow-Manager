import { webchatContactQualifiesForCrmListing } from "./webchatContactIdentity";

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
 *
 * Legacy source:"webchat" rows created before lifecycle metadata are classified
 * at query time: anonymous visitors stay out of CRM Contacts; identified or
 * two-of-three identity rows remain listed. No backfill delete.
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
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  customFields?: unknown;
}): boolean {
  if (isEmailInboxIdentitySource(contact.source)) return false;
  const details = contact.sourceDetails as
    | { inboxIdentity?: unknown; contactLifecycle?: unknown }
    | null
    | undefined;
  if (details && details.inboxIdentity === true) return false;
  if (details && details.contactLifecycle === CONTACT_LIFECYCLE_INBOX_ONLY) return false;
  if (details && details.contactLifecycle === CONTACT_LIFECYCLE_SAVED) return true;
  // Query-time derivation for pre-lifecycle Website Chat rows. Other sources stay listed.
  if (contact.source === "webchat") {
    return webchatContactQualifiesForCrmListing(contact);
  }
  return true;
}

export function filterCrmListedContacts<T extends { source?: string | null; sourceDetails?: unknown }>(
  rows: T[],
): T[] {
  return rows.filter(isCrmListedContact);
}

export type InboxConversationMenuAction =
  | "save_to_contacts"
  | "edit_contact"
  | "pause_automations"
  | "activity_timeline"
  | "delete_contact";

/**
 * Inbox conversation kebab visibility from server-backed CRM lifecycle.
 * Inbox-only identities cannot be enrolled in Contact automations (campaigns
 * already fail closed). Pause Automations is therefore hidden until promotion.
 * Delete Contact hard-deletes the participant row and FK-cascades Inbox
 * history, so it is not offered until the row is a saved Contact.
 * Activity Timeline stays: GET /api/contacts/:id/timeline is tenant-scoped
 * to this participant’s conversation/activity history.
 */
export function inboxConversationMenuActions(contact: {
  source?: string | null;
  sourceDetails?: unknown;
}): InboxConversationMenuAction[] {
  if (!isCrmListedContact(contact)) {
    return ["save_to_contacts", "activity_timeline"];
  }
  return ["edit_contact", "pause_automations", "activity_timeline", "delete_contact"];
}
