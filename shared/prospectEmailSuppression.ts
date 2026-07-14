/**
 * Durable email suppression for Prospect Engine / native email outreach.
 * Writers set customFields; eligibility already reads them.
 */

import { isSystemOrBounceEmail } from "./prospectOutreachLifecycle";
import { normalizeEmailAddress } from "./emailChannel";

export const PROSPECT_EMAIL_SUPPRESSION_REASONS = [
  "bounce",
  "unsubscribe",
  "dnc",
  "invalid_recipient",
  "manual",
] as const;
export type ProspectEmailSuppressionReason = (typeof PROSPECT_EMAIL_SUPPRESSION_REASONS)[number];

export type ProspectEmailSuppressionPatch = {
  emailBounced?: boolean;
  bounced?: boolean;
  suppressed?: boolean;
  unsubscribed?: boolean;
  optOut?: boolean;
  doNotContact?: boolean;
  suppressionReason?: ProspectEmailSuppressionReason | string;
  suppressionDetail?: string;
  suppressedAt?: string;
  /** Prior bounce recipient email if extracted from DSN. */
  bouncedEmail?: string | null;
};

/** Merge suppression flags into contact.customFields (pure). */
export function buildProspectEmailSuppressionCustomFields(
  existing: Record<string, unknown> | null | undefined,
  input: {
    reason: ProspectEmailSuppressionReason;
    detail?: string;
    bouncedEmail?: string | null;
  },
): ProspectEmailSuppressionPatch & Record<string, unknown> {
  const base = existing && typeof existing === "object" && !Array.isArray(existing) ? { ...existing } : {};
  const now = new Date().toISOString();
  const patch: ProspectEmailSuppressionPatch & Record<string, unknown> = {
    ...base,
    suppressed: true,
    suppressionReason: input.reason,
    suppressionDetail: input.detail || input.reason,
    suppressedAt: now,
  };

  if (input.reason === "bounce" || input.reason === "invalid_recipient") {
    patch.emailBounced = true;
    patch.bounced = true;
    if (input.bouncedEmail) patch.bouncedEmail = normalizeEmailAddress(input.bouncedEmail);
  }
  if (input.reason === "unsubscribe") {
    patch.unsubscribed = true;
    patch.optOut = true;
    patch.campaignOptOut = true;
  }
  if (input.reason === "dnc" || input.reason === "manual") {
    patch.doNotContact = true;
  }
  return patch;
}

const UNSUBSCRIBE_BODY_RE =
  /\b(unsubscribe|stop(\s+messaging)?|remove\s+me|opt[\s-]?out|do\s+not\s+contact|don'?t\s+contact)\b/i;

/** Real prospect inbound reply requesting opt-out (not a bounce DSN). */
export function isProspectEmailUnsubscribeSignal(input: {
  subject?: string | null;
  body?: string | null;
  fromEmail?: string | null;
}): boolean {
  if (isSystemOrBounceEmail({ fromEmail: input.fromEmail, subject: input.subject })) {
    return false;
  }
  const text = `${input.subject || ""}\n${input.body || ""}`;
  return UNSUBSCRIBE_BODY_RE.test(text);
}

/**
 * Classify Gmail/API send errors as permanent (suppress) vs transient (retryable).
 * Conservative: only clear permanent mailbox failures.
 */
export function isPermanentEmailSendFailure(error?: string | null): boolean {
  const msg = String(error || "").toLowerCase();
  if (!msg) return false;
  if (/rate limit|quota|timeout|503|502|429|temporarily|try again|backend error/i.test(msg)) {
    return false;
  }
  return (
    /invalid.?argument|invalid.?email|invalid.?to|recipient.?address.?rejected|user.?unknown|mailbox.?unavailable|address.?not.?found|does.?not.?exist|550\s*5\.1\.1|5\.1\.1|permanent\s*failure|undeliverable|domain.?not.?found|no.?such.?user/i.test(
      msg,
    )
  );
}

/**
 * Best-effort extract of original recipient from bounce/DSN text.
 * Not fully RFC 3464 complete — returns null when uncertain.
 */
export function extractBouncedRecipientFromDsn(input: {
  subject?: string | null;
  body?: string | null;
  selectedHeaders?: Record<string, string> | null;
}): string | null {
  const headers = input.selectedHeaders || {};
  for (const key of ["x-failed-recipients", "original-recipient", "final-recipient"]) {
    const raw = headers[key] || headers[key.toLowerCase()];
    if (raw) {
      const email = extractEmailToken(raw);
      if (email) return email;
    }
  }

  const text = `${input.subject || ""}\n${input.body || ""}`;
  const patterns = [
    /original-recipient:\s*(?:rfc822;\s*)?<?([^\s>;]+@[^\s>;]+)>?/i,
    /final-recipient:\s*(?:rfc822;\s*)?<?([^\s>;]+@[^\s>;]+)>?/i,
    /x-failed-recipients:\s*<?([^\s>;]+@[^\s>;]+)>?/i,
    /delivery to\s+<?([^\s>;]+@[^\s>;]+)>?\s+failed/i,
    /(?:user|recipient|address)\s+<?([^\s>;]+@[^\s>;]+)>?\s+(?:was\s+)?(?:not\s+found|unknown|rejected)/i,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m?.[1]) {
      const email = normalizeEmailAddress(m[1]);
      if (email) return email;
    }
  }
  return null;
}

function extractEmailToken(raw: string): string | null {
  const m = /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i.exec(raw);
  return m ? normalizeEmailAddress(m[1]) : null;
}

/** Human-readable eligibility label mapping (extends generic “Suppressed”). */
export function prospectSuppressionDetailLabel(
  reason?: string | null,
  detail?: string | null,
): string {
  const r = String(reason || detail || "").toLowerCase();
  if (r.includes("bounce") || r === "bounced_or_suppressed_flag" || r === "invalid_recipient") {
    return "Bounced / delivery failed";
  }
  if (r.includes("unsubscri") || r === "opted_out" || r.includes("opt_out") || r.includes("optout")) {
    return "Opted out";
  }
  if (r.includes("dnc") || r.includes("do_not_contact") || r.includes("do not contact")) {
    return "Do not contact";
  }
  if (r.includes("suppress")) return "Suppressed";
  return "Suppressed";
}
