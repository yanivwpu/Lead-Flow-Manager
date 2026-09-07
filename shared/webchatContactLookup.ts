/**
 * Single Web Chat contact resolver contract.
 * Identity is the immutable visitor UUID (column + JSON mirrors), never canonical phone.
 */

import { isWebchatVisitorId } from "./agent/webchatLeadContext";

export const WEBCHAT_VISITOR_CUSTOM_FIELD = "webchatVisitorId";
export const WEBCHAT_VISITOR_SOURCE_FIELD = "webchatVisitorId";

export type WebchatLookupContact = {
  id: string;
  userId: string;
  phone?: string | null;
  webchatId?: string | null;
  source?: string | null;
  primaryChannel?: string | null;
  customFields?: unknown;
  sourceDetails?: unknown;
  createdAt?: string | Date | null;
};

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

export function readStoredWebchatVisitorId(contact: WebchatLookupContact): string | null {
  const column = typeof contact.webchatId === "string" ? contact.webchatId.trim() : "";
  if (column) return column;
  const cf = asRecord(contact.customFields)[WEBCHAT_VISITOR_CUSTOM_FIELD];
  if (typeof cf === "string" && cf.trim()) return cf.trim();
  const details = asRecord(contact.sourceDetails)[WEBCHAT_VISITOR_SOURCE_FIELD];
  if (typeof details === "string" && details.trim()) return details.trim();
  const phone = typeof contact.phone === "string" ? contact.phone.trim() : "";
  if (phone && isWebchatVisitorId(phone)) return phone;
  return null;
}

export function preserveWebchatVisitorIdentity(
  existing: Record<string, unknown> | null | undefined,
  visitorId: string,
): Record<string, unknown> {
  const customFields = { ...(existing || {}) };
  const token = (visitorId || "").trim();
  if (!token) return customFields;
  const current =
    typeof customFields[WEBCHAT_VISITOR_CUSTOM_FIELD] === "string"
      ? String(customFields[WEBCHAT_VISITOR_CUSTOM_FIELD]).trim()
      : "";
  customFields[WEBCHAT_VISITOR_CUSTOM_FIELD] = current || token;
  return customFields;
}

export function isWebchatSourcedLookupRow(contact: WebchatLookupContact): boolean {
  return (
    contact.source === "webchat" ||
    contact.primaryChannel === "webchat" ||
    Boolean(readStoredWebchatVisitorId(contact))
  );
}

/**
 * Tenant-scoped match. Never uses a real phone/email as the visitor key.
 * Legacy phone=UUID is allowed only while the phone value is still a visitor token.
 */
export function contactMatchesWebchatVisitor(
  contact: WebchatLookupContact,
  userId: string,
  visitorId: string,
): boolean {
  if (!userId || !visitorId || contact.userId !== userId) return false;
  if (contact.webchatId && contact.webchatId === visitorId) return true;
  const cf = asRecord(contact.customFields)[WEBCHAT_VISITOR_CUSTOM_FIELD];
  if (typeof cf === "string" && cf === visitorId) return true;
  const details = asRecord(contact.sourceDetails)[WEBCHAT_VISITOR_SOURCE_FIELD];
  if (typeof details === "string" && details === visitorId) return true;
  if (
    isWebchatVisitorId(visitorId) &&
    contact.phone === visitorId &&
    isWebchatVisitorId(contact.phone) &&
    isWebchatSourcedLookupRow(contact)
  ) {
    return true;
  }
  return false;
}

export function resolveWebchatContactFromRows<T extends WebchatLookupContact>(
  rows: T[],
  userId: string,
  visitorId: string,
): T | undefined {
  const matches = rows.filter((row) => contactMatchesWebchatVisitor(row, userId, visitorId));
  if (matches.length === 0) return undefined;
  return matches.sort((a, b) => {
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return at - bt;
  })[0];
}

export function mergeWebchatVisitorSourceDetails(
  existing: Record<string, unknown> | null | undefined,
  visitorId: string,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const details = { ...(existing || {}) };
  const token = (visitorId || "").trim();
  if (token) {
    const current =
      typeof details[WEBCHAT_VISITOR_SOURCE_FIELD] === "string"
        ? String(details[WEBCHAT_VISITOR_SOURCE_FIELD]).trim()
        : "";
    details[WEBCHAT_VISITOR_SOURCE_FIELD] = current || token;
  }
  return extra ? { ...details, ...extra } : details;
}
