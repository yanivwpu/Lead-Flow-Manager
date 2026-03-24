import { Queue, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import type { Channel } from "@shared/schema";

export const QUEUE_NAME = "unified-inbox";

export const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "5", 10);

export interface InboxJobPayload {
  userId: string;
  channel: Channel;
  channelContactId: string;
  contactName?: string;
  content: string;
  contentType?: string;
  mediaUrl?: string;
  externalMessageId?: string;
}

function parseRedisUrl(raw: string): string {
  let url = raw.trim();
  const match = url.match(/(rediss?:\/\/.+)/);
  if (match) {
    url = match[1];
  }
  if (url.includes("upstash.io") && url.startsWith("redis://")) {
    url = url.replace("redis://", "rediss://");
  }
  return url;
}

export function createRedisConnection(): IORedis {
  const rawUrl = process.env.REDIS_URL;
  if (!rawUrl) {
    throw new Error("REDIS_URL environment variable is required for message queue");
  }

  const redisUrl = parseRedisUrl(rawUrl);
  console.log(`[Queue] Connecting to Redis at ${redisUrl.replace(/:[^:@]+@/, ':***@')}`);

  const useTls = redisUrl.startsWith("rediss://") || redisUrl.includes("upstash.io");

  // Persistent counter that survives across reconnect cycles.
  // IORedis resets `times` to 0 after every successful TCP connect (even when
  // AUTH is immediately rejected), so retryStrategy(times) alone can never
  // accumulate enough delay. We count quota errors independently via the
  // 'error' listener and stop all retries once the threshold is reached.
  let quotaFailures = 0;
  const MAX_QUOTA_FAILURES = 10;

  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: useTls ? {} : undefined,
    retryStrategy(times: number) {
      if (quotaFailures >= MAX_QUOTA_FAILURES) {
        console.error(`[Queue] Redis quota exceeded ${quotaFailures} times — stopping reconnects to preserve Upstash limit`);
        return null; // tell IORedis to give up
      }
      // Exponential backoff: 1 s → 2 s → 4 s … capped at 30 s
      const delay = Math.min(1000 * Math.pow(2, times - 1), 30000);
      console.log(`[Queue] Redis reconnecting in ${Math.round(delay / 1000)}s (attempt ${times}, quota failures: ${quotaFailures})`);
      return delay;
    },
  });

  connection.on("error", (err) => {
    if (err.message?.includes("max requests limit exceeded")) {
      quotaFailures++;
      if (quotaFailures < MAX_QUOTA_FAILURES) {
        console.warn(`[Queue] Upstash quota error #${quotaFailures}/${MAX_QUOTA_FAILURES}: ${err.message}`);
      }
    } else {
      console.error("[Queue] Redis connection error:", err.message);
    }
  });

  connection.on("connect", () => {
    console.log("[Queue] Redis connected");
  });

  return connection;
}

let _connection: IORedis | null = null;
let _queue: Queue | null = null;
let _queueEvents: QueueEvents | null = null;

export function getRedisConnection(): IORedis {
  if (!_connection) {
    _connection = createRedisConnection();
  }
  return _connection;
}

export function getQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    });
  }
  return _queue;
}

export function getQueueEvents(): QueueEvents {
  if (!_queueEvents) {
    _queueEvents = new QueueEvents(QUEUE_NAME, {
      connection: getRedisConnection(),
    });
  }
  return _queueEvents;
}

export async function addInboxJob(payload: InboxJobPayload): Promise<void> {
  const queue = getQueue();
  const jobId = payload.externalMessageId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await queue.add("process-message", payload, {
    jobId,
  });

  console.log(`[Queue] Job added: ${jobId} (channel: ${payload.channel}, user: ${payload.userId})`);
}

export async function processInboxJobDirectly(payload: InboxJobPayload): Promise<void> {
  console.log(`[Queue] Direct processing (queue bypass) — channel: ${payload.channel}, user: ${payload.userId}, externalId: ${payload.externalMessageId}`);
  const { channelService } = await import("./channelService");
  await channelService.processIncomingMessage({
    userId: payload.userId,
    channel: payload.channel,
    channelContactId: payload.channelContactId,
    contactName: payload.contactName,
    content: payload.content,
    contentType: payload.contentType,
    mediaUrl: payload.mediaUrl,
    externalMessageId: payload.externalMessageId,
  });
  console.log(`[Queue] Direct processing complete — channel: ${payload.channel}, user: ${payload.userId}`);
}

export async function addInboxJobWithFallback(payload: InboxJobPayload): Promise<void> {
  try {
    await addInboxJob(payload);
  } catch (queueErr) {
    console.warn(`[Queue] Redis unavailable, falling back to direct processing — channel: ${payload.channel}, error: ${(queueErr as Error).message}`);
    await processInboxJobDirectly(payload);
  }
}

export async function closeQueue(): Promise<void> {
  if (_queueEvents) {
    await _queueEvents.close();
    _queueEvents = null;
  }
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
  if (_connection) {
    await _connection.quit();
    _connection = null;
  }
}
