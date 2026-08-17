/**
 * Preview-only classifier for historical Email-created CRM Contacts.
 *
 * Identifies high-confidence passive/system Email identities that *could*
 * later be converted to source=email_inbox. This module never writes.
 *
 * Content-first: a noreply-style address alone is never HIGH_CONFIDENCE_SYSTEM.
 */

import {
  looksLikeHumanAsk,
  looksLikeHumanInquiry,
  looksLikeSystemNotificationContent,
  looksLikeSystemOrNotificationEmail,
  hasPropertyShowingIntent,
} from "./aiDomainEligibility";
import { classifyWebsiteFormEmail } from "./websiteFormEmail";

export const HISTORICAL_EMAIL_CLEANUP_BUCKETS = [
  "HIGH_CONFIDENCE_SYSTEM",
  "HUMAN_OR_LEAD",
  "UNCERTAIN",
] as const;

export type HistoricalEmailCleanupBucket = (typeof HISTORICAL_EMAIL_CLEANUP_BUCKETS)[number];

export type HistoricalInboundEmail = {
  fromEmail?: string | null;
  subject?: string | null;
  body?: string | null;
  sourceType?: string | null;
};

export type HistoricalEmailCleanupContact = {
  source?: string | null;
  sourceDetails?: unknown;
  customFields?: unknown;
  tag?: string | null;
  pipelineStage?: string | null;
  notes?: string | null;
  followUp?: string | null;
  followUpDate?: Date | string | null;
  assignedTo?: string | null;
  phone?: string | null;
  whatsappId?: string | null;
  instagramId?: string | null;
  facebookId?: string | null;
  telegramId?: string | null;
  ghlId?: string | null;
  inboundCount: number;
  outboundCount: number;
  otherChannelCount: number;
  hasAppointment?: boolean;
  hasCrmNotes?: boolean;
  hasUserCrmActivity?: boolean;
  hasCampaignEnrollment?: boolean;
  latestInbounds: HistoricalInboundEmail[];
};

export type HistoricalEmailCleanupResult = {
  bucket: HistoricalEmailCleanupBucket;
  reason: string;
};

const DEFAULT_TAGS = new Set(["", "new"]);
const DEFAULT_STAGES = new Set(["", "lead"]);
const MESSAGING_CHANNEL_IDS = [
  "whatsappId",
  "instagramId",
  "facebookId",
  "telegramId",
  "ghlId",
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function hasText(value: unknown): boolean {
  return String(value || "").trim().length > 0;
}

function phoneLooksReal(phone: string | null | undefined): boolean {
  return String(phone || "").replace(/\D/g, "").length >= 7;
}

function combinedInboundText(msg: HistoricalInboundEmail): string {
  return [msg.subject, msg.body].filter((p) => hasText(p)).join("\n").trim();
}

function looksLikeLeadCaptureSource(contact: HistoricalEmailCleanupContact): boolean {
  const source = String(contact.source || "").toLowerCase();
  if (
    source === "website_form" ||
    source === "import" ||
    source === "manual" ||
    source === "gohighlevel" ||
    source === "webchat" ||
    source.includes("prospect")
  ) {
    return true;
  }
  const sd = asRecord(contact.sourceDetails);
  const cf = asRecord(contact.customFields);
  if (sd.leadSource === "Website Form" || sd.inboxIdentity === true) return true;
  if (sd.prospectAi || sd.prospectImport || sd.prospectImportProvider) return true;
  if (cf.prospectAi || cf.prospectImport) return true;
  if (sd.promotedFromInboxIdentity === true) return true;
  return false;
}

function hasMessagingChannelIdentity(contact: HistoricalEmailCleanupContact): boolean {
  return MESSAGING_CHANNEL_IDS.some((k) => hasText(contact[k]));
}

function hasMeaningfulCrmTagOrStage(contact: HistoricalEmailCleanupContact): boolean {
  const tag = String(contact.tag || "").trim().toLowerCase();
  const stage = String(contact.pipelineStage || "").trim().toLowerCase();
  if (!DEFAULT_TAGS.has(tag)) return true;
  if (!DEFAULT_STAGES.has(stage)) return true;
  return false;
}

function inboundLooksLikeWebsiteForm(msg: HistoricalInboundEmail): boolean {
  if (String(msg.sourceType || "").toLowerCase() === "website_form") return true;
  const classified = classifyWebsiteFormEmail({
    subject: msg.subject,
    textBody: msg.body,
    htmlBody: null,
    from: msg.fromEmail ? { email: msg.fromEmail, name: null } : null,
    replyTo: null,
    mailboxEmail: "",
    selectedHeaders: {},
  });
  return Boolean(classified);
}

function contentLooksSystem(text: string): boolean {
  if (!text.trim()) return false;
  if (looksLikeSystemNotificationContent(text)) return true;
  return /\b(?:unsubscribe|view\s+in\s+browser|this\s+email\s+was\s+sent|manage\s+(?:your\s+)?(?:alerts|notifications|preferences|email\s+preferences)|no\s+reply)\b/i.test(
    text,
  );
}

function classifyOneInbound(msg: HistoricalInboundEmail): HistoricalEmailCleanupResult {
  const text = combinedInboundText(msg);
  const fromEmail = msg.fromEmail || "";

  if (inboundLooksLikeWebsiteForm(msg)) {
    return { bucket: "HUMAN_OR_LEAD", reason: "website_form_or_cta" };
  }

  const humanAsk = looksLikeHumanAsk(text);
  const systemContent = contentLooksSystem(text);
  const systemEmail = looksLikeSystemOrNotificationEmail({
    fromEmail,
    inboundText: text,
    channel: "email",
  });

  if (humanAsk && !systemContent) {
    return { bucket: "HUMAN_OR_LEAD", reason: "explicit_human_inquiry" };
  }

  if (systemEmail && systemContent) {
    return { bucket: "HIGH_CONFIDENCE_SYSTEM", reason: "system_notification_content" };
  }

  if (hasPropertyShowingIntent(text) && !systemContent) {
    return { bucket: "HUMAN_OR_LEAD", reason: "showing_or_property_intent" };
  }

  if (looksLikeHumanInquiry(text) && !systemEmail && !systemContent) {
    return { bucket: "HUMAN_OR_LEAD", reason: "human_inquiry_language" };
  }

  if (!text) {
    return { bucket: "UNCERTAIN", reason: "no_inbound_body" };
  }

  if (systemEmail && !systemContent) {
    return { bucket: "UNCERTAIN", reason: "address_pattern_without_content" };
  }

  return { bucket: "UNCERTAIN", reason: "not_enough_evidence" };
}

/**
 * Hard CRM / engagement exclusions — never HIGH_CONFIDENCE_SYSTEM.
 * These contacts stay listed as HUMAN_OR_LEAD (keep).
 */
export function historicalEmailCleanupKeepReason(
  contact: HistoricalEmailCleanupContact,
): string | null {
  if (contact.outboundCount > 0) return "user_outbound";
  if (contact.otherChannelCount > 0) return "other_channel_history";
  if (hasMessagingChannelIdentity(contact)) return "other_channel_identity";
  if (looksLikeLeadCaptureSource(contact)) return "form_import_or_prospect_source";
  if (contact.hasAppointment) return "appointment";
  if (contact.hasCrmNotes || hasText(contact.notes)) return "crm_notes";
  if (contact.hasUserCrmActivity) return "crm_activity";
  if (contact.hasCampaignEnrollment) return "campaign_enrollment";
  if (hasText(contact.followUp) || contact.followUpDate) return "follow_up";
  if (hasText(contact.assignedTo)) return "assigned";
  if (hasMeaningfulCrmTagOrStage(contact)) return "meaningful_tag_or_stage";
  if (phoneLooksReal(contact.phone)) return "phone_on_file";
  return null;
}

export function isHistoricalEmailCleanupCandidateBase(contact: {
  source?: string | null;
  outboundCount: number;
  otherChannelCount: number;
}): boolean {
  return String(contact.source || "") === "email" && contact.outboundCount === 0 && contact.otherChannelCount === 0;
}

/**
 * Classify one historically Email-created contact for preview-only cleanup.
 */
export function classifyHistoricalEmailContact(
  contact: HistoricalEmailCleanupContact,
): HistoricalEmailCleanupResult {
  if (!isHistoricalEmailCleanupCandidateBase(contact)) {
    return { bucket: "HUMAN_OR_LEAD", reason: "not_email_only_no_outbound" };
  }

  const keep = historicalEmailCleanupKeepReason(contact);
  if (keep) {
    return { bucket: "HUMAN_OR_LEAD", reason: keep };
  }

  const inbounds = (contact.latestInbounds || []).filter(Boolean);
  if (inbounds.length === 0) {
    return { bucket: "UNCERTAIN", reason: "no_inbound_email" };
  }

  const perMessage = inbounds.map(classifyOneInbound);
  if (perMessage.some((r) => r.bucket === "HUMAN_OR_LEAD")) {
    const hit = perMessage.find((r) => r.bucket === "HUMAN_OR_LEAD")!;
    return { bucket: "HUMAN_OR_LEAD", reason: hit.reason };
  }

  const withText = inbounds.filter((m) => combinedInboundText(m).length > 0);
  if (withText.length === 0) {
    return { bucket: "UNCERTAIN", reason: "no_inbound_body" };
  }

  const allSystem = perMessage
    .filter((_, i) => combinedInboundText(inbounds[i]).length > 0)
    .every((r) => r.bucket === "HIGH_CONFIDENCE_SYSTEM");
  if (allSystem) {
    return { bucket: "HIGH_CONFIDENCE_SYSTEM", reason: "system_notification_content" };
  }

  return { bucket: "UNCERTAIN", reason: "mixed_or_weak_signals" };
}

export function maskEmailForCleanupPreview(email: string | null | undefined): string | null {
  if (!email) return null;
  const e = String(email).trim().toLowerCase();
  const [local, domain] = e.split("@");
  if (!domain) return "***";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}
