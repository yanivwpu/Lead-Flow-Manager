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

/** Extract only newly authored text, excluding quoted history. */
function explicitOptOutScope(body: string, subject = ""): "all" | "email" | null {
  const authored = String(body || "").split(/\r?\n/).filter(line => !/^\s*>/.test(line)).join("\n").split(/(?:^|\n)\s*(?:On .+wrote:|From:|-----Original Message-----)/i)[0].trim();
  // Inspect both independently: signatures must not hide a subject-only request.
  const candidates = [authored, subject.replace(/^(?:(?:re|fw|fwd):\s*)+/i, "").trim()];
  // Share nouns/actions across polite forms so "texts" and "text messages"
  // cannot diverge between recognition and channel-scope classification.
  const noun = String.raw`(?:e[ -]?mails?(?:\s+messages?)?|texts?(?:\s+messages?)?|sms(?:\s+messages?)?|messages?|communications?|notifications?|updates?|newsletters?|mail|whatsapp(?:\s+messages?)?|spam|promotions?|advertisements?|offers?)`;
  const qualifiedNoun = String.raw`(?:(?:any|all)\s+)?(?:more\s+)?(?:(?:your|the|these|those|such)\s+)?(?:(?:future|marketing|promotional|unwanted)\s+)*${noun}`;
  const list = String.raw`(?:(?:your|the|this|all)\s+)?(?:mailing\s+list|e[ -]?mail\s+list|distribution\s+list|contact\s+list|list|database|contacts|${qualifiedNoun})`;
  const delivery = String.raw`(?:sending|receiving)(?:\s+(?:me|us))?\s+${qualifiedNoun}(?:\s+to\s+(?:me|us))?`;
  const action = String.raw`(?:stop(?:\s+(?:(?:messaging|contacting|emailing|mailing|texting)(?:\s+(?:me|us))?|${delivery}|everything))?|unsubscribe(?:\s+me)?(?:\s+from\s+${list})?|remove\s+me(?:\s+from\s+${list})?|take\s+me\s+off\s+${list}|opt(?:\s+me)?[\s-]?out(?:\s+of\s+${list})?|(?:do\s+not|don['’]?t|never)\s+(?:(?:contact|message|text|email|mail)(?:\s+(?:me|us))?|send(?:\s+(?:me|us))?\s+${qualifiedNoun})(?:\s+again)?|no\s+more\s+${noun})`;
  const prefix = String.raw`(?:(?:hi|hello|thanks|thank you|no thanks)[,.!\s]+){0,2}(?:(?:but|and|also)\s+)?(?:(?:please|kindly)\s+|(?:can|could|would)\s+you\s+(?:please\s+)?|i(?:\s+want|\s+would\s+like|['’]d\s+like)\s+(?:you\s+)?to\s+)?`;
  const suffix = String.raw`(?:\s+(?:please|thanks|thank\s+you|immediately|now|for\s+now))?`;
  const clauses = new RegExp(String.raw`(?:^|[.!?\n,;])\s*${prefix}(${action})${suffix}\s*(?=$|[.!?\n,;])`, "gi");
  let scope: "all" | "email" | null = null;
  for (const candidate of candidates) for (const match of candidate.matchAll(clauses)) {
    const request = match[1].toLowerCase();
    if (request === "stop" || /\b(?:texts?|texting|sms|whatsapp|messaging|contact(?:ing|s)?|everything)\b/.test(request)) return "all";
    // An explicit email noun keeps "email messages" email-scoped, whereas
    // unspecified messages/communications are a broader stop request.
    if (!/\b(?:e[ -]?mails?|emailing|mailing|mail|newsletters?|list)\b/.test(request) &&
        /\b(?:messages?|communications?|notifications?|updates?|promotions?|advertisements?|offers?)\b/.test(request)) return "all";
    scope = "email";
  }
  return scope;
}

/** Explicit opt-out clauses count; ordinary “stop by tomorrow” does not. */
export function isProspectEmailUnsubscribeSignal(input: {subject?: string | null; body?: string | null; fromEmail?: string | null}): boolean {
  if (isSystemOrBounceEmail({fromEmail:input.fromEmail,subject:input.subject})) return false;
  return explicitOptOutScope(input.body || "",input.subject || "") !== null;
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

/** Global contact requests remain distinct from email-specific opt-outs. */
export function prospectEmailUnsubscribeScope(body: string, subject = ""): "all" | "email" {
  return explicitOptOutScope(body,subject) || "email";
}
