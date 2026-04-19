import { storage } from "./storage";
import { executeFlowFromJob } from "./chatbotEngine";

const POLL_INTERVAL_MS = 7_000; // poll every 7 seconds
const BATCH_SIZE = 20;

let workerTimer: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;

async function processDueJobs(): Promise<void> {
  if (isRunning) return; // prevent overlap if processing takes > poll interval
  isRunning = true;

  try {
    const jobs = await storage.claimPendingFlowJobs(BATCH_SIZE);
    if (jobs.length === 0) {
      return;
    }

    console.log(`[FlowJobWorker] Processing ${jobs.length} due job(s)`);

    await Promise.allSettled(
      jobs.map(async (job) => {
        try {
          console.log(
            `[FlowJobWorker] Executing job id=${job.id} flowId=${job.flowId} nodeId=${job.nodeId} runAt=${job.runAt.toISOString()}`
          );

          const flow = await storage.getChatbotFlow(job.flowId);
          if (!flow) {
            console.warn(`[FlowJobWorker] Flow ${job.flowId} not found — marking job ${job.id} as failed`);
            await storage.markFlowJobFailed(job.id, `Flow ${job.flowId} not found`);
            return;
          }

          if (!flow.isActive) {
            console.warn(`[FlowJobWorker] Flow ${job.flowId} is inactive — skipping job ${job.id}`);
            await storage.markFlowJobFailed(job.id, `Flow ${job.flowId} is inactive`);
            return;
          }

          const ctx = job.payload as {
            userId: string;
            contactId: string;
            conversationId: string;
            channel: string;
            message: string;
            isNewConversation: boolean;
          };

          await executeFlowFromJob(flow, ctx, job.nodeId);

          await storage.markFlowJobCompleted(job.id);
          console.log(`[FlowJobWorker] ✅ Job ${job.id} completed`);
        } catch (err: any) {
          console.error(`[FlowJobWorker] ❌ Job ${job.id} failed: ${err.message}`);
          try {
            await storage.markFlowJobFailed(job.id, err.message || "Unknown error");
          } catch (markErr: any) {
            console.error(`[FlowJobWorker] Failed to mark job ${job.id} as failed: ${markErr.message}`);
          }
        }
      })
    );
  } catch (err: any) {
    console.error(`[FlowJobWorker] Poll error: ${err.message}`);
  } finally {
    isRunning = false;
  }
}

function scheduleNext(): void {
  workerTimer = setTimeout(async () => {
    await processDueJobs();
    scheduleNext();
  }, POLL_INTERVAL_MS);
}

export function startFlowJobWorker(): void {
  console.log(`[FlowJobWorker] Started — polling every ${POLL_INTERVAL_MS / 1000}s`);
  scheduleNext();
}

export function stopFlowJobWorker(): void {
  if (workerTimer) {
    clearTimeout(workerTimer);
    workerTimer = null;
  }
  console.log("[FlowJobWorker] Stopped");
}
