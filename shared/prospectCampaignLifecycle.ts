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
  running: "Running",
  paused: "Paused",
  blocked: "Blocked",
  completed: "Completed",
};

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

  if (input.paused === true && input.queueRunning === true && batch !== "draft") {
    return "paused";
  }

  if (batch === "paused") return "paused";
  if (batch === "running") return "running";

  return "draft";
}
