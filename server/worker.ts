import { Worker, Job } from "bullmq";
import { QUEUE_NAME, WORKER_CONCURRENCY, createRedisConnection, type InboxJobPayload } from "./queue";
import { channelService } from "./channelService";
import { registerChannelAdapters } from "./channelAdapters";
import { storage } from "./storage";

registerChannelAdapters();

async function processMessage(job: Job<InboxJobPayload>): Promise<void> {
  const { userId, channel, channelContactId, contactName, content, contentType, mediaUrl, externalMessageId } = job.data;

  console.log(`[Worker] Processing job ${job.id} (channel: ${channel}, user: ${userId}, attempt: ${job.attemptsMade + 1})`);

  if (externalMessageId) {
    const existing = await storage.getMessageByExternalId(externalMessageId);
    if (existing) {
      console.log(`[Worker] Skipping duplicate message: ${externalMessageId}`);
      return;
    }
  }

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
  }
);

worker.on("completed", (job) => {
  console.log(`[Worker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts?.attempts}):`, err.message);
  console.error(`[Worker] Failed job data:`, JSON.stringify(job?.data));
  console.error(`[Worker] Error stack:`, err.stack);
});

worker.on("error", (err) => {
  console.error("[Worker] Worker error:", err.message);
});

worker.on("stalled", (jobId) => {
  console.warn(`[Worker] Job ${jobId} stalled`);
});

console.log(`[Worker] Unified inbox worker started (concurrency: ${WORKER_CONCURRENCY})`);

async function shutdown() {
  console.log("[Worker] Shutting down...");
  await worker.close();
  await connection.quit();
  console.log("[Worker] Shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
