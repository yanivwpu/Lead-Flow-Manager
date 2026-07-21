/**
 * DB-polled durable worker for Prospect website enrichment jobs (Phase 2).
 */

import crypto from "crypto";
import {
  claimNextEnrichmentJob,
  processClaimedEnrichmentJob,
  recoverStaleEnrichmentJobs,
} from "./prospectEnrichmentService";

const POLL_INTERVAL_MS = 5_000;
const workerId = `enrich-${process.pid}-${crypto.randomBytes(3).toString("hex")}`;

let workerTimer: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;

async function tick(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    await recoverStaleEnrichmentJobs();
    const job = await claimNextEnrichmentJob(workerId);
    if (job) {
      await processClaimedEnrichmentJob(job, workerId);
    }
  } catch (err) {
    console.error("[ProspectEnrichment] worker tick error:", err);
  } finally {
    isRunning = false;
  }
}

function scheduleNext(): void {
  workerTimer = setTimeout(() => {
    void tick().finally(scheduleNext);
  }, POLL_INTERVAL_MS);
}

export function startProspectEnrichmentWorker(): void {
  if (workerTimer) return;
  console.info(
    JSON.stringify({
      event: "prospect_enrichment_worker_started",
      workerId,
      pollIntervalMs: POLL_INTERVAL_MS,
      at: new Date().toISOString(),
    }),
  );
  void tick().finally(scheduleNext);
}

export function stopProspectEnrichmentWorker(): void {
  if (workerTimer) {
    clearTimeout(workerTimer);
    workerTimer = null;
  }
}
