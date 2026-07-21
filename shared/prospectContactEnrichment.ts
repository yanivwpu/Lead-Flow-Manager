/**
 * Prospect Intelligence — manual CRM contact enrichment (email/phone).
 * Updates the existing WhachatCRM contact only (no new contact creation).
 */

import { normalizeEmailAddress } from "./emailChannel";
import { resolveProspectOutreachLifecycleUi } from "./prospectOutreachLifecycle";

const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidProspectEmail(raw: string | null | undefined): boolean {
  const normalized = normalizeEmailAddress(raw);
  if (!normalized) return false;
  return EMAIL_FORMAT_RE.test(normalized);
}

/** Normalize for storage — lowercase trim; null if empty/invalid. */
export function normalizeProspectEmailForSave(raw: string | null | undefined): string | null {
  const normalized = normalizeEmailAddress(raw);
  if (!normalized) return null;
  if (!EMAIL_FORMAT_RE.test(normalized)) return null;
  return normalized;
}

/**
 * Phone rules aligned with prospect import / dedup:
 * - strip non-digits for validity (≥7 digits required)
 * - preserve leading `+` when the user entered one (E.164-style)
 */
export function normalizeProspectPhoneForSave(raw: string | null | undefined): string | null {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7) return null;
  if (trimmed.startsWith("+")) return `+${digits}`;
  return digits;
}

export function isValidProspectPhone(raw: string | null | undefined): boolean {
  return normalizeProspectPhoneForSave(raw) != null;
}

export type ProspectOutreachChannelState = {
  hasEmail: boolean;
  hasPhone: boolean;
  emailLabel: string;
  phoneLabel: string;
  emailStatus: "ready" | "missing";
  phoneStatus: "ready" | "missing";
};

/** UI labels for outreach readiness — do not imply sendability when missing. */
export function resolveProspectOutreachChannelState(input: {
  email?: string | null;
  phone?: string | null;
}): ProspectOutreachChannelState {
  const email = normalizeEmailAddress(input.email);
  const hasEmail = Boolean(email && EMAIL_FORMAT_RE.test(email));
  const phoneStored = String(input.phone || "").trim();
  const phoneNorm = normalizeProspectPhoneForSave(phoneStored);
  const hasPhone = Boolean(phoneNorm);

  return {
    hasEmail,
    hasPhone,
    emailLabel: hasEmail ? email! : "Missing email",
    phoneLabel: hasPhone ? phoneStored || phoneNorm! : "Missing phone",
    emailStatus: hasEmail ? "ready" : "missing",
    phoneStatus: hasPhone ? "ready" : "missing",
  };
}

export type ProspectApproveOutreachUi = {
  isApproved: boolean;
  showApproveButton: boolean;
  showSendOutreach: boolean;
  showViewThread: boolean;
  emailGateLabel: string | null;
  statusLabel: string;
  isOutreachSentOrLater: boolean;
};

/** Approve / Send outreach visibility from reviewStatus + outreachStatus + email. */
export function resolveProspectApproveOutreachUi(input: {
  reviewStatus?: string | null;
  outreachStatus?: string | null;
  outreachSentAt?: string | null;
  repliedAt?: string | null;
  email?: string | null;
  outreachConversationId?: string | null;
  analysisStatus?: string | null;
}): ProspectApproveOutreachUi {
  const lifecycle = resolveProspectOutreachLifecycleUi({
    reviewStatus: input.reviewStatus,
    outreachStatus: input.outreachStatus,
    outreachSentAt: input.outreachSentAt,
    repliedAt: input.repliedAt,
    email: input.email,
    outreachConversationId: input.outreachConversationId,
    hasValidEmail: isValidProspectEmail(input.email),
    analysisStatus: input.analysisStatus,
  });
  return {
    isApproved: lifecycle.isApproved,
    showApproveButton: lifecycle.showApproveButton,
    showSendOutreach: lifecycle.showSendOutreach,
    showViewThread: lifecycle.showViewThread,
    emailGateLabel: lifecycle.emailGateLabel,
    statusLabel: lifecycle.statusLabel,
    isOutreachSentOrLater: lifecycle.isOutreachSentOrLater,
  };
}

export function buildProspectOutreachSubject(name?: string | null): string {
  const clean = titleCaseProspectName(name) || "Your Business";
  return `Idea for ${clean}`;
}

/** Title-case prospect/business names for outreach subject lines. */
export function titleCaseProspectName(name?: string | null): string {
  const raw = String(name || "").trim();
  if (!raw) return "";
  return raw
    .split(/\s+/)
    .map((word) => {
      if (!word) return word;
      // Preserve short all-caps tokens (e.g. LLC, AI) as uppercase.
      if (word.length <= 3 && word === word.toUpperCase() && /[A-Z]/.test(word)) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/** sessionStorage payload for PI → Inbox new-email compose. */
export const PROSPECT_OUTREACH_COMPOSE_STORAGE_KEY = "whachat:prospect-outreach-compose";

export type ProspectOutreachComposePayload = {
  /** Same as prospect_intelligence.contact_id (PK). */
  contactId: string;
  /** Marker so Native Email send can attribute success to PI outreach. */
  source: "prospect_intelligence";
  subject: string;
  body: string;
  createdAt: number;
};

export function buildProspectOutreachInboxHref(contactId: string): string {
  const id = encodeURIComponent(contactId);
  return `/app/inbox/${id}?channel=email&compose=new&focusComposer=1`;
}

/** Parse + validate PI outreach handoff payload (safe; no body content returned beyond lengths). */
export function parseProspectOutreachComposePayload(
  raw: string | null | undefined,
  expectedContactId: string,
): ProspectOutreachComposePayload | null {
  if (!raw || !expectedContactId) return null;
  try {
    const parsed = JSON.parse(raw) as ProspectOutreachComposePayload;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.source !== "prospect_intelligence") return null;
    if (String(parsed.contactId || "") !== expectedContactId) return null;
    return {
      contactId: String(parsed.contactId),
      source: "prospect_intelligence",
      subject: typeof parsed.subject === "string" ? parsed.subject : "",
      body: typeof parsed.body === "string" ? parsed.body : "",
      createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * compose=new must stay in the URL until email is reachable and handoff is adopted.
 * Stripping earlier drops the handoff while forceNewEmailCompose can still stay true
 * from the initial URL snapshot — blank subject/body with Manual banner showing.
 */
export function shouldStripProspectComposeQuery(input: {
  composeNew: boolean;
  emailReachable: boolean;
  handoffAdopted: boolean;
}): boolean {
  if (!input.composeNew) return true;
  if (!input.emailReachable) return false;
  return input.handoffAdopted;
}

export function prospectOutreachPayloadDiag(payload: ProspectOutreachComposePayload | null) {
  return {
    hasSubject: Boolean(payload?.subject?.trim()),
    hasBody: Boolean(payload?.body?.trim()),
    subjectLength: payload?.subject?.length ?? 0,
    bodyLength: payload?.body?.length ?? 0,
  };
}

