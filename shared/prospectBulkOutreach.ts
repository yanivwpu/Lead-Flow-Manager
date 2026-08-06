/**
 * Phase 2 — Controlled multi-channel AI prospect outreach.
 * REVIEW STATE / OUTREACH LIFECYCLE / QUEUE EXECUTION remain distinct.
 */

import { prospectSuppressionDetailLabel } from "./prospectEmailSuppression";
import type { ProspectMessageCreationSettings } from "./prospectMessageCreation";
import { PROSPECT_MESSAGE_CREATION_DEFAULTS } from "./prospectMessageCreation";

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
  outreachInstructions: PROSPECT_MESSAGE_CREATION_DEFAULTS,
  outreachInstructionsConfigured: false,
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
  /** Message Creation settings (AI Compose / templates). */
  outreachInstructions: ProspectMessageCreationSettings;
  /** True when Message Creation is configured for the active mode. */
  outreachInstructionsConfigured: boolean;
  updatedAt?: string;
};

/** Worker may claim/send only when Start has armed the queue and Pause is clear. */
export function isProspectOutreachQueueArmed(settings: {
  queueRunning?: boolean | null;
  paused?: boolean | null;
}): boolean {
  return settings.queueRunning === true && settings.paused !== true;
}

/**
 * Global campaign control flags.
 * Pause/Start/Resume are settings-level — they must NOT bulk-rewrite Ready (queued) rows.
 * Worker stoppage is enforced by isProspectOutreachQueueArmed alone.
 */
export function nextProspectQueueControlFlags(
  intent: "start" | "pause" | "resume",
  current: { queueRunning?: boolean | null; paused?: boolean | null },
): { queueRunning: boolean; paused: boolean } {
  if (intent === "pause") {
    return {
      queueRunning: current.queueRunning === true,
      paused: true,
    };
  }
  // start + resume: arm and clear pause
  return { queueRunning: true, paused: false };
}

/**
 * After an infra fail-closed pause (e.g. sender_not_connected), the claimed
 * in-flight row returns to Ready — siblings stay untouched.
 * Attempts are left as-is (claim no longer increments; only real sends do).
 */
export function nextQueueItemAfterInfraPause(params: {
  currentAttempts: number;
  reason: string;
}): { queueStatus: "queued"; attempts: number; lastError: string } {
  return {
    queueStatus: "queued",
    attempts: Math.max(0, params.currentAttempts || 0),
    lastError: String(params.reason || "paused").substring(0, 500),
  };
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
  | "not_qualified"
  | "already_in_campaign"
  | "qualification_failed"
  | "enrichment_in_progress"
  | "enrichment_required"
  | "enrichment_failed"
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
      return "Connect Gmail before starting the campaign";
    case "already_outreach_sent":
    case "already_contacted":
      return "Already contacted";
    case "already_replied":
      return "Already replied";
    case "needs_review":
      // Advisory only — should not appear as a Campaign blocker after gate fix.
      return "Needs attention";
    case "not_approved":
      return "Not Campaign Ready";
    case "not_qualified":
      return "Not Qualified";
    case "already_in_campaign":
    case "duplicate_queued":
      return "Already in Campaigns";
    case "duplicate_recipient":
    case "dedup_key_collision":
      return "Already in Campaigns";
    case "analysis_incomplete":
      return "AI Review is still in progress";
    case "qualification_failed":
      return "AI Review failed";
    case "enrichment_in_progress":
      return "Enrichment still in progress";
    case "enrichment_required":
      return "Enrichment required";
    case "enrichment_failed":
      return "Enrichment failed";
    case "missing_message_snapshot":
      return "Missing campaign message";
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
      return "Email sending is not available";
    default:
      return "Not Campaign Ready";
  }
}

/** Human-readable Campaigns row error — never show raw machine codes in the UI. */
export function formatProspectQueueItemError(lastError?: string | null): string {
  const raw = String(lastError || "").trim();
  if (!raw) return "";
  // Strip transient retry prefix for display.
  const unprefixed = raw.replace(/^retry:/i, "").trim();
  const permanent = /^permanent:\s*(.+)$/i.exec(unprefixed);
  const code = String(permanent?.[1] || unprefixed).trim();
  const lower = code.toLowerCase();

  // Campaign-wide sender auth — reconnect copy when diagnostics say the mailbox existed but is broken.
  if (
    /^sender_not_connected\b/i.test(lower) ||
    /not connected|reconnect|mailbox|oauth|unauthorized/i.test(code)
  ) {
    if (
      /decrypt|token_refresh|api_auth|needs_reconnect|mailbox_disconnected/i.test(lower)
    ) {
      return "Reconnect Gmail before Start Sending";
    }
    return "Connect Gmail before starting the campaign";
  }

  const known = [
    "missing_identity",
    "already_outreach_sent",
    "already_contacted",
    "already_replied",
    "needs_review",
    "not_approved",
    "not_qualified",
    "already_in_campaign",
    "duplicate_queued",
    "duplicate_recipient",
    "dedup_key_collision",
    "analysis_incomplete",
    "qualification_failed",
    "enrichment_in_progress",
    "enrichment_required",
    "enrichment_failed",
    "missing_message_snapshot",
    "suppressed",
    "opted_out",
    "missing_consent",
    "template_required",
    "unsupported_for_cold_outreach",
    "existing_conversation_only",
    "not_enabled_for_bulk",
    "contact_not_found",
  ];
  if (known.includes(lower) || known.includes(lower.split(/[:\s]/)[0] || "")) {
    return prospectOutreachEligibilityReasonLabel(lower.split(/[:\s]/)[0] || lower);
  }
  return code.length > 120 ? `${code.slice(0, 117)}…` : code;
}

export const PROSPECT_CAMPAIGN_CONNECT_EMAIL_MESSAGE =
  "Connect Gmail before starting the campaign.";

/** Resume/Start when mailbox probe fails after a prior connection existed. */
export const PROSPECT_CAMPAIGN_RECONNECT_EMAIL_MESSAGE =
  "Reconnect Gmail before Start Sending. Open Channel Settings to reconnect.";

/** Group preview skips by human-readable reason for the Send to Campaign modal. */
export function groupCampaignSkipReasons(
  skips: Array<{ reason?: string | null; reasonLabel?: string | null; detail?: string | null }>,
): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const s of skips) {
    const label =
      (s.reasonLabel && String(s.reasonLabel).trim()) ||
      prospectOutreachEligibilityReasonLabel(s.reason, s.detail);
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * Confirmation copy for Send to Campaign preview — saves drafts + moves to Campaigns;
 * does not send email immediately.
 */
export function formatSendToCampaignConfirmCopy(eligibleCount: number): string {
  const n = Math.max(0, Math.floor(Number(eligibleCount) || 0));
  const who = n === 1 ? "this 1 prospect" : `these ${n} prospects`;
  return `The current personalized email subject and message will be saved for ${who} and moved to the Campaigns tab, where you can review, edit, and start sending.`;
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
  /**
   * queue = Send to Campaign batch row.
   * inbox_outreach = pre-queue / native Inbox send with linked message (historical).
   */
  historySource?: "queue" | "inbox_outreach";
  /** Count of unresolved {{token}} / {token} placeholders in subject+body. */
  unresolvedTokenCount?: number;
};

/** Full draft detail for Campaigns row expansion (includes body + AI context). */
export type ProspectOutreachQueueItemDetail = ProspectOutreachQueueItemSummary & {
  messageSnapshot: string;
  reasoningSummary?: string | null;
  companyName?: string | null;
  industry?: string | null;
  businessType?: string | null;
  website?: string | null;
  /** Unresolved {{token}} / {token} placeholders found in subject/body. */
  personalizationTokens: string[];
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
  /** Latest non-completed batch (for Draft vs Running controls). */
  activeBatchId?: string | null;
  activeBatchStatus?: ProspectOutreachBatchStatus | null;
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

/**
 * Stagger schedule timestamps for a Ready queue starting from `fromMs`.
 * Used by Start/Resume so overdue items become due again with configured delays.
 * When `deterministicDelaysMs` is provided (tests), jitter is not used.
 */
export function buildStaggeredQueueSchedule(params: {
  itemCount: number;
  fromMs: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  firstDelayMs?: number;
  deterministicDelaysMs?: number[];
}): number[] {
  const count = Math.max(0, params.itemCount);
  const minMs = Math.max(5, params.minDelaySeconds) * 1000;
  const maxMs = Math.max(minMs, params.maxDelaySeconds * 1000);
  const first = Math.max(0, params.firstDelayMs ?? 5_000);
  const out: number[] = [];
  let cursor = params.fromMs + first;
  for (let i = 0; i < count; i++) {
    out.push(cursor);
    if (params.deterministicDelaysMs && params.deterministicDelaysMs[i] != null) {
      cursor += Math.max(0, params.deterministicDelaysMs[i]!);
    } else {
      const span = maxMs - minMs;
      const jitter = span <= 0 ? 0 : Math.floor(Math.random() * (span + 1));
      cursor += minMs + jitter;
    }
  }
  return out;
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
