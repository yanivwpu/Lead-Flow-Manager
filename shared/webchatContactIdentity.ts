/**
 * Web Chat visitor → identified contact lifecycle (staff-facing).
 * Identification comes from the native form, never from chat text.
 */

import {
  ANONYMOUS_WEBCHAT_VISITOR_NAMES,
  isAnonymousWebchatVisitorName,
  isWebchatVisitorId,
  normalizeWebchatPhone,
  resolveWebchatVisitorDisplayName,
  WEBSITE_VISITOR_NAME,
  type WebchatLeadSource,
} from "./agent/webchatLeadContext";
import { normalizeEmailAddress } from "./emailChannel";

export const WEBCHAT_IDENTITY_ANONYMOUS = "anonymous" as const;
export const WEBCHAT_IDENTITY_IDENTIFIED = "identified" as const;
export type WebchatIdentityStatus = typeof WEBCHAT_IDENTITY_ANONYMOUS | typeof WEBCHAT_IDENTITY_IDENTIFIED;

export const CRM_LIST_IDENTIFIED = "identified" as const;
export const CRM_LIST_WEBSITE_VISITORS = "website_visitors" as const;
export const CRM_LIST_ALL = "all" as const;
export type CrmContactListTab = typeof CRM_LIST_IDENTIFIED | typeof CRM_LIST_WEBSITE_VISITORS | typeof CRM_LIST_ALL;

const MESSAGE_DERIVED_NAME_RE =
  /^[A-Za-z][A-Za-z'.-]+(?:\s+[A-Za-z][A-Za-z'.-]+){0,2}$/;
const FILENAME_RE = /\.(jpe?g|png|gif|webp|heic|pdf|docx?|mp4|mov)$/i;
const CHAT_TOKEN_NAMES = new Set(
  [
    "hi",
    "hello",
    "hey",
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
    "photo",
    "image",
    "file",
  ].map((s) => s.toLowerCase()),
);

export type WebchatIdentityContact = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  primaryChannel?: string | null;
  lastIncomingChannel?: string | null;
  customFields?: unknown;
  sourceDetails?: unknown;
  createdAt?: string | Date | null;
  lastIncomingAt?: string | Date | null;
};

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

export function readWebchatCustomFields(contact: WebchatIdentityContact): Record<string, unknown> {
  return asRecord(contact.customFields);
}

export function readWebchatIdentityRecord(contact: WebchatIdentityContact): Record<string, unknown> {
  return asRecord(readWebchatCustomFields(contact).webchatIdentity);
}

export function readWebchatFormSnapshot(contact: WebchatIdentityContact): Record<string, unknown> | null {
  const snap = readWebchatCustomFields(contact).webchatForm;
  const rec = asRecord(snap);
  return Object.keys(rec).length ? rec : null;
}

export function isWebchatSourcedContact(contact: WebchatIdentityContact): boolean {
  if (contact.source === "webchat") return true;
  if (contact.primaryChannel === "webchat" || contact.lastIncomingChannel === "webchat") return true;
  const cf = readWebchatCustomFields(contact);
  return typeof cf.webchatVisitorId === "string" && cf.webchatVisitorId.length > 0;
}

export function storedWebchatIdentityStatus(
  contact: WebchatIdentityContact,
): WebchatIdentityStatus | null {
  const status = readWebchatIdentityRecord(contact).status;
  if (status === WEBCHAT_IDENTITY_IDENTIFIED || status === WEBCHAT_IDENTITY_ANONYMOUS) return status;
  return null;
}

export function looksLikeMessageDerivedWebchatName(name: string | null | undefined): boolean {
  const trimmed = (name || "").trim();
  if (!trimmed) return false;
  if (isAnonymousWebchatVisitorName(trimmed)) return false;
  if (CHAT_TOKEN_NAMES.has(trimmed.toLowerCase())) return true;
  if (FILENAME_RE.test(trimmed)) return true;
  if (trimmed.length <= 40 && MESSAGE_DERIVED_NAME_RE.test(trimmed) && trimmed.split(/\s+/).length <= 3) {
    return true;
  }
  return false;
}

/** Names that are still anonymous tokens after identification — not real personal names. */
export function isPlaceholderWebchatDisplayName(name: string | null | undefined): boolean {
  const trimmed = (name || "").trim();
  if (!trimmed) return true;
  if (isAnonymousWebchatVisitorName(trimmed)) return true;
  if (CHAT_TOKEN_NAMES.has(trimmed.toLowerCase())) return true;
  if (FILENAME_RE.test(trimmed)) return true;
  return false;
}

function formFieldValue(field: unknown): string {
  if (!field || typeof field !== "object") return "";
  const value = (field as { value?: unknown }).value;
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map((v) => String(v || "").trim()).filter(Boolean).join(", ");
  if (typeof value === "boolean") return value ? "true" : "";
  return "";
}

export function identityFromWebchatFormSnapshot(contact: WebchatIdentityContact): {
  name?: string;
  email?: string;
  phone?: string;
} {
  const snap = readWebchatFormSnapshot(contact);
  if (!snap) return {};
  const fields = Array.isArray(snap.fields) ? snap.fields : [];
  const out: { name?: string; email?: string; phone?: string } = {};
  for (const field of fields) {
    if (!field || typeof field !== "object") continue;
    const type = String((field as { type?: unknown }).type || "");
    const value = formFieldValue(field);
    if (!value) continue;
    if (type === "name" && !out.name) out.name = value;
    if (type === "email" && !out.email) {
      const email = normalizeEmailAddress(value);
      if (email) out.email = email;
    }
    if (type === "phone" && !out.phone) {
      const phone = normalizeWebchatPhone(value);
      if (phone) out.phone = phone;
    }
  }
  return out;
}

export function webchatFormIdentifiedContact(contact: WebchatIdentityContact): boolean {
  if (storedWebchatIdentityStatus(contact) === WEBCHAT_IDENTITY_IDENTIFIED) return true;
  const fromForm = identityFromWebchatFormSnapshot(contact);
  const name = fromForm.name || "";
  const email = fromForm.email || normalizeEmailAddress(contact.email) || "";
  const phone = fromForm.phone || "";
  const count = Number(Boolean(name)) + Number(Boolean(email)) + Number(Boolean(phone));
  return count >= 2 && Boolean(email || phone);
}

export function isAnonymousWebsiteVisitor(contact: WebchatIdentityContact): boolean {
  if (!isWebchatSourcedContact(contact)) return false;
  if (webchatFormIdentifiedContact(contact)) return false;
  if (storedWebchatIdentityStatus(contact) === WEBCHAT_IDENTITY_IDENTIFIED) return false;
  return true;
}

export function classifyCrmContactListTab(contact: WebchatIdentityContact): typeof CRM_LIST_IDENTIFIED | typeof CRM_LIST_WEBSITE_VISITORS {
  return isAnonymousWebsiteVisitor(contact) ? CRM_LIST_WEBSITE_VISITORS : CRM_LIST_IDENTIFIED;
}

export function webchatLeadSourceLabel(contact: WebchatIdentityContact): string {
  const cf = readWebchatCustomFields(contact);
  const details = asRecord(contact.sourceDetails);
  const lead = String(cf.leadSource || details.leadSource || "");
  if (/embedded agent page/i.test(lead)) return "Embedded Agent Page";
  if (/agent page/i.test(lead)) return "Agent Page";
  if (cf.sourcePage === "agent_page_embed") return "Embedded Agent Page";
  if (cf.sourcePage === "agent_page") return "Agent Page";
  return "Website Chat";
}

export function webchatSafeDisplayName(contact: WebchatIdentityContact): string {
  if (isAnonymousWebsiteVisitor(contact)) {
    const cf = readWebchatCustomFields(contact);
    const page = String(cf.sourcePage || "");
    const source: WebchatLeadSource | undefined =
      page === "agent_page_embed" ? "agent_page_embed" : page === "agent_page" ? "agent_page" : undefined;
    return resolveWebchatVisitorDisplayName(source);
  }
  if (webchatFormIdentifiedContact(contact)) {
    const fromForm = identityFromWebchatFormSnapshot(contact);
    const stored = (contact.name || "").trim();
    if (stored && !isAnonymousWebchatVisitorName(stored) && !looksLikeMessageDerivedWebchatName(stored)) {
      return stored;
    }
    if (fromForm.name) return fromForm.name;
  }
  const stored = (contact.name || "").trim();
  if (stored && !looksLikeMessageDerivedWebchatName(stored) && !isAnonymousWebchatVisitorName(stored)) {
    return stored;
  }
  return stored || WEBSITE_VISITOR_NAME;
}

export function webchatPublicPhone(contact: WebchatIdentityContact): string | null {
  const phone = (contact.phone || "").trim();
  if (!phone || isWebchatVisitorId(phone)) return null;
  return phone;
}

export function contactMatchesCrmSearch(contact: WebchatIdentityContact, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const display = webchatSafeDisplayName(contact).toLowerCase();
  const form = identityFromWebchatFormSnapshot(contact);
  const email = (contact.email || form.email || "").toLowerCase();
  const phone = (webchatPublicPhone(contact) || form.phone || "").toLowerCase();
  const storedName = (contact.name || "").toLowerCase();
  return display.includes(q) || storedName.includes(q) || email.includes(q) || phone.includes(q);
}

export function isIdentifiedFromWebsiteChat(contact: WebchatIdentityContact): boolean {
  return isWebchatSourcedContact(contact) && webchatFormIdentifiedContact(contact);
}

export function stampAnonymousWebchatIdentity(
  existing?: Record<string, unknown> | null,
  visitorId?: string,
  leadSource?: WebchatLeadSource,
): Record<string, unknown> {
  const customFields: Record<string, unknown> = { ...(existing || {}) };
  if (visitorId) customFields.webchatVisitorId = visitorId;
  if (leadSource === "agent_page_embed") {
    customFields.sourcePage = "agent_page_embed";
    customFields.leadSource = "Embedded Agent Page";
  } else if (leadSource === "agent_page") {
    customFields.sourcePage = "agent_page";
    customFields.leadSource = "Agent Page";
  }
  const prior = asRecord(customFields.webchatIdentity);
  if (prior.status !== WEBCHAT_IDENTITY_IDENTIFIED) {
    customFields.webchatIdentity = {
      ...prior,
      status: WEBCHAT_IDENTITY_ANONYMOUS,
    };
  }
  return customFields;
}

export function stampIdentifiedWebchatIdentity(
  existing: Record<string, unknown> | null | undefined,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  const customFields: Record<string, unknown> = { ...(existing || {}) };
  const prior = asRecord(customFields.webchatIdentity);
  customFields.webchatIdentity = {
    ...prior,
    status: WEBCHAT_IDENTITY_IDENTIFIED,
    identifiedFrom: "webchat_form",
    ...extra,
  };
  return customFields;
}

export type WebchatContactPreflightBucket =
  | "message_derived_webchat_names"
  | "anonymous_website_visitors"
  | "form_submitted_canonical_stale"
  | "possible_duplicate_email"
  | "possible_duplicate_phone"
  | "identified_webchat"
  | "non_webchat_unchanged";

export type WebchatContactPreflightInput = WebchatIdentityContact & {
  id?: string;
  userId?: string;
  webchatId?: string | null;
};

function canonicalStaleAfterForm(contact: WebchatIdentityContact): boolean {
  const fromForm = identityFromWebchatFormSnapshot(contact);
  if (!fromForm.name && !fromForm.email && !fromForm.phone) return false;
  if (fromForm.name) {
    const stored = (contact.name || "").trim();
    if (stored !== fromForm.name && (isAnonymousWebchatVisitorName(stored) || isPlaceholderWebchatDisplayName(stored) || looksLikeMessageDerivedWebchatName(stored))) {
      return true;
    }
  }
  if (fromForm.email && normalizeEmailAddress(contact.email) !== fromForm.email) return true;
  if (fromForm.phone) {
    const current = isWebchatVisitorId(contact.phone) ? "" : normalizeWebchatPhone(contact.phone || "");
    if (current !== fromForm.phone) return true;
  }
  return false;
}

/**
 * Read-only classifier. Callers must return aggregate counts only — never names, emails, phones, or IDs.
 */
export function classifyWebchatContactPreflight(
  contact: WebchatContactPreflightInput,
): WebchatContactPreflightBucket {
  if (!isWebchatSourcedContact(contact)) return "non_webchat_unchanged";
  if (canonicalStaleAfterForm(contact)) return "form_submitted_canonical_stale";
  if (webchatFormIdentifiedContact(contact)) return "identified_webchat";
  if (looksLikeMessageDerivedWebchatName(contact.name)) return "message_derived_webchat_names";
  if (isAnonymousWebchatVisitorName(contact.name) || !(contact.name || "").trim()) {
    return "anonymous_website_visitors";
  }
  return "anonymous_website_visitors";
}

export function aggregateWebchatContactPreflight(
  rows: WebchatContactPreflightInput[],
): Record<WebchatContactPreflightBucket, number> & {
  webchatTotal: number;
  possibleDuplicateEmailPairs: number;
  possibleDuplicatePhonePairs: number;
  duplicateWebchatVisitorPairs: number;
} {
  const counts: Record<WebchatContactPreflightBucket, number> = {
    message_derived_webchat_names: 0,
    anonymous_website_visitors: 0,
    form_submitted_canonical_stale: 0,
    possible_duplicate_email: 0,
    possible_duplicate_phone: 0,
    identified_webchat: 0,
    non_webchat_unchanged: 0,
  };
  for (const row of rows) {
    counts[classifyWebchatContactPreflight(row)] += 1;
  }
  const emailIndex = new Map<string, { n: number; webchat: boolean }>();
  const phoneIndex = new Map<string, { n: number; webchat: boolean }>();
  for (const row of rows) {
    if (!row.userId) continue;
    const email = normalizeEmailAddress(row.email);
    if (email) {
      const key = `${row.userId}\n${email}`;
      const cur = emailIndex.get(key) || { n: 0, webchat: false };
      cur.n += 1;
      if (isWebchatSourcedContact(row)) cur.webchat = true;
      emailIndex.set(key, cur);
    }
    const phone = webchatPublicPhone(row);
    if (phone) {
      const key = `${row.userId}\n${phone}`;
      const cur = phoneIndex.get(key) || { n: 0, webchat: false };
      cur.n += 1;
      if (isWebchatSourcedContact(row)) cur.webchat = true;
      phoneIndex.set(key, cur);
    }
  }
  let possibleDuplicateEmailPairs = 0;
  let possibleDuplicatePhonePairs = 0;
  for (const { n, webchat } of emailIndex.values()) {
    if (n > 1 && webchat) possibleDuplicateEmailPairs += 1;
  }
  for (const { n, webchat } of phoneIndex.values()) {
    if (n > 1 && webchat) possibleDuplicatePhonePairs += 1;
  }
  counts.possible_duplicate_email = possibleDuplicateEmailPairs;
  counts.possible_duplicate_phone = possibleDuplicatePhonePairs;
  const visitorIndex = new Map<string, number>();
  for (const row of rows) {
    if (!row.userId) continue;
    const column = typeof row.webchatId === "string" ? row.webchatId.trim() : "";
    const cf = asRecord(row.customFields).webchatVisitorId;
    const fromCf = typeof cf === "string" ? cf.trim() : "";
    const visitorKey = column || fromCf;
    if (!visitorKey) continue;
    const key = `${row.userId}\n${visitorKey}`;
    visitorIndex.set(key, (visitorIndex.get(key) || 0) + 1);
  }
  let duplicateWebchatVisitorPairs = 0;
  for (const n of visitorIndex.values()) {
    if (n > 1) duplicateWebchatVisitorPairs += 1;
  }
  return {
    ...counts,
    webchatTotal: rows.filter((r) => isWebchatSourcedContact(r)).length,
    possibleDuplicateEmailPairs,
    possibleDuplicatePhonePairs,
    duplicateWebchatVisitorPairs,
  };
}

export { ANONYMOUS_WEBCHAT_VISITOR_NAMES, WEBSITE_VISITOR_NAME };
