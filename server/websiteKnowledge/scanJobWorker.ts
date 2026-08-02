/**
 * DB-polled worker for AI Brain knowledge scan jobs.
 * Production entrypoint: `server/index.ts` calls `startKnowledgeScanWorker()` during boot.
 */

import {
  claimNextScanJob,
  failScanJob,
  newScanWorkerId,
  processScanJob,
  recoverStaleScanJobs,
} from "./scanJobService";

const POLL_INTERVAL_MS = 5_000;
const workerId = newScanWorkerId();

let workerTimer: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;

async function tick(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    try {
      const recovered = await recoverStaleScanJobs();
      if (recovered > 0) {
        console.info(`[KnowledgeScan] recovered ${recovered} stale job(s)`, { workerId });
      }
    } catch (err) {
      console.error(
        "[KnowledgeScan] stale recovery failed",
        err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
      );
    }

    const job = await claimNextScanJob(workerId);
    if (!job) return;

    console.info("[KnowledgeScan] job claimed", {
      workerId,
      jobId: job.id,
      sources: job.progressTotal,
    });
    try {
      await processScanJob(job);
      console.info("[KnowledgeScan] job completed", { workerId, jobId: job.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[KnowledgeScan] job failed", { workerId, jobId: job.id, message: message.slice(0, 200) });
      await failScanJob(job.id, message);
    }
  } catch (err) {
    console.error(
      "[KnowledgeScan] tick error",
      err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
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

export function startKnowledgeScanWorker(): void {
  if (workerTimer) return;
  console.info("[KnowledgeScan] worker started", { workerId, pollIntervalMs: POLL_INTERVAL_MS });
  void tick().finally(scheduleNext);
}

export function stopKnowledgeScanWorker(): void {
  if (workerTimer) {
    clearTimeout(workerTimer);
    workerTimer = null;
  }
}
