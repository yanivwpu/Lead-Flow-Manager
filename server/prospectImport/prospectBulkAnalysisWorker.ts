/**
 * DB-polled durable worker for prospect bulk AI analysis jobs.
 * Survives browser close and Railway/app restarts via lease + item_results resume.
 *
 * Production entrypoint: `server/index.ts` calls `startProspectBulkAnalysisWorker()`
 * during boot (same process as `npm start` / `dist/index.cjs`).
 */

import crypto from "crypto";
import {
  claimNextBulkAnalysisJob,
  countClaimableBulkAnalysisJobs,
  processClaimedBulkAnalysisJob,
  recoverOrphanedPendingQualifications,
  recoverStaleBulkAnalysisJobs,
} from "./prospectBulkAnalysisService";
import { healAbandonedProcessingAnalysis } from "./prospectIntelligenceService";
import { prospectBulkAnalysisLog } from "@shared/prospectBulkSelection";
import { PROSPECT_ORPHAN_SWEEP_INTERVAL_MS } from "@shared/prospectAnalysisOwnership";

const POLL_INTERVAL_MS = 5_000;
const workerId = `bulk-ai-${process.pid}-${crypto.randomBytes(3).toString("hex")}`;

let workerTimer: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;
let lastOrphanSweepAt = 0;
let tickCount = 0;

async function tick(): Promise<void> {
  if (isRunning) {
    console.info(
      JSON.stringify(
        prospectBulkAnalysisLog("tick_skipped_busy", {
          workerId,
          tickCount,
        }),
      ),
    );
    return;
  }
  isRunning = true;
  tickCount += 1;
  try {
    console.info(
      JSON.stringify(
        prospectBulkAnalysisLog("tick_started", {
          workerId,
          tickCount,
        }),
      ),
    );

    try {
      const recovered = await recoverStaleBulkAnalysisJobs();
      if (recovered > 0) {
        console.info(
          JSON.stringify(
            prospectBulkAnalysisLog("stale_leases_cleared", {
              workerId,
              recovered,
            }),
          ),
        );
      }
    } catch (err) {
      console.error(
        JSON.stringify(
          prospectBulkAnalysisLog("recover_stale_error", {
            workerId,
            error: err instanceof Error ? err.message : String(err),
          }),
        ),
      );
    }

    try {
      const healed = await healAbandonedProcessingAnalysis();
      if (healed > 0) {
        console.info(
          JSON.stringify(
            prospectBulkAnalysisLog("heal_processing_done", {
              workerId,
              healed,
            }),
          ),
        );
      }
    } catch (err) {
      console.error(
        JSON.stringify(
          prospectBulkAnalysisLog("heal_processing_error", {
            workerId,
            error: err instanceof Error ? err.message : String(err),
          }),
        ),
      );
    }

    const now = Date.now();
    if (now - lastOrphanSweepAt >= PROSPECT_ORPHAN_SWEEP_INTERVAL_MS) {
      lastOrphanSweepAt = now;
      try {
        const orphan = await recoverOrphanedPendingQualifications();
        if (orphan.recoveredContacts > 0) {
          console.info(
            JSON.stringify(
              prospectBulkAnalysisLog("orphan_sweep_done", {
                workerId,
                ...orphan,
              }),
            ),
          );
        }
      } catch (err) {
        console.error(
          JSON.stringify(
            prospectBulkAnalysisLog("orphan_sweep_error", {
              workerId,
              error: err instanceof Error ? err.message : String(err),
            }),
          ),
        );
      }
    }

    // Process at most one job per tick (bounded AI concurrency stays serial inside job).
    const job = await claimNextBulkAnalysisJob(workerId);
    if (job) {
      console.info(
        JSON.stringify(
          prospectBulkAnalysisLog("jobs_found", {
            workerId,
            jobId: job.id,
            status: job.status,
            progressTotal: job.progressTotal,
          }),
        ),
      );
      await processClaimedBulkAnalysisJob(job, workerId);
    } else {
      let claimable = 0;
      try {
        claimable = await countClaimableBulkAnalysisJobs();
      } catch {
        /* ignore diagnostic failure */
      }
      console.info(
        JSON.stringify(
          prospectBulkAnalysisLog("tick_idle", {
            workerId,
            tickCount,
            claimableJobs: claimable,
          }),
        ),
      );
      if (claimable > 0) {
        console.error(
          JSON.stringify(
            prospectBulkAnalysisLog("claim_missed_claimable_jobs", {
              workerId,
              claimableJobs: claimable,
            }),
          ),
        );
      }
    }
  } catch (err) {
    console.error(
      JSON.stringify(
        prospectBulkAnalysisLog("tick_error", {
          workerId,
          error: err instanceof Error ? err.message : String(err),
        }),
      ),
    );
  } finally {
    isRunning = false;
  }
}

function scheduleNext(): void {
  workerTimer = setTimeout(() => {
    void tick().finally(scheduleNext);
  }, POLL_INTERVAL_MS);
}

export function startProspectBulkAnalysisWorker(): void {
  if (workerTimer) return;
  console.info(
    JSON.stringify(
      prospectBulkAnalysisLog("worker_started", {
        workerId,
        pollIntervalMs: POLL_INTERVAL_MS,
        orphanSweepIntervalMs: PROSPECT_ORPHAN_SWEEP_INTERVAL_MS,
      }),
    ),
  );
  // Immediate pass on boot so pending/stale jobs resume quickly after deploy.
  void tick().finally(scheduleNext);
}

export function stopProspectBulkAnalysisWorker(): void {
  if (workerTimer) {
    clearTimeout(workerTimer);
    workerTimer = null;
  }
}

/** Test helper — exposes busy flag without starting timers. */
export function __testGetBulkAnalysisWorkerBusy(): boolean {
  return isRunning;
}
