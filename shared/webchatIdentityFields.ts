/**
 * Validated Website Chat identity fields.
 * Kept free of CRM lifecycle imports so listing can reuse the same rules.
 */

import { normalizeEmailAddress } from "./emailChannel";
import { isAnonymousWebchatVisitorName, isWebchatVisitorId, normalizeWebchatPhone } from "./agent/webchatLeadContext";
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
    "photo",
    "image",
    "file",
  ].map((s) => s.toLowerCase()),
);

export function isValidIdentityName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim().replace(/\s+/g, " ");
  if (text.length < 2 || text.length > 80) return null;
  if (GREETING_NAMES.has(text.toLowerCase())) return null;
  if (BUTTON_AND_INTENT_LABELS.has(text.toLowerCase())) return null;
  if (isAnonymousWebchatVisitorName(text)) return null;
  if (/\.(jpe?g|png|gif|webp|heic|pdf|docx?|mp4|mov)$/i.test(text)) return null;
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
