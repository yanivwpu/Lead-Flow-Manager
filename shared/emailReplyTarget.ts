/**
 * Inbound email reply-target resolution.
 * UI compose To and server outbound send MUST use the same resolver.
 */

import { normalizeEmailAddress } from "./emailChannel";

export type ReplyTargetSource = "reply_to" | "from" | "unavailable";

export type EmailReplyTargetInput = {
  fromEmail?: string | null;
  fromName?: string | null;
  replyToEmail?: string | null;
  replyToName?: string | null;
  /** Connected mailbox — never a safe external reply target. */
  mailboxEmail?: string | null;
  /** Optional: known internal notification senders to deprioritize. */
  notificationLocalParts?: string[] | null;
};

export type ResolvedEmailReplyTarget = {
  email: string | null;
  name: string | null;
  source: ReplyTargetSource;
  /** True when no safe external address exists. */
  unsafe: boolean;
  warning: string | null;
};

const DEFAULT_NOTIFICATION_LOCAL_PARTS = [
  "forms",
  "form",
  "contact",
  "contacts",
  "notifications",
  "notification",
  "submissions",
  "submission",
  "website",
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "mailer-daemon",
  "postmaster",
];

export function isValidExternalEmail(email: string | null | undefined): boolean {
  const n = normalizeEmailAddress(email);
  if (!n) return false;
  const [local, domain] = n.split("@");
  if (!local || !domain || !domain.includes(".")) return false;
  if (local.includes(" ") || domain.includes(" ")) return false;
  return true;
}

export function emailLocalPart(email: string | null | undefined): string {
  const n = normalizeEmailAddress(email);
  if (!n) return "";
  return n.split("@")[0] || "";
}

export function looksLikeNotificationSender(
  email: string | null | undefined,
  extraLocalParts?: string[] | null,
): boolean {
  const local = emailLocalPart(email);
  if (!local) return false;
  const set = new Set(
    [...DEFAULT_NOTIFICATION_LOCAL_PARTS, ...(extraLocalParts || [])].map((s) =>
      String(s).toLowerCase(),
    ),
  );
  if (set.has(local)) return true;
  if (local.startsWith("noreply") || local.startsWith("no-reply")) return true;
  return false;
}

function isMailboxAddress(
  email: string | null | undefined,
  mailboxEmail: string | null | undefined,
): boolean {
  const a = normalizeEmailAddress(email);
  const b = normalizeEmailAddress(mailboxEmail);
  return Boolean(a && b && a === b);
}

/**
 * Precedence:
 * 1. Valid Reply-To (external, not the mailbox)
 * 2. Otherwise valid From (external, not the mailbox)
 * 3. Unavailable
 */
export function resolveEmailReplyTarget(
  input: EmailReplyTargetInput,
): ResolvedEmailReplyTarget {
  const mailbox = normalizeEmailAddress(input.mailboxEmail);
  const replyTo = normalizeEmailAddress(input.replyToEmail);
  const from = normalizeEmailAddress(input.fromEmail);

  if (
    replyTo &&
    isValidExternalEmail(replyTo) &&
    !isMailboxAddress(replyTo, mailbox)
  ) {
    return {
      email: replyTo,
      name: String(input.replyToName || "").trim() || null,
      source: "reply_to",
      unsafe: false,
      warning: null,
    };
  }

  if (from && isValidExternalEmail(from) && !isMailboxAddress(from, mailbox)) {
    return {
      email: from,
      name: String(input.fromName || "").trim() || null,
      source: "from",
      unsafe: false,
      warning: null,
    };
  }

  return {
    email: null,
    name: null,
    source: "unavailable",
    unsafe: true,
    warning: "No safe external reply address — do not send until a visitor email is confirmed.",
  };
}

/**
 * Choose outbound To addresses. Server-authoritative:
 * - Prefer resolved reply target from the latest inbound email details.
 * - Reject client overrides that point at the mailbox or a notification From
 *   when a valid Reply-To exists.
 */
export function resolveOutboundEmailTo(params: {
  clientTo?: string[] | null;
  contactEmail?: string | null;
  replyTarget: ResolvedEmailReplyTarget;
  mailboxEmail?: string | null;
  notificationFromEmail?: string | null;
}): { to: string[]; source: string; blockedClientOverride: boolean } {
  const mailbox = normalizeEmailAddress(params.mailboxEmail);
  const resolved = normalizeEmailAddress(params.replyTarget.email);
  const notificationFrom = normalizeEmailAddress(params.notificationFromEmail);
  const contact = normalizeEmailAddress(params.contactEmail);

  const clientRaw = (params.clientTo || [])
    .map((e) => normalizeEmailAddress(e))
    .filter((e): e is string => Boolean(e));

  const clientSafe = clientRaw.filter(
    (e) => e !== mailbox && !(notificationFrom && e === notificationFrom && resolved && e !== resolved),
  );

  // When Reply-To resolved, never allow client/contact to force the notification From.
  if (params.replyTarget.source === "reply_to" && resolved) {
    const clientTriesNotification =
      clientRaw.length > 0 &&
      clientRaw.every((e) => e === notificationFrom || e === mailbox);
    if (clientTriesNotification || clientRaw.length === 0) {
      return {
        to: [resolved],
        source: "reply_to",
        blockedClientOverride: clientTriesNotification,
      };
    }
    // Allow client To only if it matches the resolved visitor (or additional CC-like recipients that aren't the notification sender).
    if (clientSafe.includes(resolved) || clientSafe.every((e) => e !== notificationFrom)) {
      const preferred = clientSafe.includes(resolved)
        ? [resolved, ...clientSafe.filter((e) => e !== resolved)]
        : clientSafe;
      return {
        to: preferred.length ? preferred : [resolved],
        source: clientSafe.includes(resolved) ? "client_aligned_reply_to" : "reply_to",
        blockedClientOverride: Boolean(notificationFrom && clientRaw.includes(notificationFrom)),
      };
    }
    return { to: [resolved], source: "reply_to", blockedClientOverride: true };
  }

  if (resolved) {
    if (clientSafe.length > 0) {
      return { to: clientSafe, source: "client", blockedClientOverride: false };
    }
    return { to: [resolved], source: params.replyTarget.source, blockedClientOverride: false };
  }

  if (clientSafe.length > 0) {
    return { to: clientSafe, source: "client", blockedClientOverride: false };
  }

  if (contact && contact !== mailbox) {
    return { to: [contact], source: "contact", blockedClientOverride: false };
  }

  return { to: [], source: "unavailable", blockedClientOverride: false };
}
