/** Native email channel — shared types & constants (Gmail-first Phase 1A). */

export const EMAIL_PROVIDERS = ["gmail", "microsoft"] as const;
export type EmailProviderId = (typeof EMAIL_PROVIDERS)[number];

/** Narrowest practical Gmail scopes for Phase 1A send + sync. */
export const GMAIL_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
] as const;

export const EMAIL_INITIAL_SYNC_MODES = ["last_7_days", "last_30_days", "last_90_days", "new_only"] as const;
export type EmailInitialSyncMode = (typeof EMAIL_INITIAL_SYNC_MODES)[number];

export const EMAIL_DEFAULT_INITIAL_SYNC_MODE: EmailInitialSyncMode = "last_30_days";

export const EMAIL_SYNC_STATUSES = [
  "disconnected",
  "connecting",
  "syncing",
  "connected",
  "needs_reconnect",
  "error",
] as const;
export type EmailSyncStatus = (typeof EMAIL_SYNC_STATUSES)[number];

/** Gmail users.watch / Pub/Sub push status — separate from credential syncStatus. */
export const GMAIL_WATCH_STATUSES = [
  "active",
  "renewal_due",
  "error",
  "not_configured",
] as const;
export type GmailWatchStatus = (typeof GMAIL_WATCH_STATUSES)[number];

/** Soft caps for manual one-to-one sends (WhachatCRM-side). */
export const EMAIL_SEND_HOURLY_SOFT_CAP = Number(process.env.EMAIL_SEND_HOURLY_SOFT_CAP || 30);
export const EMAIL_SEND_DAILY_SOFT_CAP = Number(process.env.EMAIL_SEND_DAILY_SOFT_CAP || 200);

/** Safety cap for initial sync message imports per mailbox. */
export const EMAIL_INITIAL_SYNC_MESSAGE_CAP = Number(process.env.EMAIL_INITIAL_SYNC_MESSAGE_CAP || 2000);

export type NormalizedEmailAddress = {
  email: string;
  name?: string | null;
};

export type NormalizedEmailAttachmentMeta = {
  filename: string;
  mimeType?: string | null;
  size?: number | null;
  providerAttachmentId: string;
};

export type NormalizedEmailMessage = {
  provider: EmailProviderId;
  providerMessageId: string;
  providerThreadId: string;
  direction: "inbound" | "outbound";
  subject: string | null;
  snippet: string | null;
  textBody: string | null;
  htmlBody: string | null;
  from: NormalizedEmailAddress;
  to: NormalizedEmailAddress[];
  cc: NormalizedEmailAddress[];
  bcc: NormalizedEmailAddress[];
  replyTo: NormalizedEmailAddress | null;
  rfcMessageId: string | null;
  inReplyTo: string | null;
  references: string[];
  sentAt: Date;
  hasAttachments: boolean;
  attachments: NormalizedEmailAttachmentMeta[];
  selectedHeaders?: Record<string, string>;
};

export type EmailRichSendPayload = {
  mailboxId: string;
  subject?: string;
  htmlBody?: string;
  textBody?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  replyMode?: "reply" | "reply_all" | "new";
  /** Gmail thread id when replying */
  providerThreadId?: string;
  inReplyTo?: string;
  references?: string[];
};

export type EmailSyncMode = "realtime" | "polling_fallback" | "unknown";

export type EmailMailboxPublic = {
  id: string;
  provider: EmailProviderId;
  emailAddress: string;
  displayName: string | null;
  syncStatus: EmailSyncStatus;
  syncError: string | null;
  lastSyncAt: string | null;
  syncProgressCurrent: number;
  syncProgressTotal: number;
  isPrimary: boolean;
  initialSyncMode: EmailInitialSyncMode;
  connectedAt: string | null;
  /** Phase 1B — watch/push vs polling; never forces reconnect alone. */
  watchStatus?: GmailWatchStatus | null;
  syncMode?: EmailSyncMode | null;
  syncModeLabel?: string | null;
};

export function normalizeEmailAddress(raw: string | null | undefined): string | null {
  const v = String(raw || "").trim().toLowerCase();
  if (!v || !v.includes("@")) return null;
  return v;
}

/**
 * Calendar / invite noise must not create Inbox CRM conversations or drive lead tags.
 * Matching is subject/header based — never by contact display name.
 */
export function isCalendarOrInviteEmail(input: {
  subject?: string | null;
  snippet?: string | null;
  selectedHeaders?: Record<string, string> | null;
}): boolean {
  const subject = String(input.subject || "").trim();
  if (
    /^(invitation|updated invitation|canceled invitation|cancelled invitation)\s*:/i.test(subject)
  ) {
    return true;
  }
  if (/^(accepted|declined|tentative)\s*:/i.test(subject)) return true;
  const headers = input.selectedHeaders || {};
  const headerBlob = Object.entries(headers)
    .map(([k, v]) => `${k}:${v}`)
    .join("\n")
    .toLowerCase();
  if (headerBlob.includes("text/calendar") || headerBlob.includes("method=request")) {
    return true;
  }
  const snippet = String(input.snippet || "").toLowerCase();
  if (snippet.includes("text/calendar") || snippet.includes("begin:vcalendar")) return true;
  return false;
}

export function initialSyncModeToDays(mode: EmailInitialSyncMode): number | null {
  switch (mode) {
    case "last_7_days":
      return 7;
    case "last_30_days":
      return 30;
    case "last_90_days":
      return 90;
    case "new_only":
      return null;
    default:
      return 30;
  }
}
