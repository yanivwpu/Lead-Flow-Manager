/**
 * Prospect Engine Phase 2.5 — bulk selection + analysis constants.
 */

import type { ProspectIntelligenceListFilters } from "./prospectImport";

/** Hard server cap for Analyze / Approve / Queue allFiltered batches. */
export const PROSPECT_BULK_MAX_BATCH_SIZE = 1000;

/** Lease duration for multi-instance-safe job ownership. */
export const PROSPECT_BULK_ANALYSIS_LEASE_MS = 90_000;

/** Running jobs with expired leases older than this are recoverable. */
export const PROSPECT_BULK_ANALYSIS_STALE_MS = 2 * 60_000;

export type ProspectBulkSelectionMode = "selected" | "filtered";

export type ProspectBulkSelectionRequest = {
  contactIds?: string[];
  allFiltered?: boolean;
  filters?: ProspectIntelligenceListFilters;
};

export type ProspectBulkSelectionResult = {
  contactIds: string[];
  count: number;
  selectionMode: ProspectBulkSelectionMode;
  /** True when matched set exceeded max and was rejected (never silently truncated). */
  truncated: boolean;
  maxBatchSize: number;
  /** Total matched before cap enforcement (when truncated). */
  matchedCount?: number;
  filters?: ProspectIntelligenceListFilters;
};

export type ProspectBulkAnalysisItemResultStatus =
  | "completed"
  | "failed"
  | "skipped"
  | "needs_review";

export type ProspectBulkAnalysisItemResult = {
  status: ProspectBulkAnalysisItemResultStatus;
  at?: string;
  reason?: string;
};

export type ProspectBulkAnalysisItemResults = Record<string, ProspectBulkAnalysisItemResult>;

export function prospectBulkAnalysisLog(
  event: string,
  data: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    tag: "[ProspectBulkAnalysis]",
    event,
    ...data,
  };
}

export function recountBulkAnalysisItemResults(
  results: ProspectBulkAnalysisItemResults | null | undefined,
): { completed: number; failed: number; skipped: number; needsReview: number; processed: number } {
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  let needsReview = 0;
  const entries = results && typeof results === "object" ? Object.values(results) : [];
  for (const r of entries) {
    if (!r || typeof r !== "object") continue;
    if (r.status === "completed") completed += 1;
    else if (r.status === "failed") failed += 1;
    else if (r.status === "skipped") skipped += 1;
    else if (r.status === "needs_review") {
      needsReview += 1;
      completed += 1;
    }
  }
  return {
    completed,
    failed,
    skipped,
    needsReview,
    processed: completed + failed + skipped,
  };
}

export function failedContactIdsFromItemResults(
  results: ProspectBulkAnalysisItemResults | null | undefined,
): string[] {
  if (!results || typeof results !== "object") return [];
  return Object.entries(results)
    .filter(([, r]) => r?.status === "failed")
    .map(([id]) => id);
}
