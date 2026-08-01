/**
 * Explicit Prospect AI Campaign lifecycle — do not infer only from queue rows.
 */

export const PROSPECT_CAMPAIGN_LIFECYCLE_STATUSES = [
  "draft",
  "running",
  "paused",
  "blocked",
  "completed",
] as const;
export type ProspectCampaignLifecycleStatus =
  (typeof PROSPECT_CAMPAIGN_LIFECYCLE_STATUSES)[number];

export const PROSPECT_CAMPAIGN_LIFECYCLE_LABELS: Record<
  ProspectCampaignLifecycleStatus,
  string
> = {
  draft: "Draft",
  /** Armed and actively claiming/sending — UI label is "Sending". */
  running: "Sending",
  paused: "Paused",
  blocked: "Blocked",
  completed: "Completed",
};

/** Draft-campaign helper copy (never uses "paused"). */
export function formatDraftCampaignReadyCopy(readyCount: number): {
  title: string;
  readyLine: string;
  actionLine: string;
} {
  const n = Math.max(0, Math.floor(Number(readyCount) || 0));
  return {
    title: "Draft campaign ready.",
    readyLine:
      n === 1
        ? "1 personalized email is ready."
        : `${n} personalized emails are ready.`,
    actionLine: "Review messages if needed or click Start Sending.",
  };
}

/**
 * Primary control for Campaigns toolbar.
 * Draft / never-armed campaigns always expose Start — never Resume.
 */
export function resolveProspectCampaignPrimaryControl(input: {
  queueRunning: boolean;
  paused: boolean;
  /** Latest actionable batch status when known. */
  activeBatchStatus?: string | null;
  hasReadyRows: boolean;
}): "start" | "pause" | "resume" | "none" {
  const batch = String(input.activeBatchStatus || "").toLowerCase();
  const neverStartedBatch = batch === "draft" || batch === "queued";
  const armed = input.queueRunning === true && input.paused !== true;

  if (armed) return "pause";

  // Never-started campaigns always Start — sticky Pause must not force Resume.
  if (neverStartedBatch && input.hasReadyRows) return "start";

  if (input.paused === true && input.queueRunning === true) return "resume";

  if (input.hasReadyRows && !armed) return "start";

  return "none";
}

export function resolveProspectCampaignLifecycleStatus(input: {
  activeBatchStatus?: string | null;
  queueRunning: boolean;
  paused: boolean;
  mailboxUiConnected: boolean;
  emailStatusKnown: boolean;
  hasReadyRows: boolean;
  hasSendingRows: boolean;
  /** True when there are no active (ready/sending/failed/paused) rows left. */
  noActiveRows: boolean;
  hasHistoryRows: boolean;
}): ProspectCampaignLifecycleStatus {
  const batch = String(input.activeBatchStatus || "").toLowerCase();
  const actionable =
    input.hasReadyRows ||
    input.hasSendingRows ||
    input.paused ||
    input.queueRunning ||
    batch === "draft" ||
    batch === "queued" ||
    batch === "running" ||
    batch === "paused";

  if (
    input.emailStatusKnown &&
    !input.mailboxUiConnected &&
    actionable &&
    !input.noActiveRows
  ) {
    return "blocked";
  }

  if (batch === "completed" || (input.noActiveRows && input.hasHistoryRows)) {
    return "completed";
  }

  if (input.queueRunning === true && input.paused !== true) return "running";

  // Never-started batches are Draft even if sticky pause flags leaked from infra.
  const neverStarted = batch === "draft" || batch === "queued" || !batch;
  if (neverStarted && input.hasReadyRows) return "draft";
  if (neverStarted && !input.queueRunning) return "draft";

  if (input.paused === true && input.queueRunning === true) return "paused";
  if (batch === "paused") return "paused";
  if (batch === "running") return "running";

  return "draft";
}
