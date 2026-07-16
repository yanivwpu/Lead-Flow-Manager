/**
 * Phase 2 — Controlled multi-channel AI prospect outreach.
 * REVIEW STATE / OUTREACH LIFECYCLE / QUEUE EXECUTION remain distinct.
 */

import { prospectSuppressionDetailLabel } from "./prospectEmailSuppression";

export const PROSPECT_OUTREACH_CHANNELS = [
  "email",
  "sms",
  "whatsapp",
  "facebook",
  "instagram",
] as const;
export type ProspectOutreachChannel = (typeof PROSPECT_OUTREACH_CHANNELS)[number];

export const PROSPECT_OUTREACH_PREFERRED_CHANNELS = [
  "auto",
  "email",
  "sms",
  "whatsapp",
  "facebook",
] as const;
export type ProspectOutreachPreferredChannel =
  (typeof PROSPECT_OUTREACH_PREFERRED_CHANNELS)[number];

/** Queue execution state — do not overload review_status or outreach_status. */
export const PROSPECT_OUTREACH_QUEUE_STATUSES = [
  "queued",
  "sending",
  "sent",
  "failed",
  "skipped",
  "paused",
  "cancelled",
] as const;
export type ProspectOutreachQueueStatus = (typeof PROSPECT_OUTREACH_QUEUE_STATUSES)[number];

export const PROSPECT_OUTREACH_BATCH_STATUSES = [
  "draft",
  "queued",
  "running",
  "paused",
  "completed",
  "cancelled",
] as const;
export type ProspectOutreachBatchStatus = (typeof PROSPECT_OUTREACH_BATCH_STATUSES)[number];

export const PROSPECT_BULK_ANALYSIS_JOB_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
] as const;
export type ProspectBulkAnalysisJobStatus = (typeof PROSPECT_BULK_ANALYSIS_JOB_STATUSES)[number];

/** Channels enabled for bulk queue sending in Phase 2 production. */
export const PROSPECT_BULK_SEND_ENABLED_CHANNELS: readonly ProspectOutreachChannel[] = ["email"];

export const PROSPECT_OUTREACH_DEFAULT_SETTINGS = {
  preferredChannel: "auto" as ProspectOutreachPreferredChannel,
  /** Conservative default — scanning thousands ≠ sending thousands. */
  dailySendLimit: 40,
  minDelaySeconds: 90,
  maxDelaySeconds: 180,
  /** Soft per-mailbox hourly guard for bulk queue (below Gmail soft cap). */
  hourlySendLimit: 12,
  /**
   * Fail-closed: queueing must NOT send until explicit Start.
   * Worker claims only when queueRunning && !paused.
   */
  queueRunning: false,
  paused: false,
} as const;

export type ProspectOutreachWorkspaceSettings = {
  preferredChannel: ProspectOutreachPreferredChannel;
  dailySendLimit: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  hourlySendLimit: number;
  /** Explicit Start arm — default false. */
  queueRunning: boolean;
  paused: boolean;
  updatedAt?: string;
};

/** Worker may claim/send only when Start has armed the queue and Pause is clear. */
export function isProspectOutreachQueueArmed(settings: {
  queueRunning?: boolean | null;
  paused?: boolean | null;
}): boolean {
  return settings.queueRunning === true && settings.paused !== true;
}

export type ProspectOutreachEligibilityReason =
  | "eligible"
  | "missing_identity"
  | "sender_not_connected"
  | "not_enabled_for_bulk"
  | "existing_conversation_only"
  | "template_required"
  | "missing_consent"
  | "suppressed"
  | "opted_out"
  | "already_outreach_sent"
  | "already_replied"
  | "needs_review"
  | "not_approved"
  | "analysis_incomplete"
  | "duplicate_queued"
  | "duplicate_recipient"
  | "missing_message_snapshot"
  | "unsupported_for_cold_outreach"
  | "policy_blocked";

/** User-facing confirmation copy — never lead with internal codes. */
export function prospectOutreachEligibilityReasonLabel(
  reason: string | null | undefined,
  detail?: string | null,
): string {
  const r = String(reason || "").toLowerCase();
  switch (r) {
    case "eligible":
      return "Eligible";
    case "missing_identity":
      return detail === "missing_email" || detail === "contact_not_found"
        ? "Missing email"
        : detail === "missing_phone"
          ? "Missing phone"
          : "Missing contact identity";
    case "sender_not_connected":
      return "Email sender not connected";
    case "already_outreach_sent":
    case "already_contacted":
      return "Already contacted";
    case "already_replied":
      return "Already replied";
    case "needs_review":
      return "Needs review";
    case "not_approved":
      return "Not approved yet";
    case "analysis_incomplete":
      return "AI analysis incomplete";
    case "duplicate_queued":
    case "duplicate_recipient":
    case "dedup_key_collision":
      return "Already queued (duplicate)";
    case "missing_message_snapshot":
      return "Missing approved message";
    case "suppressed":
      return prospectSuppressionDetailLabel(detail, detail);
    case "opted_out":
      return prospectSuppressionDetailLabel(detail || "unsubscribe", detail);
    case "missing_consent":
      return "Missing consent for this channel";
    case "template_required":
    case "unsupported_for_cold_outreach":
    case "existing_conversation_only":
      return "Channel not available for cold outreach";
    case "not_enabled_for_bulk":
      return "No bulk-enabled channel available";
    default:
      return "Not eligible for bulk outreach";
  }
}

export type ProspectChannelEligibility = {
  channel: ProspectOutreachChannel;
  eligible: boolean;
  /** True when identity + connection exist, ignoring cold-outreach / bulk policy. */
  technicallyAvailable: boolean;
  /** Workspace sender/connection present. */
  connected: boolean;
  /** Policy/session allows outbound for this use case. */
  policyEligible: boolean;
  reason: ProspectOutreachEligibilityReason;
  detail?: string;
};

export type ProspectOutreachEligibilityResult = {
  channels: Record<ProspectOutreachChannel, ProspectChannelEligibility>;
  selectedChannel: ProspectOutreachChannel | null;
  anyEligible: boolean;
  summaryReason?: ProspectOutreachEligibilityReason;
};

export type ProspectOutreachQueuePreviewSkip = {
  contactId: string;
  name?: string;
  reason: ProspectOutreachEligibilityReason | string;
  /** Human-readable confirmation copy. */
  reasonLabel?: string;
  detail?: string;
};

export type ProspectOutreachQueuePreview = {
  selectedCount: number;
  willQueue: number;
  eligibleByChannel: Partial<Record<ProspectOutreachChannel, number>>;
  notBulkEligible: number;
  skips: ProspectOutreachQueuePreviewSkip[];
  preferredChannel: ProspectOutreachPreferredChannel;
};

export type ProspectOutreachBatchSummary = {
  id: string;
  workspaceUserId: string;
  status: ProspectOutreachBatchStatus;
  preferredChannel: ProspectOutreachPreferredChannel;
  selectedCount: number;
  queuedCount: number;
  skippedCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  createdByUserId?: string | null;
};

export type ProspectOutreachQueueItemSummary = {
  id: string;
  batchId: string;
  workspaceUserId: string;
  contactId: string;
  prospectName?: string | null;
  selectedChannel: ProspectOutreachChannel;
  recipientIdentity: string;
  subjectSnapshot?: string | null;
  recommendedOffer?: string | null;
  outreachAngle?: string | null;
  queueStatus: ProspectOutreachQueueStatus;
  attempts: number;
  lastError?: string | null;
  scheduledAt?: string | null;
  startedAt?: string | null;
  sentAt?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  createdAt: string;
};

export type ProspectOutreachQueueDashboard = {
  queued: number;
  sending: number;
  sentToday: number;
  outreachSentTotal: number;
  replied: number;
  failed: number;
  paused: number;
  settings: ProspectOutreachWorkspaceSettings;
  queuePaused: boolean;
  queueRunning: boolean;
};

export type ProspectBulkAnalysisJobSummary = {
  id: string;
  workspaceUserId: string;
  status: ProspectBulkAnalysisJobStatus;
  progressCurrent: number;
  progressTotal: number;
  completed: number;
  needsReview: number;
  failed: number;
  skipped: number;
  errorMessage?: string | null;
  createdAt: string;
  completedAt?: string | null;
  parentJobId?: string | null;
  /** Failed contact ids (for UI retry). */
  failedContactIds?: string[];
};

/** Safe structured log helper — never include bodies/tokens. */
export function prospectBulkOutreachLog(
  event: string,
  data: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    tag: "[ProspectBulkOutreach]",
    event,
    ...data,
  };
}

export function normalizeRecipientIdentity(
  channel: ProspectOutreachChannel,
  raw: string | null | undefined,
): string {
  const v = String(raw || "").trim().toLowerCase();
  if (channel === "email") return v;
  return v.replace(/\s+/g, "");
}

export function computeNextScheduledDelayMs(settings: {
  minDelaySeconds: number;
  maxDelaySeconds: number;
}): number {
  const min = Math.max(5, Number(settings.minDelaySeconds) || 90);
  const max = Math.max(min, Number(settings.maxDelaySeconds) || 180);
  const span = max - min;
  const jitter = span > 0 ? Math.floor(Math.random() * (span + 1)) : 0;
  return (min + jitter) * 1000;
}

export function isTerminalQueueStatus(status: string | null | undefined): boolean {
  const s = String(status || "").toLowerCase();
  return s === "sent" || s === "skipped" || s === "cancelled";
}

export function isRetryableQueueStatus(status: string | null | undefined): boolean {
  return String(status || "").toLowerCase() === "failed";
}

/** Dedup key for queue uniqueness within a workspace. */
export function buildQueueDedupKey(input: {
  workspaceUserId: string;
  contactId: string;
  channel: ProspectOutreachChannel;
  recipientIdentity: string;
}): string {
  return [
    input.workspaceUserId,
    input.contactId,
    input.channel,
    normalizeRecipientIdentity(input.channel, input.recipientIdentity),
  ].join(":");
}
