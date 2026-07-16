/**
 * DB-polled durable worker for prospect bulk AI analysis jobs.
 * Survives browser close and Railway/app restarts via lease + item_results resume.
 */

import crypto from "crypto";
import {
  claimNextBulkAnalysisJob,
  processClaimedBulkAnalysisJob,
  recoverStaleBulkAnalysisJobs,
} from "./prospectBulkAnalysisService";
import { prospectBulkAnalysisLog } from "@shared/prospectBulkSelection";

const POLL_INTERVAL_MS = 5_000;
const workerId = `bulk-ai-${process.pid}-${crypto.randomBytes(3).toString("hex")}`;

let workerTimer: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;

async function tick(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    await recoverStaleBulkAnalysisJobs();
    // Process at most one job per tick (bounded AI concurrency stays serial inside job).
    const job = await claimNextBulkAnalysisJob(workerId);
    if (job) {
      await processClaimedBulkAnalysisJob(job, workerId);
    }
  } catch (err) {
    console.error("[ProspectBulkAnalysis] worker tick error:", err);
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
