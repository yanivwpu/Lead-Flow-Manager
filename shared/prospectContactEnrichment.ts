/**
 * Prospect Intelligence — manual CRM contact enrichment (email/phone).
 * Updates the existing WhachatCRM contact only (no new contact creation).
 */

import { normalizeEmailAddress } from "./emailChannel";

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
