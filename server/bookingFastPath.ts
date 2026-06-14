import type { Contact, Conversation } from "@shared/schema";
import { detectHighConfidenceBookingIntent, bookingIntentRouteLabel } from "@shared/bookingIntent";
import { detectSellerConsultationBookingIntent } from "@shared/sellerIntent";
import { storage } from "./storage";
import { channelService } from "./channelService";
import {
  injectRgeSchedulingTemplateVariables,
  resolveRgeCustomerSchedulingUrl,
} from "./rgeCustomerSchedulingUrl";
import { withAutomationSendGuard } from "./automationSendGuard";
import { logBookingReplyTrace } from "./bookingReplyTrace";
import type { Channel } from "@shared/schema";

const W3_CALENDLY_SENT_AT_KEY = "_w3CalendlyBookingSentAt";
const BOOKING_FAST_PATH_THROTTLE_MS = 60_000;

function firstName(contact: Contact): string {
  const raw = (contact.name || "").trim() || "there";
  return raw.split(/\s+/)[0] || "there";
}

function buildFallbackBookingReply(schedulingUrl: string, contact: Contact): string {
  const name = firstName(contact);
  return `Hi ${name}! Sure — you can pick a time here: ${schedulingUrl}`;
}

async function loadScheduleShowingTemplateBody(userId: string): Promise<string | null> {
  const row = await storage.getUserTemplateDataByKey(
    userId,
    "realtor-growth-engine",
    "message_templates",
    "msg_schedule_showing",
  );
  const body = (row?.definition as { body?: string } | undefined)?.body;
  return typeof body === "string" && body.trim() ? body.trim() : null;
}

function interpolateTemplateBody(body: string, contact: Contact, schedulingUrl: string): string {
  const cf = (contact.customFields as Record<string, unknown>) || {};
  const city = String(cf.city ?? cf.City ?? "your area");
  let out = body
    .replace(/\{\{\s*firstName\s*\}\}/gi, firstName(contact))
    .replace(/\{\{\s*city\s*\}\}/gi, city);
  return injectRgeSchedulingTemplateVariables(out, schedulingUrl);
}

function readRecentBookingSentAt(contact: Contact): number {
  const raw = (contact.customFields as Record<string, unknown> | undefined)?.[W3_CALENDLY_SENT_AT_KEY];
  if (typeof raw === "string") return Date.parse(raw);
  if (typeof raw === "number") return raw;
  return NaN;
}

export type BookingFastPathParams = {
  userId: string;
  contact: Contact;
  conversation: Conversation;
  inboundText: string;
  messageId?: string;
  messageAt?: Date | string;
  channel: Channel;
};

/**
 * Immediate Calendly scheduling reply for high-confidence booking/showing intent.
 * Does not wait for buyer preference debounce, inventory matching, or chatbot delay nodes.
 */
export async function tryBookingFastPathReply(params: BookingFastPathParams): Promise<{
  sent: boolean;
  reason: string;
}> {
  const {
    userId,
    contact,
    conversation,
    inboundText,
    messageId,
    messageAt,
    channel,
  } = params;

  const messageAtIso =
    messageAt instanceof Date
      ? messageAt.toISOString()
      : typeof messageAt === "string"
        ? messageAt
        : new Date().toISOString();
  const intentDetectedAt = new Date().toISOString();

  logBookingReplyTrace({
    stage: "message_received",
    userId,
    contactId: contact.id,
    conversationId: conversation.id,
    messageId,
    messageAt: messageAtIso,
    route: bookingIntentRouteLabel(),
  });

  if (!detectHighConfidenceBookingIntent(inboundText) && !detectSellerConsultationBookingIntent(inboundText)) {
    logBookingReplyTrace({
      stage: "skipped",
      userId,
      contactId: contact.id,
      conversationId: conversation.id,
      messageId,
      reason: "no_booking_intent",
    });
    return { sent: false, reason: "no_booking_intent" };
  }

  logBookingReplyTrace({
    stage: "intent_detected",
    userId,
    contactId: contact.id,
    conversationId: conversation.id,
    messageId,
    messageAt: messageAtIso,
    intentDetectedAt,
    route: bookingIntentRouteLabel(),
  });

  const queuedAt = new Date().toISOString();
  logBookingReplyTrace({
    stage: "queued",
    userId,
    contactId: contact.id,
    conversationId: conversation.id,
    messageId,
    intentDetectedAt,
    queuedAt,
    route: bookingIntentRouteLabel(),
  });

  const jobStartedAt = new Date().toISOString();
  logBookingReplyTrace({
    stage: "job_started",
    userId,
    contactId: contact.id,
    conversationId: conversation.id,
    messageId,
    queuedAt,
    jobStartedAt,
    route: bookingIntentRouteLabel(),
  });

  const lastSentMs = readRecentBookingSentAt(contact);
  if (!Number.isNaN(lastSentMs) && Date.now() - lastSentMs < BOOKING_FAST_PATH_THROTTLE_MS) {
    logBookingReplyTrace({
      stage: "skipped",
      userId,
      contactId: contact.id,
      conversationId: conversation.id,
      messageId,
      reason: "recent_booking_link_sent",
      latencyMs: Date.now() - Date.parse(messageAtIso),
    });
    return { sent: false, reason: "recent_booking_link_sent" };
  }

  const resolved = await resolveRgeCustomerSchedulingUrl(userId, contact.id);
  if (!resolved.url) {
    logBookingReplyTrace({
      stage: "skipped",
      userId,
      contactId: contact.id,
      conversationId: conversation.id,
      messageId,
      reason: "scheduling_url_missing",
      schedulingUrlSource: resolved.source,
    });
    return { sent: false, reason: "scheduling_url_missing" };
  }

  const templateBody = await loadScheduleShowingTemplateBody(userId);
  const replyGeneratedAt = new Date().toISOString();
  const content = templateBody
    ? interpolateTemplateBody(templateBody, contact, resolved.url)
    : buildFallbackBookingReply(resolved.url, contact);

  logBookingReplyTrace({
    stage: "reply_generated",
    userId,
    contactId: contact.id,
    conversationId: conversation.id,
    messageId,
    replyGeneratedAt,
    schedulingUrlSource: resolved.source,
    route: bookingIntentRouteLabel(),
    latencyMs: Date.now() - Date.parse(messageAtIso),
  });

  const dedupKey = `booking_fast:${conversation.id}:${messageId || inboundText.slice(0, 80)}`;
  const guarded = await withAutomationSendGuard(
    {
      userId,
      contactId: contact.id,
      conversationId: conversation.id,
      channel,
      source: "booking_flow",
      idempotencyKey: dedupKey,
    },
    async () =>
      channelService.sendMessage({
        userId,
        contactId: contact.id,
        content,
        contentType: "text",
        forceChannel: channel,
        suppressFallback: true,
        enforceWhatsAppCustomerServiceWindow: false,
      }),
  );

  if (!guarded.ok || !guarded.result?.success) {
    logBookingReplyTrace({
      stage: "failed",
      userId,
      contactId: contact.id,
      conversationId: conversation.id,
      messageId,
      reason: guarded.ok ? guarded.result.error || "send_failed" : guarded.reason,
    });
    return { sent: false, reason: guarded.ok ? guarded.result.error || "send_failed" : guarded.reason };
  }

  const prev = (contact.customFields as Record<string, unknown> | null) || {};
  await storage
    .updateContact(
      contact.id,
      {
        customFields: {
          ...prev,
          [W3_CALENDLY_SENT_AT_KEY]: new Date().toISOString(),
        },
        tag: contact.tag === "Do Not Contact" ? contact.tag : "Appointment Requested",
      },
      { skipAutomationHooks: true },
    )
    .catch(() => {});

  const replySentAt = new Date().toISOString();
  logBookingReplyTrace({
    stage: "reply_sent",
    userId,
    contactId: contact.id,
    conversationId: conversation.id,
    messageId,
    messageAt: messageAtIso,
    intentDetectedAt,
    queuedAt,
    jobStartedAt,
    replyGeneratedAt,
    replySentAt,
    schedulingUrlSource: resolved.source,
    route: bookingIntentRouteLabel(),
    latencyMs: Date.now() - Date.parse(messageAtIso),
  });

  return { sent: true, reason: "sent" };
}

/** Fire-and-forget wrapper — never blocks inbound webhook ACK. */
export function queueBookingFastPathReply(params: BookingFastPathParams): void {
  setImmediate(() => {
    void tryBookingFastPathReply(params).catch((err) => {
      logBookingReplyTrace({
        stage: "failed",
        userId: params.userId,
        contactId: params.contact.id,
        conversationId: params.conversation.id,
        messageId: params.messageId,
        reason: err instanceof Error ? err.message : String(err),
      });
    });
  });
}
