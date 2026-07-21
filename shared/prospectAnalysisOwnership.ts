/**
 * Prospect AI analysis ownership helpers.
 * Job enqueue must not claim `processing`; the worker (or a single analyze call) owns that transition.
 */

import { PROSPECT_BULK_ANALYSIS_LEASE_MS } from "./prospectBulkSelection";

/** Abandoned `processing` rows older than lease + margin are safe to heal → failed. */
export const PROSPECT_ANALYSIS_STALE_PROCESSING_MS =
  PROSPECT_BULK_ANALYSIS_LEASE_MS + 8.5 * 60_000; // ~10 minutes

export function claimableAnalysisStatuses(force: boolean): string[] {
  return force ? ["pending", "failed", "completed"] : ["pending", "failed"];
}

export function canClaimAnalysisStatus(status: string | null | undefined, force: boolean): boolean {
  const s = String(status || "").toLowerCase();
  return claimableAnalysisStatuses(force).includes(s);
}

export function isAnalysisAlreadyProcessing(status: string | null | undefined): boolean {
  return String(status || "").toLowerCase() === "processing";
}

export function isStaleProcessingTimestamp(
  updatedAt: Date | string | null | undefined,
  now: Date,
  olderThanMs: number = PROSPECT_ANALYSIS_STALE_PROCESSING_MS,
): boolean {
  if (!updatedAt) return true;
  const t = updatedAt instanceof Date ? updatedAt.getTime() : new Date(updatedAt).getTime();
  if (Number.isNaN(t)) return true;
  return now.getTime() - t >= olderThanMs;
}

export function contactOwnedByActiveBulkLease(params: {
  contactId: string;
  activeJobs: Array<{
    status?: string | null;
    leaseExpiresAt?: Date | string | null;
    contactIds?: unknown;
  }>;
  now: Date;
}): boolean {
  const id = String(params.contactId);
  for (const job of params.activeJobs) {
    if (String(job.status || "").toLowerCase() !== "running") continue;
    const exp = job.leaseExpiresAt;
    if (!exp) continue;
    const expMs = exp instanceof Date ? exp.getTime() : new Date(exp).getTime();
    if (Number.isNaN(expMs) || expMs <= params.now.getTime()) continue;
    const ids = Array.isArray(job.contactIds) ? job.contactIds.map(String) : [];
    if (ids.includes(id)) return true;
  }
  return false;
}

/**
 * Pure simulation of bulk qualify → analyze lifecycle (old bug vs fixed ownership).
 * Used by regression tests — not runtime.
 */
export function simulateBulkQualifyAnalyzeLifecycle(opts: {
  /** Old bug: createBulkAnalysisJob pre-marks processing. */
  prematureMarkProcessing: boolean;
  /** Fixed path: worker claims pending/failed → processing before analyze. */
  workerClaimsBeforeAnalyze: boolean;
  /** Fixed path: catch clears processing → failed. */
  clearProcessingOnFailure: boolean;
  /** Analyzer rejects rows already in processing unless preClaimed. */
  analyzerRejectsProcessing: boolean;
  analyzerSucceeds: boolean;
}): {
  statusAfterEnqueue: string;
  analyzerCalled: boolean;
  finalStatus: string;
  itemResultStatus: "completed" | "failed";
} {
  let status = "pending";
  if (opts.prematureMarkProcessing) status = "processing";
  const statusAfterEnqueue = status;

  let claimedByWorker = false;
  if (opts.workerClaimsBeforeAnalyze && canClaimAnalysisStatus(status, false)) {
    status = "processing";
    claimedByWorker = true;
  }

  const blocked =
    opts.analyzerRejectsProcessing &&
    isAnalysisAlreadyProcessing(status) &&
    !claimedByWorker;

  if (blocked) {
    if (opts.clearProcessingOnFailure) status = "failed";
    return {
      statusAfterEnqueue,
      analyzerCalled: false,
      finalStatus: status,
      itemResultStatus: "failed",
    };
  }

  if (opts.analyzerSucceeds) {
    return {
      statusAfterEnqueue,
      analyzerCalled: true,
      finalStatus: "completed",
      itemResultStatus: "completed",
    };
  }

  return {
    statusAfterEnqueue,
    analyzerCalled: true,
    finalStatus: opts.clearProcessingOnFailure ? "failed" : status,
    itemResultStatus: "failed",
  };
}

/**
 * Manual Neon / SQL review helper text (not executed automatically).
 * Prefer healAbandonedProcessingAnalysis() on worker tick when ownership can be checked in app code.
 */
export const PROSPECT_ANALYSIS_STALE_PROCESSING_SQL = `
-- Review candidates (do not run UPDATE blindly on active work):
SELECT contact_id, analysis_status, updated_at, error_message
FROM prospect_intelligence
WHERE analysis_status = 'processing'
  AND updated_at < NOW() - INTERVAL '10 minutes';

-- Heal abandoned rows not listed on an actively leased running bulk job
-- (contact_ids is jsonb; app-side heal is preferred for ownership checks):
UPDATE prospect_intelligence
SET analysis_status = 'failed',
    error_message = COALESCE(NULLIF(error_message, ''), 'Abandoned stale processing (auto-heal)'),
    updated_at = NOW()
WHERE analysis_status = 'processing'
  AND updated_at < NOW() - INTERVAL '10 minutes';
`.trim();
