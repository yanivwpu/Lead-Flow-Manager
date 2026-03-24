import { Worker, Job } from "bullmq";
import { QUEUE_NAME, WORKER_CONCURRENCY, createRedisConnection, type InboxJobPayload } from "./queue";
import { channelService } from "./channelService";
import { registerChannelAdapters } from "./channelAdapters";

registerChannelAdapters();

async function processMessage(job: Job<InboxJobPayload>): Promise<void> {
  const { userId, channel, channelContactId, contactName, content, contentType, mediaUrl, externalMessageId } = job.data;
  console.log(`[Worker] Processing queued job ${job.id} (channel: ${channel}, user: ${userId}, attempt: ${job.attemptsMade + 1})`);
  await channelService.processIncomingMessage({
    userId,
    channel,
    channelContactId,
    contactName,
    content,
    contentType,
    mediaUrl,
    externalMessageId,
  });
  console.log(`[Worker] Job ${job.id} completed successfully`);
}

const connection = createRedisConnection();

const worker = new Worker<InboxJobPayload>(
  QUEUE_NAME,
  processMessage,
  {
    connection,
    concurrency: WORKER_CONCURRENCY,
    removeOnComplete: { count: 0 },
    removeOnFail: { count: 1000 },
    drainDelay: 60000,
    stalledInterval: 300000,
  }
);

// Track consecutive errors to implement our own circuit breaker.
// IORedis resets its internal counter on every successful TCP connect, so the
// retryStrategy alone cannot accumulate enough delay.  After MAX_ERRORS
// consecutive worker errors we close the worker entirely.  This completely
// stops Redis request consumption until the next deployment.
const MAX_ERRORS = 8;
let consecutiveErrors = 0;

worker.on("completed", () => {
  consecutiveErrors = 0;
});

worker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err.message);
});

worker.on("error", (err) => {
  consecutiveErrors++;
  console.error(`[Worker] Error #${consecutiveErrors}: ${err.message}`);
  if (consecutiveErrors >= MAX_ERRORS) {
    console.error(`[Worker] ${MAX_ERRORS} consecutive Redis errors — closing worker to preserve Upstash quota. Core inbox runs directly to DB and is unaffected.`);
    worker.close().catch(() => {});
  }
});

worker.on("stalled", (jobId) => {
  console.warn(`[Worker] Job ${jobId} stalled`);
});

console.log(`[Worker] Background job worker started (concurrency: ${WORKER_CONCURRENCY}, circuit-breaker: ${MAX_ERRORS} errors) — core inbox uses direct DB path`);

async function shutdown() {
  console.log("[Worker] Shutting down...");
  await worker.close();
  await connection.quit();
  console.log("[Worker] Shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
