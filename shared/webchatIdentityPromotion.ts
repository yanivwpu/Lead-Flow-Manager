/**
 * Anonymous Website Chat visitor → CRM contact promotion.
 * Stay out of the Contacts list until two of {name, email, phone} are validated.
 */

import {
  CONTACT_LIFECYCLE_INBOX_ONLY,
  contactLifecycleFromDetails,
  inboxOnlySourceDetails,
  isCrmListedContact,
  savedContactSourceDetails,
} from "./contactCrmVisibility";
import {
  identityFromWebchatFormSnapshot,
  storedWebchatIdentityStatus,
  webchatFormIdentifiedContact,
  webchatPublicPhone,
  WEBCHAT_IDENTITY_IDENTIFIED,
} from "./webchatContactIdentity";
import {
  collectValidatedIdentity,
  identityFieldCount,
  isValidIdentityEmail,
  isValidIdentityName,
  isValidIdentityPhone,
  meetsWebchatPromotionThreshold,
  type IdentityField,
  type ValidatedWebchatIdentity,
} from "./webchatIdentityFields";

export type { IdentityField, ValidatedWebchatIdentity };
export {
  collectValidatedIdentity,
  identityFieldCount,
  isValidIdentityEmail,
  isValidIdentityName,
  isValidIdentityPhone,
  meetsWebchatPromotionThreshold,
};

export function acceptExtractedIdentity(
  hints: { name?: string; email?: string; phone?: string },
  opts?: { minConfidence?: number; confidence?: number },
): ValidatedWebchatIdentity {
  const min = opts?.minConfidence ?? 0.75;
  if (typeof opts?.confidence === "number" && opts.confidence < min) return {};
  return collectValidatedIdentity(hints);
}

export type IdentityConflict = {
  reason: "email_phone_mismatch";
  emailContactId?: string;
  phoneContactId?: string;
};

export function resolveIdentityContactConflict(params: {
  visitorContactId: string;
  emailMatches: Array<{ id: string }>;
  phoneMatches: Array<{ id: string }>;
}): IdentityConflict | null {
  const emailOther = params.emailMatches.filter((r) => r.id !== params.visitorContactId);
  const phoneOther = params.phoneMatches.filter((r) => r.id !== params.visitorContactId);
  if (emailOther.length === 1 && phoneOther.length === 1 && emailOther[0].id !== phoneOther[0].id) {
    return {
      reason: "email_phone_mismatch",
      emailContactId: emailOther[0].id,
      phoneContactId: phoneOther[0].id,
    };
  }
  return null;
}

export function shouldPromoteWebchatVisitor(params: {
  identity: ValidatedWebchatIdentity;
  alreadyListed: boolean;
  conflict: IdentityConflict | null;
}): boolean {
  if (params.alreadyListed) return false;
  if (params.conflict) return false;
  return meetsWebchatPromotionThreshold(params.identity);
}

export function inboxOnlyWebchatSourceDetails(extra?: Record<string, unknown>): Record<string, unknown> {
  return inboxOnlySourceDetails({
    webchatIdentityStatus: "anonymous",
    ...(extra || {}),
  });
}

export function promotedWebchatSourceDetails(
  prev?: unknown,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return savedContactSourceDetails(prev, {
    promotedFromInboxIdentity: true,
    webchatIdentityStatus: "identified",
    ...(extra || {}),
  });
}

export function stampPromotedWebchatIdentity(
  existing: Record<string, unknown> | null | undefined,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const customFields = { ...(existing || {}) };
  const prior =
    customFields.webchatIdentity && typeof customFields.webchatIdentity === "object"
      ? { ...(customFields.webchatIdentity as Record<string, unknown>) }
      : {};
  customFields.webchatIdentity = {
    ...prior,
    status: WEBCHAT_IDENTITY_IDENTIFIED,
    identifiedFrom: extra?.identifiedFrom || "identity_threshold",
    identifiedAt: extra?.identifiedAt || new Date().toISOString(),
    ...extra,
  };
  return customFields;
}

export function mergeIdentityWithoutDowngrade(params: {
  current: { name?: string | null; email?: string | null; phone?: string | null };
  incoming: ValidatedWebchatIdentity;
}): ValidatedWebchatIdentity {
  const current = collectValidatedIdentity(params.current);
  return {
    name: params.incoming.name || current.name,
    email: params.incoming.email || current.email,
    phone: params.incoming.phone || current.phone,
  };
}

export function isInboxOnlyWebchatContact(contact: {
  source?: string | null;
  sourceDetails?: unknown;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  customFields?: unknown;
}): boolean {
  if (isCrmListedContact(contact)) return false;
  const details = contact.sourceDetails as { contactLifecycle?: unknown } | null | undefined;
  return details?.contactLifecycle === CONTACT_LIFECYCLE_INBOX_ONLY || contact.source === "webchat";
}

/**
 * Lazy stamp only: write inbox_only onto a pre-lifecycle anonymous Web Chat row
 * the next time it is touched. Never deletes the row or its conversations.
 */
export function lazyInboxOnlyDetailsForLegacyWebchat(contact: {
  source?: string | null;
  sourceDetails?: unknown;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  customFields?: unknown;
}): Record<string, unknown> | null {
  if (contact.source !== "webchat") return null;
  if (contactLifecycleFromDetails(contact.sourceDetails) !== null) return null;
  if (webchatFormIdentifiedContact(contact) || storedWebchatIdentityStatus(contact) === WEBCHAT_IDENTITY_IDENTIFIED) {
    return null;
  }
  const fromForm = identityFromWebchatFormSnapshot(contact);
  const identity = collectValidatedIdentity({
    name: contact.name || fromForm.name,
    email: contact.email || fromForm.email,
    phone: webchatPublicPhone(contact) || fromForm.phone,
  });
  if (meetsWebchatPromotionThreshold(identity)) return null;
  const prev =
    contact.sourceDetails && typeof contact.sourceDetails === "object" && !Array.isArray(contact.sourceDetails)
      ? (contact.sourceDetails as Record<string, unknown>)
      : {};
  return inboxOnlyWebchatSourceDetails(prev);
}

export { isCrmListedContact };
