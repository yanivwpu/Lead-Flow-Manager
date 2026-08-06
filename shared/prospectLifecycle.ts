/**
 * Prospect AI record lifecycle — archive / trash / soft-delete.
 * Lives on prospect_intelligence only (not CRM contacts).
 */

export const PROSPECT_LIFECYCLE_STATUSES = [
  "active",
  "archived",
  "trashed",
  "deleted",
] as const;

export type ProspectLifecycleStatus = (typeof PROSPECT_LIFECYCLE_STATUSES)[number];

export const PROSPECT_ARCHIVE_REASONS = [
  "outside_target_area",
  "not_qualified",
  "wrong_industry",
  "duplicate",
  "already_contacted",
  "no_contact_information",
  "closed_business",
  "bad_data",
  "other",
  "unspecified",
] as const;

export type ProspectArchiveReason = (typeof PROSPECT_ARCHIVE_REASONS)[number];

export const PROSPECT_ARCHIVE_REASON_LABELS: Record<ProspectArchiveReason, string> = {
  outside_target_area: "Outside target area",
  not_qualified: "Not qualified",
  wrong_industry: "Wrong industry",
  duplicate: "Duplicate",
  already_contacted: "Already contacted",
  no_contact_information: "No contact information",
  closed_business: "Closed business",
  bad_data: "Bad data",
  other: "Other",
  unspecified: "Unspecified",
};

export const PROSPECT_BULK_ARCHIVE_MODES = [
  "infer",
  "one_reason",
  "no_reason",
] as const;

export type ProspectBulkArchiveMode = (typeof PROSPECT_BULK_ARCHIVE_MODES)[number];

export const PROSPECT_LIFECYCLE_BULK_LIMIT = 200;

export function parseProspectLifecycleStatus(
  raw: unknown,
): ProspectLifecycleStatus {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if ((PROSPECT_LIFECYCLE_STATUSES as readonly string[]).includes(s)) {
    return s as ProspectLifecycleStatus;
  }
  return "active";
}

export function parseProspectArchiveReason(
  raw: unknown,
): ProspectArchiveReason | null {
  if (raw == null || raw === "") return null;
  const s = String(raw)
    .trim()
    .toLowerCase();
  if ((PROSPECT_ARCHIVE_REASONS as readonly string[]).includes(s)) {
    return s as ProspectArchiveReason;
  }
  return "other";
}

export function isProspectLifecycleActive(
  status: string | null | undefined,
): boolean {
  return parseProspectLifecycleStatus(status) === "active";
}

/** Non-active PI rows still count for discovery identity / quota exclusion. */
export function isProspectLifecycleHiddenFromActiveReview(
  status: string | null | undefined,
): boolean {
  const s = parseProspectLifecycleStatus(status);
  return s === "archived" || s === "trashed" || s === "deleted";
}

export function isProspectLifecycleRestorable(
  status: string | null | undefined,
): boolean {
  const s = parseProspectLifecycleStatus(status);
  return s === "archived" || s === "trashed";
}

export type ProspectArchiveBlockReason =
  | "campaign_sending"
  | "campaign_queued"
  | null;

/**
 * Campaign safety for archive/trash.
 * - sending → hard block
 * - queued/paused → block unless cancelQueue
 * - sent/replied/none → allow
 */
export function getProspectArchiveBlockReason(
  queueStatus: string | null | undefined,
  opts?: { cancelQueue?: boolean },
): ProspectArchiveBlockReason {
  const s = String(queueStatus || "")
    .trim()
    .toLowerCase();
  if (s === "sending") return "campaign_sending";
  if (s === "queued" || s === "paused") {
    if (opts?.cancelQueue) return null;
    return "campaign_queued";
  }
  return null;
}

export type ProspectArchiveInferenceInput = {
  notQualified?: boolean;
  outsideTargetArea?: boolean;
  confirmedDuplicate?: boolean;
  noContactInformation?: boolean;
  closedBusiness?: boolean;
  alreadyContacted?: boolean;
};

/** High-confidence inference only — otherwise unspecified. Never invent. */
export function inferProspectArchiveReason(
  input: ProspectArchiveInferenceInput,
): ProspectArchiveReason {
  const hits: ProspectArchiveReason[] = [];
  if (input.notQualified) hits.push("not_qualified");
  if (input.outsideTargetArea) hits.push("outside_target_area");
  if (input.confirmedDuplicate) hits.push("duplicate");
  if (input.noContactInformation) hits.push("no_contact_information");
  if (input.closedBusiness) hits.push("closed_business");
  if (input.alreadyContacted) hits.push("already_contacted");
  if (hits.length === 1) return hits[0]!;
  return "unspecified";
}

export function resolveBulkArchiveReason(params: {
  mode: ProspectBulkArchiveMode;
  oneReason?: ProspectArchiveReason | null;
  inference: ProspectArchiveInferenceInput;
}): ProspectArchiveReason | null {
  if (params.mode === "no_reason") return null;
  if (params.mode === "one_reason") {
    return parseProspectArchiveReason(params.oneReason) || "unspecified";
  }
  return inferProspectArchiveReason(params.inference);
}

export type ProspectLifecycleActionResult = {
  contactId: string;
  ok: boolean;
  status?: ProspectLifecycleStatus;
  reason?: string;
  archiveReason?: ProspectArchiveReason | null;
};

export type ProspectLifecycleBulkResult = {
  requested: number;
  archived?: number;
  restored?: number;
  trashed?: number;
  deleted?: number;
  skipped: number;
  blocked: number;
  failed: number;
  items: ProspectLifecycleActionResult[];
};

export function emptyLifecycleBulkResult(requested: number): ProspectLifecycleBulkResult {
  return {
    requested,
    archived: 0,
    restored: 0,
    trashed: 0,
    deleted: 0,
    skipped: 0,
    blocked: 0,
    failed: 0,
    items: [],
  };
}

/** Discovery disposition for non-active PI matches. */
export const PROSPECT_DISCOVERY_ALREADY_ARCHIVED = "already_archived" as const;
