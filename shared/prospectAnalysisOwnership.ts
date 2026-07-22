/**
 * Prospect AI analysis ownership helpers.
 * Job enqueue must not claim `processing`; the worker (or a single analyze call) owns that transition.
 */

import { PROSPECT_BULK_ANALYSIS_LEASE_MS } from "./prospectBulkSelection";

/** Abandoned `processing` rows older than lease + margin are safe to heal → failed. */
export const PROSPECT_ANALYSIS_STALE_PROCESSING_MS =
  PROSPECT_BULK_ANALYSIS_LEASE_MS + 8.5 * 60_000; // ~10 minutes

/** Pending/failed rows older than this with no active job are re-enqueued. */
export const PROSPECT_ORPHAN_PENDING_AGE_MS = 2 * 60_000;

/** How often the worker sweeps for orphaned pending/failed rows. */
export const PROSPECT_ORPHAN_SWEEP_INTERVAL_MS = 60_000;

/** Per-contact AI wall-clock budget so one hung OpenAI call cannot stall the worker forever. */
export const PROSPECT_ANALYSIS_ITEM_TIMEOUT_MS = 90_000;

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

/** Contact IDs covered by pending or running bulk jobs (not yet durable-complete). */
export function contactIdsCoveredByActiveBulkJobs(
  jobs: Array<{ status?: string | null; contactIds?: unknown }>,
): Set<string> {
  const covered = new Set<string>();
  for (const job of jobs) {
    const status = String(job.status || "").toLowerCase();
    if (status !== "pending" && status !== "running") continue;
    const ids = Array.isArray(job.contactIds) ? job.contactIds.map(String) : [];
    for (const id of ids) covered.add(id);
  }
  return covered;
}

/**
 * Pure orphan filter: pending/failed rows not listed on any pending/running job.
 */
export function filterOrphanQualificationContactIds(params: {
  candidates: Array<{ contactId: string; analysisStatus?: string | null; updatedAt?: Date | string | null }>;
  activeJobs: Array<{ status?: string | null; contactIds?: unknown }>;
  now: Date;
  olderThanMs?: number;
}): string[] {
  const olderThanMs = params.olderThanMs ?? PROSPECT_ORPHAN_PENDING_AGE_MS;
  const covered = contactIdsCoveredByActiveBulkJobs(params.activeJobs);
  return params.candidates
    .filter((row) => {
      const status = String(row.analysisStatus || "").toLowerCase();
      if (status !== "pending" && status !== "failed") return false;
      if (!isStaleProcessingTimestamp(row.updatedAt, params.now, olderThanMs)) return false;
      return !covered.has(String(row.contactId));
    })
    .map((row) => String(row.contactId));
}

/** Extract id from drizzle/node-pg execute results (rows[] or array-like). */
export function extractSqlExecuteId(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const r = result as {
    rows?: Array<Record<string, unknown>>;
    [index: number]: Record<string, unknown> | undefined;
    length?: number;
  };
  const row =
    (Array.isArray(r.rows) && r.rows[0]) ||
    (typeof r.length === "number" && r.length > 0 ? r[0] : null);
  if (!row || typeof row !== "object") return "";
  const id = (row as { id?: unknown }).id ?? (row as { ID?: unknown }).ID;
  if (id != null && String(id).length > 0) return String(id);
  const values = Object.values(row);
  if (values.length === 1 && values[0] != null) return String(values[0]);
  return "";
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

/** Live diagnostics for stuck “Queued for AI…” (read-only). */
export const PROSPECT_QUALIFICATION_LIVE_DIAGNOSTICS_SQL = `
-- A. Intelligence statuses
SELECT analysis_status, COUNT(*)
FROM prospect_intelligence
GROUP BY analysis_status
ORDER BY 1;

-- B. Recent bulk jobs
SELECT
  id, status, progress_current, progress_total,
  result_completed, result_failed, result_skipped,
  lease_owner, lease_expires_at, created_at, started_at, completed_at,
  jsonb_array_length(COALESCE(contact_ids, '[]'::jsonb)) AS contact_count,
  item_results
FROM prospect_bulk_analysis_jobs
ORDER BY created_at DESC
LIMIT 10;

-- C. Pending/failed contacts not on any pending/running job (orphans)
SELECT pi.contact_id, pi.analysis_status, pi.updated_at, c.user_id AS workspace_user_id
FROM prospect_intelligence pi
JOIN contacts c ON c.id = pi.contact_id
WHERE pi.analysis_status IN ('pending', 'failed')
  AND pi.updated_at < NOW() - INTERVAL '2 minutes'
  AND NOT EXISTS (
    SELECT 1
    FROM prospect_bulk_analysis_jobs j
    WHERE j.status IN ('pending', 'running')
      AND j.contact_ids @> to_jsonb(pi.contact_id::text)
  )
ORDER BY pi.updated_at ASC
LIMIT 100;

-- D. Running jobs with expired leases
SELECT id, status, lease_owner, lease_expires_at, progress_current, progress_total
FROM prospect_bulk_analysis_jobs
WHERE status = 'running'
  AND (lease_expires_at IS NULL OR lease_expires_at < NOW());

-- E. Claimable jobs (what the worker should pick)
SELECT id, status, lease_expires_at, created_at, progress_current, progress_total
FROM prospect_bulk_analysis_jobs
WHERE status IN ('pending', 'running')
  AND (lease_expires_at IS NULL OR lease_expires_at < NOW())
ORDER BY created_at ASC;
`.trim();
