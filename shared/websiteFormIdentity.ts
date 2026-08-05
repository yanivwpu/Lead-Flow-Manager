/**
 * Single display-identity resolver for website-form conversations.
 * Used by Inbox row, conversation header, form card, compose To, contact panel, Copilot.
 *
 * Priority for website-form identity:
 * 1. validated structured visitor name/email
 * 2. valid Reply-To name/email
 * 3. safe parsed form fields (already folded into visitor*)
 * 4. external From fallback (only when not a notification sender)
 * 5. unavailable
 */

import { normalizeEmailAddress } from "./emailChannel";
import { looksLikeNotificationSender } from "./emailReplyTarget";
import {
  isWebsiteFormSourceMetadata,
  type WebsiteFormSourceMetadata,
} from "./websiteFormEmail";

export type WebsiteFormDisplayIdentity = {
  isWebsiteForm: boolean;
  displayName: string | null;
  displayEmail: string | null;
  /** Second-line / subject preview for inbox rows. */
  subjectLine: string | null;
  formName: string | null;
  sourcePageUrl: string | null;
  leadSource: "Website Form" | null;
  notificationFromEmail: string | null;
  notificationFromName: string | null;
  replyTargetSource: string | null;
};

export type WebsiteFormIdentityInput = {
  formMeta?: WebsiteFormSourceMetadata | null;
  /** When formMeta is absent, treat sourceType === website_form as a hint. */
  sourceType?: string | null;
  replyToEmail?: string | null;
  replyToName?: string | null;
  fromEmail?: string | null;
  fromName?: string | null;
  emailSubject?: string | null;
  /** Stored CRM contact — never preferred over visitor identity for forms. */
  contactName?: string | null;
  contactEmail?: string | null;
};

function clean(value: string | null | undefined): string | null {
  const v = String(value || "").trim();
  return v || null;
}

function subjectLineFrom(input: WebsiteFormIdentityInput, meta: WebsiteFormSourceMetadata | null): string | null {
  const formSubject = clean(meta?.structuredFields?.subject);
  const formName = clean(meta?.formName) || "Contact Form";
  const emailSubject = clean(input.emailSubject);

  if (formSubject && formName) {
    // Avoid "Contact Form — Contact Form"
    if (formSubject.toLowerCase() === formName.toLowerCase()) return formName;
    return `${formName} — ${formSubject}`;
  }
  if (emailSubject) {
    // Prefer keeping the email subject as the thread title line.
    return emailSubject.slice(0, 100);
  }
  if (formName) return formName;
  return null;
}

export function resolveWebsiteFormDisplayIdentity(
  input: WebsiteFormIdentityInput,
): WebsiteFormDisplayIdentity {
  const meta =
    input.formMeta && isWebsiteFormSourceMetadata(input.formMeta)
      ? input.formMeta
      : null;
  const isWebsiteForm =
    Boolean(meta) || String(input.sourceType || "") === "website_form";

  if (!isWebsiteForm) {
    return {
      isWebsiteForm: false,
      displayName: clean(input.contactName),
      displayEmail: normalizeEmailAddress(input.contactEmail),
      subjectLine: clean(input.emailSubject),
      formName: null,
      sourcePageUrl: null,
      leadSource: null,
      notificationFromEmail: null,
      notificationFromName: null,
      replyTargetSource: null,
    };
  }

  const visitorEmail =
    normalizeEmailAddress(meta?.visitorEmail) ||
    normalizeEmailAddress(input.replyToEmail) ||
    (!looksLikeNotificationSender(input.fromEmail)
      ? normalizeEmailAddress(input.fromEmail)
      : null) ||
    (!looksLikeNotificationSender(input.contactEmail)
      ? normalizeEmailAddress(input.contactEmail)
      : null);

  const visitorName =
    clean(meta?.visitorName) ||
    clean(input.replyToName) ||
    (!looksLikeNotificationSender(input.fromEmail) ? clean(input.fromName) : null) ||
    (visitorEmail ? visitorEmail.split("@")[0] : null) ||
    (!looksLikeNotificationSender(input.contactEmail) ? clean(input.contactName) : null);

  return {
    isWebsiteForm: true,
    displayName: visitorName,
    displayEmail: visitorEmail,
    subjectLine: subjectLineFrom(input, meta),
    formName: clean(meta?.formName) || "Contact Form",
    sourcePageUrl: clean(meta?.sourcePageUrl),
    leadSource: "Website Form",
    notificationFromEmail:
      normalizeEmailAddress(meta?.notificationFromEmail) ||
      normalizeEmailAddress(input.fromEmail),
    notificationFromName: clean(meta?.notificationFromName) || clean(input.fromName),
    replyTargetSource: meta?.replyTargetSource || (input.replyToEmail ? "reply_to" : null),
  };
}

/** Compact payload for inbox list rows (no message body). */
export type InboxWebsiteFormIdentity = {
  isWebsiteForm: true;
  displayName: string | null;
  displayEmail: string | null;
  subjectLine: string | null;
  leadSource: "Website Form";
  sourcePageUrl: string | null;
  notificationFromEmail: string | null;
};

export function toInboxWebsiteFormIdentity(
  identity: WebsiteFormDisplayIdentity,
): InboxWebsiteFormIdentity | null {
  if (!identity.isWebsiteForm) return null;
  return {
    isWebsiteForm: true,
    displayName: identity.displayName,
    displayEmail: identity.displayEmail,
    subjectLine: identity.subjectLine,
    leadSource: "Website Form",
    sourcePageUrl: identity.sourcePageUrl,
    notificationFromEmail: identity.notificationFromEmail,
  };
}

export function inboxRowDisplayName(
  identity: InboxWebsiteFormIdentity | null | undefined,
  contactName: string | null | undefined,
): string {
  if (identity?.isWebsiteForm) {
    return identity.displayName || identity.displayEmail || contactName || "Website inquiry";
  }
  return contactName || "Unknown";
}

export function inboxRowMatchesSearch(
  query: string,
  item: {
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    lastMessage?: string | null;
    subject?: string | null;
    formIdentity?: InboxWebsiteFormIdentity | null;
  },
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystacks = [
    item.contactName,
    item.contactEmail,
    item.contactPhone,
    item.lastMessage,
    item.subject,
    item.formIdentity?.displayName,
    item.formIdentity?.displayEmail,
    item.formIdentity?.subjectLine,
  ];
  return haystacks.some((h) => String(h || "").toLowerCase().includes(q));
}

/** Safe http(s) URL for "View Source Page" quick action. */
export function isSafeHttpUrl(url: string | null | undefined): boolean {
  const u = String(url || "").trim();
  if (!/^https?:\/\//i.test(u)) return false;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Compact form-card subject without "Subject:" prefix or form-title boilerplate. */
export function formCardSubjectLine(params: {
  formSubject?: string | null;
  formName?: string | null;
  emailSubject?: string | null;
}): string | null {
  const formSubject = String(params.formSubject || "").trim();
  const formName = String(params.formName || "").trim() || "Contact Form";
  const emailSubject = String(params.emailSubject || "").trim();

  if (formSubject) {
    if (formSubject.toLowerCase() === formName.toLowerCase()) return null;
    if (/^contact\s+form\b/i.test(formSubject)) {
      const rest = formSubject.replace(/^contact\s+form\s*[—–\-:]\s*/i, "").trim();
      return rest || null;
    }
    return formSubject;
  }
  if (emailSubject && !/contact\s+form/i.test(emailSubject)) return emailSubject;
  return null;
}
