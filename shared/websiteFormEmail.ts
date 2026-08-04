/**
 * Generic website form notification classifier + structured field parser.
 * Conservative multi-signal confidence — not provider- or brand-specific.
 */

import { normalizeEmailAddress, type NormalizedEmailAddress } from "./emailChannel";
import {
  emailLocalPart,
  looksLikeNotificationSender,
  resolveEmailReplyTarget,
  type ResolvedEmailReplyTarget,
} from "./emailReplyTarget";

export const WEBSITE_FORM_SOURCE_TYPE = "website_form" as const;

export type WebsiteFormStructuredFields = Record<string, string>;

export type WebsiteFormSourceMetadata = {
  sourceType: typeof WEBSITE_FORM_SOURCE_TYPE;
  formType: string | null;
  formName: string | null;
  sourcePageUrl: string | null;
  submittedAt: string | null;
  visitorName: string | null;
  visitorEmail: string | null;
  visitorPhone: string | null;
  structuredFields: WebsiteFormStructuredFields;
  classificationConfidence: number;
  classificationSignals: string[];
  notificationFromEmail: string | null;
  notificationFromName: string | null;
  replyTargetEmail: string | null;
  replyTargetName: string | null;
  replyTargetSource: ResolvedEmailReplyTarget["source"];
  /** Clean visitor message body (not the full notification). */
  visitorMessage: string | null;
  transportChannel: "email";
};

const FORM_SUBJECT_RE =
  /\b(?:contact\s+form|new\s+inquiry|form\s+submission|new\s+lead|listing\s+inquiry|website\s+(?:form|inquiry)|inquiry\s+from|you\s+have\s+a\s+new\s+(?:message|inquiry|submission))\b/i;

const FORM_LOCAL_PARTS = [
  "forms",
  "form",
  "contact",
  "contacts",
  "submissions",
  "submission",
  "website",
  "notifications",
];

/** Labels commonly used in form notification emails (order-independent). */
const FIELD_LABEL_ALIASES: Record<string, string[]> = {
  name: ["name", "full name", "your name", "visitor name", "contact name"],
  email: ["email", "e-mail", "email address", "visitor email", "your email"],
  phone: ["phone", "telephone", "mobile", "phone number", "tel"],
  subject: ["subject", "topic", "regarding"],
  message: ["message", "comments", "comment", "inquiry", "question", "details", "body"],
  pageUrl: ["page url", "page", "source url", "form url", "url", "submitted from", "pageurl"],
  submittedAt: ["submitted at", "submitted", "submission time", "date", "timestamp"],
};

const CONFIDENCE_THRESHOLD = 0.62;

export type WebsiteFormClassifyInput = {
  subject?: string | null;
  textBody?: string | null;
  htmlBody?: string | null;
  from?: NormalizedEmailAddress | null;
  replyTo?: NormalizedEmailAddress | null;
  mailboxEmail?: string | null;
  selectedHeaders?: Record<string, string> | null;
};

function stripHtmlToText(html: string): string {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function emailBodyToPlainText(input: {
  textBody?: string | null;
  htmlBody?: string | null;
}): string {
  const text = String(input.textBody || "").trim();
  if (text) return text;
  return stripHtmlToText(String(input.htmlBody || ""));
}

function canonicalizeLabel(label: string): string | null {
  const n = label.toLowerCase().replace(/[_*]+/g, " ").replace(/\s+/g, " ").trim();
  for (const [canonical, aliases] of Object.entries(FIELD_LABEL_ALIASES)) {
    if (aliases.some((a) => a === n)) return canonical;
  }
  return null;
}

/**
 * Parse labeled fields from plain text form notifications.
 * Supports "Label: value" and multiline values until the next label.
 */
export function parseWebsiteFormFields(plainBody: string): WebsiteFormStructuredFields {
  const body = String(plainBody || "").replace(/\r\n/g, "\n");
  if (!body.trim()) return {};

  const lines = body.split("\n");
  const fields: WebsiteFormStructuredFields = {};
  let currentKey: string | null = null;
  let currentRawLabel: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (!currentKey && !currentRawLabel) return;
    const value = buffer.join("\n").trim();
    if (!value) {
      currentKey = null;
      currentRawLabel = null;
      buffer = [];
      return;
    }
    if (currentKey) {
      if (!fields[currentKey] || value.length > fields[currentKey].length) {
        fields[currentKey] = value;
      }
    } else if (currentRawLabel) {
      fields[`extra:${currentRawLabel}`] = value;
    }
    currentKey = null;
    currentRawLabel = null;
    buffer = [];
  };

  for (const line of lines) {
    const m = line.match(/^[\s*_>]*([A-Za-z][A-Za-z0-9 /_-]{0,40})\s*[:：]\s*(.*)$/);
    if (m) {
      const label = m[1].trim();
      const rest = m[2] ?? "";
      const canonical = canonicalizeLabel(label);
      // Avoid treating every short "Re: foo" mid-message as a field — require known labels or Title Case-ish form labels.
      const looksLikeFormLabel =
        Boolean(canonical) ||
        (label.length <= 24 &&
          !/\b(hi|hello|hey|thanks|dear)\b/i.test(label) &&
          /^[A-Z]/.test(label));
      if (looksLikeFormLabel) {
        flush();
        currentKey = canonical;
        currentRawLabel = canonical ? null : label;
        buffer = rest.trim() ? [rest] : [];
        continue;
      }
    }
    if (currentKey || currentRawLabel) {
      buffer.push(line);
    }
  }
  flush();
  return fields;
}

function scoreSignals(input: WebsiteFormClassifyInput, fields: WebsiteFormStructuredFields): {
  score: number;
  signals: string[];
} {
  const signals: string[] = [];
  let score = 0;

  const fromEmail = normalizeEmailAddress(input.from?.email);
  const replyToEmail = normalizeEmailAddress(input.replyTo?.email);
  const replyTarget = resolveEmailReplyTarget({
    fromEmail,
    fromName: input.from?.name,
    replyToEmail,
    replyToName: input.replyTo?.name,
    mailboxEmail: input.mailboxEmail,
  });

  if (
    replyTarget.source === "reply_to" &&
    replyToEmail &&
    fromEmail &&
    replyToEmail !== fromEmail
  ) {
    score += 0.34;
    signals.push("reply_to_differs_from_from");
  }

  if (looksLikeNotificationSender(fromEmail, FORM_LOCAL_PARTS)) {
    score += 0.22;
    signals.push(`notification_from:${emailLocalPart(fromEmail)}`);
  }

  if (FORM_SUBJECT_RE.test(String(input.subject || ""))) {
    score += 0.22;
    signals.push("form_subject");
  }

  const knownKeys = ["name", "email", "message", "subject", "pageUrl", "submittedAt"];
  const hit = knownKeys.filter((k) => fields[k]).length;
  if (hit >= 3) {
    score += 0.28;
    signals.push(`structured_fields:${hit}`);
  } else if (hit === 2) {
    score += 0.16;
    signals.push(`structured_fields:${hit}`);
  } else if (hit === 1 && fields.message) {
    score += 0.08;
    signals.push("structured_fields:message_only");
  }

  if (fields.email && replyToEmail && normalizeEmailAddress(fields.email) === replyToEmail) {
    score += 0.1;
    signals.push("body_email_matches_reply_to");
  }

  if (fields.pageUrl && /^https?:\/\//i.test(fields.pageUrl)) {
    score += 0.08;
    signals.push("page_url");
  }

  // Cap
  if (score > 1) score = 1;
  return { score, signals };
}

function pickVisitorName(fields: WebsiteFormStructuredFields, replyToName: string | null): string | null {
  const fromField = String(fields.name || "").trim();
  if (fromField && !/^(email|name|null|undefined)$/i.test(fromField)) return fromField;
  const fromReply = String(replyToName || "").trim();
  if (fromReply) return fromReply;
  return null;
}

export function classifyWebsiteFormEmail(
  input: WebsiteFormClassifyInput,
): WebsiteFormSourceMetadata | null {
  const plain = emailBodyToPlainText({
    textBody: input.textBody,
    htmlBody: input.htmlBody,
  });
  const fields = parseWebsiteFormFields(plain);
  const { score, signals } = scoreSignals(input, fields);

  if (score < CONFIDENCE_THRESHOLD) return null;

  const replyTarget = resolveEmailReplyTarget({
    fromEmail: input.from?.email,
    fromName: input.from?.name,
    replyToEmail: input.replyTo?.email,
    replyToName: input.replyTo?.name,
    mailboxEmail: input.mailboxEmail,
  });

  const visitorEmail =
    normalizeEmailAddress(fields.email) ||
    (replyTarget.source === "reply_to" ? replyTarget.email : null);

  const visitorName = pickVisitorName(fields, replyTarget.name);
  const visitorMessage = fields.message?.trim() || null;

  // Subject from form field vs email subject
  const formSubject = fields.subject?.trim() || null;
  const emailSubject = String(input.subject || "").trim();
  let formName: string | null = null;
  const subjectForm = emailSubject.match(/contact\s+form\s*[—–\-:]\s*(.+)$/i);
  if (subjectForm?.[1]) formName = subjectForm[1].trim().slice(0, 160);
  else if (/contact\s+form/i.test(emailSubject)) formName = "Contact Form";

  return {
    sourceType: WEBSITE_FORM_SOURCE_TYPE,
    formType: formName ? "contact_form" : "website_form",
    formName,
    sourcePageUrl: fields.pageUrl?.trim() || null,
    submittedAt: fields.submittedAt?.trim() || null,
    visitorName,
    visitorEmail,
    visitorPhone: fields.phone?.trim() || null,
    structuredFields: fields,
    classificationConfidence: Number(score.toFixed(3)),
    classificationSignals: signals,
    notificationFromEmail: normalizeEmailAddress(input.from?.email),
    notificationFromName: String(input.from?.name || "").trim() || null,
    replyTargetEmail: replyTarget.email,
    replyTargetName: replyTarget.name,
    replyTargetSource: replyTarget.source,
    visitorMessage,
    transportChannel: "email",
  };
}

/** Compact page label for UI, e.g. Contact page. */
export function compactSourcePageLabel(pageUrl: string | null | undefined): string | null {
  const raw = String(pageUrl || "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const path = (u.pathname || "/").replace(/\/+$/, "") || "/";
    if (path === "/" || path === "") return "Home page";
    const last = path.split("/").filter(Boolean).pop() || "page";
    const label = last.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    if (/contact/i.test(label) || /contact/i.test(path)) return "Contact page";
    return `${label} page`;
  } catch {
    if (/contact/i.test(raw)) return "Contact page";
    return "Website page";
  }
}

export function formatWebsiteFormAiContext(meta: WebsiteFormSourceMetadata): string {
  const lines = [
    "Inbound website form inquiry (first-party lead).",
    meta.visitorName ? `Visitor name: ${meta.visitorName}` : null,
    meta.visitorEmail ? `Visitor email (reply to this address): ${meta.visitorEmail}` : null,
    meta.visitorPhone ? `Visitor phone: ${meta.visitorPhone}` : null,
    meta.formName || meta.formType ? `Form: ${meta.formName || meta.formType}` : null,
    meta.structuredFields.subject ? `Form subject: ${meta.structuredFields.subject}` : null,
    meta.sourcePageUrl ? `Source page: ${meta.sourcePageUrl}` : null,
    meta.visitorMessage
      ? `Visitor message:\n${meta.visitorMessage}`
      : "Visitor message: (see original email body)",
    "Do not address the notification sender; reply to the visitor.",
  ].filter(Boolean);
  return lines.join("\n");
}

export function formatWebsiteFormInboxPreview(meta: WebsiteFormSourceMetadata): string {
  const msg = (meta.visitorMessage || "").replace(/\s+/g, " ").trim();
  if (msg) return msg.slice(0, 100);
  const subj = meta.structuredFields.subject || meta.formName || "Website form submission";
  return String(subj).slice(0, 100);
}

export function isWebsiteFormSourceMetadata(value: unknown): value is WebsiteFormSourceMetadata {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as WebsiteFormSourceMetadata).sourceType === WEBSITE_FORM_SOURCE_TYPE,
  );
}

export { CONFIDENCE_THRESHOLD as WEBSITE_FORM_CONFIDENCE_THRESHOLD };
