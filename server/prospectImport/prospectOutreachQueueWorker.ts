/**
 * DB-polled worker for controlled prospect outreach queue.
 * Matches flowJobWorker pattern — gradual sends, pause-aware, crash-safe.
 */

import {
  claimNextDueQueueItem,
  listWorkspaceIdsWithDueQueue,
  processClaimedQueueItem,
  recoverStuckSendingItems,
} from "./prospectOutreachQueueService";
import { prospectBulkOutreachLog } from "@shared/prospectBulkOutreach";

const POLL_INTERVAL_MS = 8_000;
const MAX_PER_TICK = 1; // conservative: one send per tick across a workspace

let workerTimer: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;

async function processDueOutreach(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    const recovered = await recoverStuckSendingItems();
    if (recovered > 0) {
      console.info(
        JSON.stringify(
          prospectBulkOutreachLog("send_failed", {
            status: "failed",
            reason: "recovered_stuck_sending",
            attempts: recovered,
          }),
        ),
      );
    }

    const workspaceIds = await listWorkspaceIdsWithDueQueue();
    for (const workspaceUserId of workspaceIds) {
      for (let i = 0; i < MAX_PER_TICK; i++) {
        const item = await claimNextDueQueueItem(workspaceUserId);
        if (!item) break;
        await processClaimedQueueItem(item);
      }
    }
  } catch (err) {
    console.error("[ProspectBulkOutreach] queue worker tick error:", err);
  } finally {
    isRunning = false;
  }
}

function scheduleNext(): void {
  workerTimer = setTimeout(() => {
    void processDueOutreach().finally(scheduleNext);
  }, POLL_INTERVAL_MS);
}

export function startProspectOutreachQueueWorker(): void {
  if (workerTimer) return;
  console.info(
    JSON.stringify(
      prospectBulkOutreachLog("queue_resumed", {
        status: "worker_started",
        reason: "poll_interval_ms_" + POLL_INTERVAL_MS,
      }),
    ),
  );
  scheduleNext();
}

export function stopProspectOutreachQueueWorker(): void {
  if (workerTimer) {
    clearTimeout(workerTimer);
    workerTimer = null;
  }
}
