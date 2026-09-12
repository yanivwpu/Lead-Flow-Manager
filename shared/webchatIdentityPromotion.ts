/**
 * Anonymous Website Chat visitor → CRM contact promotion.
 * Stay out of the Contacts list until two of {name, email, phone} are validated.
 */

import { normalizeEmailAddress } from "./emailChannel";
import { isAnonymousWebchatVisitorName, isWebchatVisitorId, normalizeWebchatPhone } from "./agent/webchatLeadContext";
import {
  CONTACT_LIFECYCLE_INBOX_ONLY,
  inboxOnlySourceDetails,
  isCrmListedContact,
  savedContactSourceDetails,
} from "./contactCrmVisibility";
import { isPlaceholderWebchatDisplayName, WEBCHAT_IDENTITY_IDENTIFIED } from "./webchatContactIdentity";
import { isVerifiedContactEmail, isVerifiedContactPhone, normalizeChatbotEmail } from "./chatbotAskQuestion";

export type IdentityField = "name" | "email" | "phone";

export type ValidatedWebchatIdentity = {
  name?: string;
  email?: string;
  phone?: string;
};

const BUTTON_AND_INTENT_LABELS = new Set(
  [
    "features & pricing",
    "features and pricing",
    "find my solution",
    "book a demo",
    "book demo",
    "pricing",
    "features",
  ].map((s) => s.toLowerCase()),
);

const GREETING_NAMES = new Set(
  [
    "hi",
    "hello",
    "hey",
    "hola",
    "shalom",
    "ahlan",
    "thanks",
    "thank you",
    "ok",
    "okay",
    "yes",
    "no",
    "please",
    "help",
    "got it",
    "sure",
    "yo",
    "sup",
    "good morning",
    "good afternoon",
    "good evening",
    "website visitor",
    "agent page visitor",
    "embedded agent page visitor",
  ].map((s) => s.toLowerCase()),
);

export function isValidIdentityName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim().replace(/\s+/g, " ");
  if (text.length < 2 || text.length > 80) return null;
  if (GREETING_NAMES.has(text.toLowerCase())) return null;
  if (BUTTON_AND_INTENT_LABELS.has(text.toLowerCase())) return null;
  if (isAnonymousWebchatVisitorName(text) || isPlaceholderWebchatDisplayName(text)) return null;
  if (isWebchatVisitorId(text)) return null;
  if (/@/.test(text) || /^\+?[0-9][0-9\s().-]{6,}$/.test(text)) return null;
  if (!/[\p{L}]/u.test(text)) return null;
  if (/^(hi|hello|hey|hola)[\s!?.]*$/i.test(text)) return null;
  return text.slice(0, 80);
}

export function isValidIdentityEmail(raw: unknown): string | null {
  if (!isVerifiedContactEmail(raw)) return null;
  return normalizeChatbotEmail(String(raw)) || normalizeEmailAddress(String(raw));
}

export function isValidIdentityPhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (isWebchatVisitorId(raw)) return null;
  const trimmed = raw.trim();
  if (!isVerifiedContactPhone(trimmed)) return null;
  const normalized = normalizeWebchatPhone(trimmed);
  return normalized || trimmed.replace(/\s+/g, " ").trim();
}

export function collectValidatedIdentity(input: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}): ValidatedWebchatIdentity {
  const out: ValidatedWebchatIdentity = {};
  const name = isValidIdentityName(input.name);
  const email = isValidIdentityEmail(input.email);
  const phone = isValidIdentityPhone(input.phone);
  if (name) out.name = name;
  if (email) out.email = email;
  if (phone) out.phone = phone;
  return out;
}

export function identityFieldCount(identity: ValidatedWebchatIdentity): number {
  return Number(Boolean(identity.name)) + Number(Boolean(identity.email)) + Number(Boolean(identity.phone));
}

/** Two of three, and at least one reachable method (email or phone). */
export function meetsWebchatPromotionThreshold(identity: ValidatedWebchatIdentity): boolean {
  if (identityFieldCount(identity) < 2) return false;
  return Boolean(identity.email || identity.phone);
}

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
}): boolean {
  if (isCrmListedContact(contact)) return false;
  const details = contact.sourceDetails as { contactLifecycle?: unknown } | null | undefined;
  return details?.contactLifecycle === CONTACT_LIFECYCLE_INBOX_ONLY;
}

export { isCrmListedContact };
