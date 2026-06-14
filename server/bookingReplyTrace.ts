export type BookingReplyTraceStage =
  | "message_received"
  | "intent_detected"
  | "queued"
  | "job_started"
  | "reply_generated"
  | "reply_sent"
  | "skipped"
  | "failed";

export type BookingReplyTraceEvent = {
  stage: BookingReplyTraceStage;
  contactId: string;
  conversationId?: string;
  messageId?: string;
  userId?: string;
  messageAt?: string;
  intentDetectedAt?: string;
  queuedAt?: string;
  jobStartedAt?: string;
  replyGeneratedAt?: string;
  replySentAt?: string;
  route?: string;
  reason?: string;
  schedulingUrlSource?: string;
  latencyMs?: number;
};

const LOG_TAG = "[BookingReplyTrace]";

export function logBookingReplyTrace(event: BookingReplyTraceEvent): void {
  console.warn(
    LOG_TAG,
    JSON.stringify({
      ...event,
      loggedAt: new Date().toISOString(),
    }),
  );
}
