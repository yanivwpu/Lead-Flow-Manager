/** Anonymous webchat visitor display names stored on CRM contacts. */
export const WEBSITE_VISITOR_NAME = "Website Visitor";
export const AGENT_PAGE_VISITOR_NAME = "Agent Page Visitor";

export const ANONYMOUS_WEBCHAT_VISITOR_NAMES = [
  WEBSITE_VISITOR_NAME,
  AGENT_PAGE_VISITOR_NAME,
  EMBEDDED_AGENT_PAGE_VISITOR_NAME,
] as const;

export type WebchatLeadSource = "agent_page" | "agent_page_embed" | "website";

const EMBEDDED_AGENT_PAGE_VISITOR_NAME = "Embedded Agent Page Visitor";

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_RE =
  /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b|\b\d{10,11}\b/;
const NAME_RE =
  /(?:^|\b)(?:i['']?m|i am|my name is|this is|call me)\s+([A-Za-z][A-Za-z'.-]+(?:\s+[A-Za-z][A-Za-z'.-]+){0,2})/i;

export function isAnonymousWebchatVisitorName(name: string | null | undefined): boolean {
  const trimmed = (name || "").trim();
  if (!trimmed) return true;
  return (ANONYMOUS_WEBCHAT_VISITOR_NAMES as readonly string[]).includes(trimmed);
}

export function isWebchatVisitorId(value: string | null | undefined): boolean {
  if (!value) return false;
  return (
    value.startsWith("visitor_") ||
    value.startsWith("agent_page_") ||
    value.startsWith("wchat_")
  );
}

export function normalizeWebchatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.length >= 10 ? digits : "";
}

export function extractIdentityHints(text: string): {
  email?: string;
  phone?: string;
  name?: string;
} {
  const trimmed = (text || "").trim();
  if (!trimmed) return {};

  const hints: { email?: string; phone?: string; name?: string } = {};
  const emailMatch = trimmed.match(EMAIL_RE);
  if (emailMatch) hints.email = emailMatch[0].trim().toLowerCase();

  const phoneMatch = trimmed.match(PHONE_RE);
  if (phoneMatch) {
    const normalized = normalizeWebchatPhone(phoneMatch[0]);
    if (normalized) hints.phone = normalized;
  }

  const nameMatch = trimmed.match(NAME_RE);
  if (nameMatch?.[1]) {
    hints.name = nameMatch[1].trim();
  } else if (
    !hints.email &&
    !hints.phone &&
    trimmed.length <= 40 &&
    /^[A-Za-z][A-Za-z'.-]+(?:\s+[A-Za-z][A-Za-z'.-]+){0,2}$/.test(trimmed)
  ) {
    hints.name = trimmed;
  }

  return hints;
}

export function contactNeedsWebchatIdentity(contact: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}): boolean {
  const hasEmail = Boolean(contact.email?.trim().includes("@"));
  const hasPhone =
    Boolean(contact.phone?.trim()) && !isWebchatVisitorId(contact.phone);
  const hasName = Boolean(contact.name?.trim()) && !isAnonymousWebchatVisitorName(contact.name);
  return !hasName || (!hasEmail && !hasPhone);
}

export function resolveWebchatVisitorDisplayName(
  leadSource?: WebchatLeadSource | string | null,
): string {
  if (leadSource === "agent_page_embed") return EMBEDDED_AGENT_PAGE_VISITOR_NAME;
  return leadSource === "agent_page" ? AGENT_PAGE_VISITOR_NAME : WEBSITE_VISITOR_NAME;
}

export function buildWebchatLeadCustomFields(
  leadSource: WebchatLeadSource | undefined,
  visitorId: string,
  existing?: Record<string, unknown> | null,
): Record<string, unknown> {
  const customFields: Record<string, unknown> = { ...(existing || {}) };
  customFields.webchatVisitorId = visitorId;
  if (leadSource === "agent_page_embed") {
    customFields.sourcePage = "agent_page_embed";
    customFields.leadSource = "Embedded Agent Page";
  } else if (leadSource === "agent_page") {
    customFields.sourcePage = "agent_page";
    customFields.leadSource = "Agent Page";
  }
  return customFields;
}

export function resolveWebchatLeadSource(input: {
  source?: string | null;
  parentUrl?: string | null;
}): WebchatLeadSource | undefined {
  if (input.source === "agent_page_embed") return "agent_page_embed";
  if (input.source === "agent_page") return "agent_page";
  const href = (input.parentUrl || "").trim();
  if (href && /\/agents\/[^/?#]+/i.test(href)) return "agent_page";
  return undefined;
}

export const WEBCHAT_IDENTITY_PROMPT =
  "Thanks for reaching out! To help you best, could you share your name and the best phone number or email to reach you?";
