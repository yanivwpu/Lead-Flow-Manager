import { storage } from "./storage";
import { executeFlowFromJob } from "./chatbotEngine";
import { processNoReplyJob } from "./automationNoReply";
import { processAutomationTimerJob } from "./automationTimerHandlers";

const POLL_INTERVAL_MS = 7_000; // poll every 7 seconds
const BATCH_SIZE = 20;

let workerTimer: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;

async function processDueJobs(): Promise<void> {
  if (isRunning) return; // prevent overlap if processing takes > poll interval
  isRunning = true;

  let flowClaimed = 0;
  let flowCompleted = 0;
  let flowFailed = 0;
  let flowSkipped = 0;
  let nrClaimed = 0;
  let nrCompleted = 0;
  let nrFailed = 0;
  let timerClaimed = 0;
  let timerCompleted = 0;
  let timerFailed = 0;

  try {
    const stuckFlow = await storage.recoverStuckFlowJobs();
    const stuckNr = await storage.recoverStuckNoReplyJobs();
    const stuckT = await storage.recoverStuckAutomationTimerJobs();
    if (stuckFlow.requeued + stuckFlow.failedTerminal + stuckNr.requeued + stuckNr.failedTerminal + stuckT.requeued + stuckT.failedTerminal > 0) {
      console.log(
        JSON.stringify({
          tag: "[AutomationWorkerRecovery]",
          flowJobs: stuckFlow,
          noReplyJobs: stuckNr,
          timerJobs: stuckT,
        })
      );
    }

    const jobs = await storage.claimPendingFlowJobs(BATCH_SIZE);
    flowClaimed = jobs.length;
    if (jobs.length > 0) {
      console.log(`[FlowJobWorker] Processing ${jobs.length} due flow job(s)`);
    }

    await Promise.allSettled(
      jobs.map(async (job) => {
        try {
          console.log(
            `[FlowJobWorker] Executing flow job id=${job.id} flowId=${job.flowId} nodeId=${job.nodeId} runAt=${job.runAt.toISOString()}`
          );

          const contact = await storage.getContact(job.contactId);
          let snapshotAt = job.snapshotLastInboundAt ?? null;
          if (!snapshotAt) {
            const raw = (job.payload as any)?._stopReplySnapshot?.lastInboundAt;
            if (typeof raw === "string") {
              const d = Date.parse(raw);
              if (!Number.isNaN(d)) snapshotAt = new Date(d);
            }
          }
          if (snapshotAt && contact?.lastIncomingAt) {
            if (contact.lastIncomingAt.getTime() > snapshotAt.getTime()) {
              console.log(
                JSON.stringify({
                  tag: "[FlowJobWorker]",
                  jobId: job.id,
                  skipped: true,
                  reason: "stop_on_reply_new_inbound",
                })
              );
              await storage.markFlowJobSkipped(job.id, "stop_on_reply_new_inbound");
              flowSkipped++;
              return;
            }
          }

          const flow = await storage.getChatbotFlow(job.flowId);
          if (!flow) {
            console.warn(`[FlowJobWorker] Flow ${job.flowId} not found — marking job ${job.id} as failed`);
            await storage.markFlowJobFailed(job.id, `Flow ${job.flowId} not found`);
            flowFailed++;
            return;
          }

          if (!flow.isActive) {
            console.warn(`[FlowJobWorker] Flow ${job.flowId} is inactive — skipping job ${job.id}`);
            await storage.markFlowJobFailed(job.id, `Flow ${job.flowId} is inactive`);
            flowFailed++;
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
          flowCompleted++;
          console.log(`[FlowJobWorker] ✅ Flow job ${job.id} completed`);
        } catch (err: any) {
          console.error(`[FlowJobWorker] ❌ Flow job ${job.id} failed: ${err.message}`);
          flowFailed++;
          try {
            await storage.markFlowJobFailed(job.id, err.message || "Unknown error");
          } catch (markErr: any) {
            console.error(`[FlowJobWorker] Failed to mark job ${job.id} as failed: ${markErr.message}`);
          }
        }
      })
    );

    const nrJobs = await storage.claimPendingNoReplyJobs(Math.max(5, Math.floor(BATCH_SIZE / 2)));
    nrClaimed = nrJobs.length;
    if (nrJobs.length > 0) {
      console.log(`[FlowJobWorker] Processing ${nrJobs.length} no-reply job(s)`);
    }
    await Promise.allSettled(
      nrJobs.map(async (job) => {
        try {
          await processNoReplyJob(job);
          nrCompleted++;
        } catch (err: any) {
          nrFailed++;
          console.error(`[FlowJobWorker] ❌ No-reply job ${job.id} failed: ${err.message}`);
          try {
            await storage.markNoReplyJobFailed(job.id, err.message || "Unknown error");
          } catch (markErr: any) {
            console.error(`[FlowJobWorker] markNoReplyJobFailed error: ${markErr.message}`);
          }
        }
      })
    );

    const timerJobs = await storage.claimPendingAutomationTimerJobs(Math.max(5, Math.floor(BATCH_SIZE / 2)));
    timerClaimed = timerJobs.length;
    if (timerJobs.length > 0) {
      console.log(`[FlowJobWorker] Processing ${timerJobs.length} automation timer job(s)`);
    }
    await Promise.allSettled(
      timerJobs.map(async (job) => {
        try {
          await processAutomationTimerJob(job);
          timerCompleted++;
        } catch (err: any) {
          timerFailed++;
          console.error(`[FlowJobWorker] ❌ Timer job ${job.id} failed: ${err.message}`);
          try {
            await storage.markAutomationTimerJobFailed(job.id, err.message || "Unknown error");
          } catch (markErr: any) {
            console.error(`[FlowJobWorker] markAutomationTimerJobFailed error: ${markErr.message}`);
          }
        }
      })
    );

    if (flowClaimed || nrClaimed || timerClaimed) {
      console.log(
        JSON.stringify({
          tag: "[AutomationWorkerTick]",
          flow: { claimed: flowClaimed, completed: flowCompleted, failed: flowFailed, skipped: flowSkipped },
          noReply: { claimed: nrClaimed, completed: nrCompleted, failed: nrFailed },
          timers: { claimed: timerClaimed, completed: timerCompleted, failed: timerFailed },
        })
      );
    }
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
