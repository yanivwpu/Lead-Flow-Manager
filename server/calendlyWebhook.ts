import crypto from "crypto";
import type { Request, Response } from "express";
import { eq, and } from "drizzle-orm";
import { appointments, chats } from "@shared/schema";
import { db } from "../drizzle/db";
import {
  decryptCredential,
  isEncrypted,
  findOrCreateLegacyCalendlyWorkflowChat,
  legacyCalendlyChatStorageKey,
  type WhatsAppMessage,
} from "./userTwilio";
import { storage } from "./storage";
import { dispatchInboundMessagingAutomation } from "./automationEventDispatcher";
import { subscriptionService } from "./subscriptionService";
import { notifyUser } from "./presence";
import { calendlyGetWebhookSubscription } from "./calendlyApi";
import { encryptIntegrationConfig } from "./integrationConfigCrypto";

const DECRYPT_KEYS = [
  "accessToken",
  "webhookSigningKey",
  "secretKey",
  "privateKey",
  "clientSecret",
  "refreshToken",
  "apiKey",
  "webhookSecret",
  "consumerKey",
  "consumerSecret",
] as const;

function decryptIntegrationConfigLocal(config: Record<string, unknown>): Record<string, unknown> {
  const out = { ...config };
  for (const key of DECRYPT_KEYS) {
    const v = out[key];
    if (typeof v === "string" && isEncrypted(v)) {
      out[key] = decryptCredential(v);
    }
  }
  return out;
}

function parseCalendlyWebhookSignature(signatureHeader: string | undefined): { timestamp: string; v1s: string[] } {
  let t = "";
  const v1s: string[] = [];
  if (!signatureHeader) return { timestamp: t, v1s };
  for (const part of signatureHeader.split(",")) {
    const p = part.trim();
    if (p.startsWith("t=")) t = p.slice(2);
    else if (p.startsWith("v1=")) v1s.push(p.slice(3));
  }
  return { timestamp: t, v1s };
}

function computeCalendlyWebhookSignature(rawBody: Buffer, signingKey: string, timestamp: string): string {
  const payload = Buffer.from(`${timestamp}.${rawBody.toString("utf8")}`, "utf8");
  return crypto.createHmac("sha256", signingKey).update(payload).digest("hex");
}

function calendlySignatureDiagnostics(
  rawBody: Buffer | undefined,
  signingKey: string,
  signatureHeader: string | undefined
): {
  signatureTimestampExists: boolean;
  receivedSignaturePrefix: string | null;
  computedSignaturePrefix: string | null;
} {
  const { timestamp, v1s } = parseCalendlyWebhookSignature(signatureHeader);
  const received = v1s[0] || "";
  const computed = rawBody?.length && signingKey && timestamp
    ? computeCalendlyWebhookSignature(rawBody, signingKey, timestamp)
    : "";
  return {
    signatureTimestampExists: Boolean(timestamp),
    receivedSignaturePrefix: received ? received.slice(0, 12) : null,
    computedSignaturePrefix: computed ? computed.slice(0, 12) : null,
  };
}

/** Calendly sends `Calendly-Webhook-Signature: t=TIMESTAMP,v1=HEX` — HMAC-SHA256 of `t + '.' + rawBody`. */
export function verifyCalendlyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  signingKey: string
): boolean {
  if (!signatureHeader || !signingKey || !rawBody?.length) return false;
  const { timestamp, v1s } = parseCalendlyWebhookSignature(signatureHeader);
  if (!timestamp || v1s.length === 0) return false;
  const expectedHex = computeCalendlyWebhookSignature(rawBody, signingKey, timestamp);
  const expectedBuf = Buffer.from(expectedHex, "hex");
  for (const v1 of v1s) {
    try {
      const got = Buffer.from(v1, "hex");
      if (got.length === expectedBuf.length && crypto.timingSafeEqual(got, expectedBuf)) return true;
    } catch {
      /* length mismatch */
    }
  }
  return false;
}

function formatBookingTime(iso: string | undefined): string {
  if (!iso) return "TBD";
  try {
    return new Date(iso).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return iso;
  }
}

function logCalendlyWebhook(event: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ tag: "[CalendlyWebhook]", event, ...data }));
}

function readTrackingUtmContactId(tracking: unknown): string | undefined {
  if (!tracking || typeof tracking !== "object") return undefined;
  const t = tracking as Record<string, unknown>;
  const raw = t.utm_content ?? t.utmContent;
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  return raw.trim();
}

function readTrackingString(tracking: unknown, snakeKey: string, camelKey: string): string | undefined {
  if (!tracking || typeof tracking !== "object") return undefined;
  const t = tracking as Record<string, unknown>;
  const raw = t[snakeKey] ?? t[camelKey];
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  return raw.trim();
}

function extractCalendlyBookingPayload(body: Record<string, unknown>): {
  email: string;
  name: string;
  eventTypeName: string;
  startTime?: string;
  endTime?: string;
  inviteeUri?: string;
  scheduledEventUri?: string;
  externalMessageId: string;
  utmContactId?: string;
  utmConversationId?: string;
  utmTrackingToken?: string;
  meetingLink?: string;
} | null {
  const payload = (body.payload as Record<string, unknown>) || body;
  const invitee = (payload.invitee as Record<string, unknown>) || payload;
  const emailRaw =
    (invitee.email as string) ||
    (payload.email as string) ||
    ((invitee as { text_reminder_number?: string }).text_reminder_number as string);
  const email = String(emailRaw || "")
    .trim()
    .toLowerCase();
  if (!email || !email.includes("@")) return null;

  const first = (invitee.first_name as string) || "";
  const last = (invitee.last_name as string) || "";
  const name =
    String((invitee.name as string) || (payload.name as string) || `${first} ${last}`.trim() || email.split("@")[0]).trim();

  const scheduled =
    (payload.scheduled_event as Record<string, unknown>) ||
    (invitee.scheduled_event as Record<string, unknown>) ||
    (payload.event as Record<string, unknown>);
  const eventType = (payload.event_type as Record<string, unknown>) || invitee;
  const eventTypeName = String(
    scheduled?.name || eventType?.name || (payload.name as string) || "Meeting"
  ).trim();

  const startTime = scheduled?.start_time as string | undefined;
  const endTime = scheduled?.end_time as string | undefined;
  const inviteeUri =
    typeof invitee.uri === "string"
      ? invitee.uri
      : typeof payload.uri === "string"
        ? payload.uri
        : undefined;
  const scheduledEventUri = typeof scheduled?.uri === "string" ? scheduled.uri : undefined;
  const location = (scheduled?.location as Record<string, unknown>) || (payload.location as Record<string, unknown>);
  const meetingLink =
    (typeof location?.join_url === "string" && location.join_url) ||
    (typeof location?.url === "string" && location.url) ||
    (typeof payload.join_url === "string" && payload.join_url) ||
    (typeof payload.reschedule_url === "string" && payload.reschedule_url) ||
    inviteeUri ||
    scheduledEventUri;

  const tracking =
    (payload.tracking as Record<string, unknown>) ||
    (invitee.tracking as Record<string, unknown>) ||
    (scheduled?.tracking as Record<string, unknown>);
  const utmContactId = readTrackingUtmContactId(tracking);
  const utmConversationId = readTrackingString(tracking, "utm_campaign", "utmCampaign");
  const utmTrackingToken = readTrackingString(tracking, "utm_term", "utmTerm");

  const externalMessageId =
    (scheduledEventUri as string | undefined) ||
    (inviteeUri as string | undefined) ||
    (invitee.uri as string) ||
    (payload.uri as string) ||
    `${email}:${startTime || body.event || "calendly"}`;

  return {
    email,
    name,
    eventTypeName,
    startTime,
    endTime,
    inviteeUri,
    scheduledEventUri,
    externalMessageId: String(externalMessageId).slice(0, 500),
    utmContactId,
    utmConversationId,
    utmTrackingToken,
    meetingLink,
  };
}

async function recoverCalendlySigningKeyFromSubscription(params: {
  userId: string;
  integrationId: string;
  config: Record<string, unknown>;
}): Promise<string> {
  const token = typeof params.config.accessToken === "string" ? params.config.accessToken.trim() : "";
  const subscriptionUri =
    typeof params.config.calendlyWebhookSubscriptionUri === "string"
      ? params.config.calendlyWebhookSubscriptionUri.trim()
      : "";
  if (!token || !subscriptionUri) {
    logCalendlyWebhook("signing_key_recovery_skipped", {
      userId: params.userId,
      integrationId: params.integrationId,
      tokenExists: Boolean(token),
      subscriptionUriExists: Boolean(subscriptionUri),
    });
    return "";
  }

  const sub = await calendlyGetWebhookSubscription(token, subscriptionUri);
  const signingKey = sub.data?.resource?.signing_key || "";
  logCalendlyWebhook("signing_key_recovery_result", {
    userId: params.userId,
    integrationId: params.integrationId,
    status: sub.status,
    ok: sub.ok,
    signingKeyRecovered: Boolean(signingKey),
    subscriptionState: sub.data?.resource?.state || null,
  });
  if (!signingKey) return "";

  await storage.updateIntegration(params.integrationId, {
    config: encryptIntegrationConfig({
      ...params.config,
      webhookSigningKey: signingKey,
    }) as any,
  });
  return signingKey;
}

function appendContactNote(existing: string | null | undefined, line: string): string {
  const base = (existing || "").trim();
  return base ? `${base}\n\n${line}` : line;
}

const PIPELINE_BEFORE_APPOINTMENT_SET = new Set([
  "New Lead",
  "Responded",
  "Qualified (Hot)",
  "Qualified (Warm)",
  "Appointment Requested",
]);

function isUniqueViolation(err: unknown): boolean {
  const msg = String((err as Error)?.message || err || "");
  return /unique|duplicate key/i.test(msg);
}

async function resolvePreferredCalendlyContactId(
  userId: string,
  inviteeEmail: string,
  utmContactId?: string
): Promise<string | undefined> {
  if (utmContactId) {
    const c = await storage.getContact(utmContactId);
    if (c?.userId === userId) return c.id;
  }
  const byEmail = await storage.getContactByChannelId(userId, "calendly", inviteeEmail);
  if (!byEmail) return undefined;
  if (byEmail.primaryChannel === "calendly" && !byEmail.whatsappId && !byEmail.phone) {
    return undefined;
  }
  return byEmail.id;
}

type CalendlyBookingMatch = {
  contactId: string;
  conversationId?: string;
  channel?: string;
  reason: "tracking" | "email" | "recent_context";
};

function getRecentCalendlyContexts(contact: { customFields?: unknown }): Array<Record<string, unknown>> {
  const customFields = ((contact.customFields as Record<string, unknown> | null) || {}) as Record<string, unknown>;
  const rows = Array.isArray(customFields._calendlyBookingContexts) ? customFields._calendlyBookingContexts : [];
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return rows
    .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : null))
    .filter((x): x is Record<string, unknown> => {
      if (!x) return false;
      const sentAt = typeof x.bookingLinkSentAt === "string" ? Date.parse(x.bookingLinkSentAt) : 0;
      return sentAt >= cutoff;
    })
    .sort((a, b) => {
      const at = typeof a.bookingLinkSentAt === "string" ? Date.parse(a.bookingLinkSentAt) : 0;
      const bt = typeof b.bookingLinkSentAt === "string" ? Date.parse(b.bookingLinkSentAt) : 0;
      return bt - at;
    });
}

async function resolveCalendlyBookingMatch(params: {
  userId: string;
  inviteeEmail: string;
  utmContactId?: string;
  utmConversationId?: string;
  utmTrackingToken?: string;
}): Promise<CalendlyBookingMatch | undefined> {
  if (params.utmContactId) {
    const contact = await storage.getContact(params.utmContactId);
    if (contact?.userId === params.userId) {
      let conversationId = params.utmConversationId;
      if (conversationId) {
        const conv = await storage.getConversation(conversationId);
        if (!conv || conv.userId !== params.userId || conv.contactId !== contact.id) {
          conversationId = undefined;
        }
      }
      if (!conversationId && params.utmTrackingToken) {
        const ctx = getRecentCalendlyContexts(contact).find(
          (x) => x.trackingToken === params.utmTrackingToken
        );
        conversationId = typeof ctx?.conversationId === "string" ? ctx.conversationId : undefined;
      }
      return { contactId: contact.id, conversationId, reason: "tracking" };
    }
  }

  const byEmail = await storage.getContactByChannelId(params.userId, "calendly", params.inviteeEmail);
  if (byEmail) {
    const ctx = getRecentCalendlyContexts(byEmail)[0];
    return {
      contactId: byEmail.id,
      conversationId: typeof ctx?.conversationId === "string" ? ctx.conversationId : undefined,
      channel: typeof ctx?.channel === "string" ? ctx.channel : undefined,
      reason: "email",
    };
  }

  const contacts = await storage.getContacts(params.userId, 5000);
  for (const contact of contacts) {
    const ctx = getRecentCalendlyContexts(contact).find(
      (x) => !params.utmTrackingToken || x.trackingToken === params.utmTrackingToken
    );
    if (ctx) {
      return {
        contactId: contact.id,
        conversationId: typeof ctx.conversationId === "string" ? ctx.conversationId : undefined,
        channel: typeof ctx.channel === "string" ? ctx.channel : undefined,
        reason: "recent_context",
      };
    }
  }

  return undefined;
}

async function applyCalendlyConfirmedBookingCrmEffects(params: {
  userId: string;
  contactId: string;
  conversationId: string | undefined;
  appointmentId: string;
  title: string;
  startIso: string;
  eventTypeName: string;
  scheduledEventUri?: string;
  meetingLink?: string;
  inviteeName?: string;
  inviteeEmail?: string;
}): Promise<void> {
  const { userId, contactId, conversationId, appointmentId, title, startIso, eventTypeName, scheduledEventUri, meetingLink, inviteeName, inviteeEmail } =
    params;
  const contact = await storage.getContact(contactId);
  if (!contact) {
    logCalendlyWebhook("booking_effects_contact_missing", { userId, contactId, appointmentId });
    return;
  }

  const patch: Record<string, unknown> = {};
  if (!contact.email && inviteeEmail) {
    patch.email = inviteeEmail;
  }
  if ((!contact.name || contact.name === "Unknown") && inviteeName) {
    patch.name = inviteeName;
  }
  if (contact.tag !== "Appointment Scheduled") {
    patch.tag = "Appointment Scheduled";
  }
  if (PIPELINE_BEFORE_APPOINTMENT_SET.has(contact.pipelineStage || "")) {
    patch.pipelineStage = "Appointment Set";
  }
  patch.followUp = title;
  patch.followUpDate = new Date(startIso);

  const prevCf = ((contact.customFields as Record<string, unknown> | null) || {}) as Record<string, unknown>;
  const nextCf = { ...prevCf };
  delete nextCf._w3CalendlyAwaitBooking;
  nextCf.calendlyLastBooking = {
    appointmentId,
    title,
    startTime: startIso,
    eventTypeName,
    inviteeName: inviteeName || null,
    inviteeEmail: inviteeEmail || null,
    scheduledEventUri: scheduledEventUri || null,
    meetingLink: meetingLink || null,
    bookedAt: new Date().toISOString(),
    source: "calendly",
  };
  patch.customFields = nextCf;

  if (Object.keys(patch).length > 0) {
    await storage.updateContact(contactId, patch as any, { skipAutomationHooks: true });
  }

  const activity = await storage.createActivityEvent({
    userId,
    contactId,
    conversationId: conversationId ?? null,
    eventType: "calendly_booking",
    eventData: {
      appointmentId,
      title,
      startTime: startIso,
      eventType: eventTypeName,
      inviteeName: inviteeName || null,
      inviteeEmail: inviteeEmail || null,
      scheduledEventUri: scheduledEventUri || null,
      meetingLink: meetingLink || null,
      source: "calendly",
    },
    actorType: "system",
  });

  logCalendlyWebhook("booking_effects_created", {
    userId,
    contactId,
    conversationId: conversationId || null,
    appointmentId,
    activityEventId: activity.id,
    title,
    startTime: startIso,
    meetingLinkExists: Boolean(meetingLink),
  });
}

async function writeCalendlyConversationActivity(params: {
  userId: string;
  email: string;
  name: string;
  content: string;
  externalMessageId: string;
  preferredContactId?: string;
  preferredConversationId?: string;
}): Promise<{ contactId: string; conversationId: string }> {
  if (params.preferredContactId && params.preferredConversationId) {
    const contact = await storage.getContact(params.preferredContactId);
    const conversation = await storage.getConversation(params.preferredConversationId);
    if (contact?.userId === params.userId && conversation?.userId === params.userId && conversation.contactId === contact.id) {
      const msg = await storage.createMessage({
        conversationId: conversation.id,
        contactId: contact.id,
        userId: params.userId,
        direction: "inbound",
        content: params.content,
        contentType: "text",
        externalMessageId: params.externalMessageId.slice(0, 500),
        status: "delivered",
      } as any);
      await storage.updateConversation(conversation.id, {
        lastMessageAt: new Date(),
        lastMessagePreview: params.content.split("\n")[0].slice(0, 100),
        lastMessageDirection: "inbound",
      });
      logCalendlyWebhook("conversation_booking_event_created", {
        userId: params.userId,
        contactId: contact.id,
        conversationId: conversation.id,
        messageId: msg.id,
      });
      return { contactId: contact.id, conversationId: conversation.id };
    }
  }

  const { channelService } = await import("./channelService");
  const { contact, conversation } = await channelService.processIncomingMessage({
    userId: params.userId,
    channel: "calendly",
    channelContactId: params.email,
    contactName: params.name,
    content: params.content,
    contentType: "text",
    externalMessageId: params.externalMessageId.slice(0, 500),
    preferredContactId: params.preferredContactId,
  });
  return { contactId: contact.id, conversationId: conversation.id };
}

async function handleInviteeCreated(userId: string, body: Record<string, unknown>): Promise<void> {
  const parsed = extractCalendlyBookingPayload(body);
  if (!parsed) {
    console.warn("[Calendly] invitee.created — missing email in payload");
    return;
  }
  const {
    email,
    name,
    eventTypeName,
    startTime,
    endTime,
    inviteeUri,
    scheduledEventUri,
    externalMessageId,
    utmContactId,
    utmConversationId,
    utmTrackingToken,
    meetingLink,
  } = parsed;

  logCalendlyWebhook("invitee_created_parsed", {
    userId,
    email,
    name,
    eventTypeName,
    startTime: startTime || null,
    scheduledEventUri: scheduledEventUri || null,
    inviteeUri: inviteeUri || null,
    utmContactId: utmContactId || null,
    utmConversationId: utmConversationId || null,
    utmTrackingTokenExists: Boolean(utmTrackingToken),
    meetingLinkExists: Boolean(meetingLink),
  });

  const bookingMatch = await resolveCalendlyBookingMatch({
    userId,
    inviteeEmail: email,
    utmContactId,
    utmConversationId,
    utmTrackingToken,
  });
  const preferredContactId =
    bookingMatch?.contactId || (await resolvePreferredCalendlyContactId(userId, email, utmContactId));
  logCalendlyWebhook("invitee_created_contact_resolution", {
    userId,
    email,
    utmContactId: utmContactId || null,
    utmConversationId: utmConversationId || null,
    preferredContactId: preferredContactId || null,
    preferredConversationId: bookingMatch?.conversationId || null,
    matchReason: bookingMatch?.reason || null,
  });

  const timeLabel = formatBookingTime(startTime);
  const content = `Calendly booked: ${eventTypeName} at ${timeLabel}${meetingLink ? `\n${meetingLink}` : ""}`;
  const stableDedupeKey = (scheduledEventUri || inviteeUri || externalMessageId).trim();
  if (stableDedupeKey) {
    const existingAppt = await storage.getAppointmentByCalendlyScheduledEventUri(userId, stableDedupeKey);
    if (existingAppt) {
      logCalendlyWebhook("invitee_created_duplicate_appointment", {
        userId,
        email,
        appointmentId: existingAppt.id,
        existingContactId: existingAppt.contactId,
        matchedContactId: bookingMatch?.contactId || null,
        matchedConversationId: bookingMatch?.conversationId || null,
        scheduledEventKey: stableDedupeKey.slice(0, 120),
      });
      if (bookingMatch?.contactId && bookingMatch.conversationId && existingAppt.contactId !== bookingMatch.contactId) {
        const startDate = startTime ? new Date(startTime) : new Date();
        await db
          .update(appointments)
          .set({
            contactId: bookingMatch.contactId,
            conversationId: bookingMatch.conversationId,
            contactName: name || email,
          })
          .where(eq(appointments.id, existingAppt.id));
        await writeCalendlyConversationActivity({
          userId,
          email,
          name,
          content,
          externalMessageId: `${String(externalMessageId).slice(0, 420)}:repair`,
          preferredContactId: bookingMatch.contactId,
          preferredConversationId: bookingMatch.conversationId,
        });
        await applyCalendlyConfirmedBookingCrmEffects({
          userId,
          contactId: bookingMatch.contactId,
          conversationId: bookingMatch.conversationId,
          appointmentId: existingAppt.id,
          title: existingAppt.title || `${eventTypeName} · ${timeLabel}`,
          startIso: startDate.toISOString(),
          eventTypeName,
          scheduledEventUri: stableDedupeKey || undefined,
          meetingLink,
          inviteeName: name,
          inviteeEmail: email,
        });
        logCalendlyWebhook("duplicate_booking_repaired_to_context", {
          userId,
          appointmentId: existingAppt.id,
          fromContactId: existingAppt.contactId,
          toContactId: bookingMatch.contactId,
          conversationId: bookingMatch.conversationId,
        });
      }
      return;
    }
  }

  let legacyChat: Awaited<ReturnType<typeof findOrCreateLegacyCalendlyWorkflowChat>> | undefined;
  let isNewChat = false;
  if (!bookingMatch?.conversationId) {
    const chatKey = legacyCalendlyChatStorageKey(email);
    legacyChat = await findOrCreateLegacyCalendlyWorkflowChat(userId, email, name);
    await subscriptionService.trackConversationWindow(userId, legacyChat.id, chatKey);

    const newLegacy: WhatsAppMessage = {
      id: String(externalMessageId || `cal-${Date.now()}`).slice(0, 120),
      text: content,
      time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      sent: false,
      sender: "them",
    };
    const messages = (legacyChat.messages as WhatsAppMessage[]) || [];
    messages.push(newLegacy);
    isNewChat = messages.length === 1;
    await storage.updateChat(legacyChat.id, {
      messages,
      lastMessage: content,
      time: newLegacy.time,
      unread: (legacyChat.unread || 0) + 1,
    });
  }

  const written = await writeCalendlyConversationActivity({
    userId,
    email,
    name,
    content,
    externalMessageId: String(externalMessageId).slice(0, 500),
    preferredContactId,
    preferredConversationId: bookingMatch?.conversationId,
  });
  const contact = await storage.getContact(written.contactId);
  const conversation = await storage.getConversation(written.conversationId);
  if (!contact || !conversation) {
    throw new Error("Calendly booking wrote activity but contact/conversation could not be reloaded");
  }
  const chatbotWillFire = !bookingMatch?.conversationId;
  logCalendlyWebhook("invitee_created_message_processed", {
    userId,
    email,
    contactId: contact.id,
    conversationId: conversation.id,
    matchedOriginalConversation: Boolean(bookingMatch?.conversationId),
    chatbotWillFire,
  });

  if (stableDedupeKey) {
    const raceDup = await storage.getAppointmentByCalendlyScheduledEventUri(userId, stableDedupeKey);
    if (raceDup) {
      logCalendlyWebhook("invitee_created_race_duplicate_appointment", {
        userId,
        email,
        contactId: contact.id,
        conversationId: conversation.id,
        appointmentId: raceDup.id,
      });
      return;
    }
  }

  const startDate = startTime ? new Date(startTime) : new Date();
  const endDate = endTime ? new Date(endTime) : undefined;
  const title = `${eventTypeName} · ${timeLabel}`;
  const apptType = eventTypeName || "Calendly";

  let appointmentId: string | undefined;
  try {
    const appt = await storage.createAppointment({
      userId,
      contactId: contact.id,
      conversationId: conversation.id,
      contactName: contact.name || name || email,
      appointmentType: apptType,
      appointmentDate: startDate,
      appointmentEnd: endDate,
      title,
      status: "scheduled",
      source: "calendly",
      calendlyScheduledEventUri: stableDedupeKey || null,
      calendlyInviteeUri: inviteeUri || null,
    });
    appointmentId = appt.id;
    logCalendlyWebhook("invitee_created_appointment_created", {
      userId,
      email,
      contactId: contact.id,
      conversationId: conversation.id,
      appointmentId,
      title,
      startTime: startDate.toISOString(),
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      logCalendlyWebhook("invitee_created_appointment_unique_duplicate", {
        userId,
        email,
        contactId: contact.id,
        conversationId: conversation.id,
        scheduledEventKey: stableDedupeKey.slice(0, 120),
      });
      return;
    }
    console.error("[Calendly] createAppointment failed:", err);
    throw err;
  }

  await applyCalendlyConfirmedBookingCrmEffects({
    userId,
    contactId: contact.id,
    conversationId: conversation.id,
    appointmentId: appointmentId!,
    title,
    startIso: startDate.toISOString(),
    eventTypeName,
    scheduledEventUri: stableDedupeKey || undefined,
    meetingLink,
    inviteeName: name,
    inviteeEmail: email,
  });

  notifyUser(userId, {
    type: "calendly_booking_confirmed",
    contactId: contact.id,
    conversationId: conversation.id,
    appointmentId,
    title,
    startTime: startDate.toISOString(),
    eventTypeName,
    source: "calendly",
  });

  const updatedChat = legacyChat ? await storage.getChat(legacyChat.id) : undefined;
  if (updatedChat) {
    dispatchInboundMessagingAutomation({
      userId,
      isNewChat,
      updatedChat,
      messageBody: content,
      contact,
      conversationId: conversation.id,
      skipKeywordWorkflows: chatbotWillFire,
    }).catch((err) => console.error("[Calendly] workflow dispatch error:", err));
  }
}

async function handleInviteeCanceled(userId: string, body: Record<string, unknown>): Promise<void> {
  const parsed = extractCalendlyBookingPayload(body);
  if (!parsed) {
    logCalendlyWebhook("invitee_canceled_unparsed", { userId });
    return;
  }
  logCalendlyWebhook("invitee_canceled_parsed", {
    userId,
    email: parsed.email,
    name: parsed.name,
    eventTypeName: parsed.eventTypeName,
    startTime: parsed.startTime || null,
  });
  const preferredContactId = await resolvePreferredCalendlyContactId(userId, parsed.email, parsed.utmContactId);
  const contact =
    (preferredContactId ? await storage.getContact(preferredContactId) : undefined) ??
    (await storage.getContactByChannelId(userId, "calendly", parsed.email));
  if (!contact) {
    console.log(`[Calendly] cancel — no contact for ${parsed.email}`);
    return;
  }
  const timeLabel = formatBookingTime(parsed.startTime);
  const content = `Calendly canceled: ${parsed.eventTypeName} at ${timeLabel}${parsed.meetingLink ? `\n${parsed.meetingLink}` : ""}`;
  const written = await writeCalendlyConversationActivity({
    userId,
    email: parsed.email,
    name: parsed.name,
    content,
    externalMessageId: `calendly-canceled:${parsed.externalMessageId}`,
    preferredContactId: contact.id,
  });
  const line = `Booking canceled: ${parsed.eventTypeName} at ${timeLabel}`;
  await storage.updateContact(contact.id, {
    notes: appendContactNote(contact.notes, line),
  });
  const { channelService } = await import("./channelService");
  await channelService.logActivity(userId, contact.id, written.conversationId, "calendly_booking_canceled", {
    email: parsed.email,
    eventType: parsed.eventTypeName,
    startTime: parsed.startTime || null,
    meetingLink: parsed.meetingLink || null,
  });
  logCalendlyWebhook("invitee_canceled_activity_created", {
    userId,
    email: parsed.email,
    contactId: contact.id,
    conversationId: written.conversationId,
  });
  const chatKey = legacyCalendlyChatStorageKey(parsed.email);
  const chatRows = await db
    .select()
    .from(chats)
    .where(and(eq(chats.userId, userId), eq(chats.whatsappPhone, chatKey)))
    .limit(1);
  const chat = chatRows[0];
  if (chat) {
    dispatchInboundMessagingAutomation({
      userId,
      isNewChat: false,
      updatedChat: chat,
      messageBody: "Booking canceled",
      contact,
      conversationId: undefined,
    }).catch(() => {});
  }
}

async function handleInviteeRescheduled(userId: string, body: Record<string, unknown>): Promise<void> {
  const parsed = extractCalendlyBookingPayload(body);
  if (!parsed) {
    logCalendlyWebhook("invitee_rescheduled_unparsed", { userId });
    return;
  }
  logCalendlyWebhook("invitee_rescheduled_parsed", {
    userId,
    email: parsed.email,
    name: parsed.name,
    eventTypeName: parsed.eventTypeName,
    startTime: parsed.startTime || null,
  });
  const preferredContactId = await resolvePreferredCalendlyContactId(userId, parsed.email, parsed.utmContactId);
  const contact =
    (preferredContactId ? await storage.getContact(preferredContactId) : undefined) ??
    (await storage.getContactByChannelId(userId, "calendly", parsed.email));
  const timeLabel = formatBookingTime(parsed.startTime);
  if (contact) {
    const content = `Calendly rescheduled: ${parsed.eventTypeName} to ${timeLabel}${parsed.meetingLink ? `\n${parsed.meetingLink}` : ""}`;
    const written = await writeCalendlyConversationActivity({
      userId,
      email: parsed.email,
      name: parsed.name,
      content,
      externalMessageId: `calendly-rescheduled:${parsed.externalMessageId}`,
      preferredContactId: contact.id,
    });
    const line = `Rescheduled to ${timeLabel} (${parsed.eventTypeName})`;
    await storage.updateContact(contact.id, {
      notes: appendContactNote(contact.notes, line),
    });
    const { channelService } = await import("./channelService");
    await channelService.logActivity(userId, contact.id, written.conversationId, "calendly_rescheduled", {
      email: parsed.email,
      newTime: parsed.startTime,
      eventType: parsed.eventTypeName,
      meetingLink: parsed.meetingLink || null,
    });
    logCalendlyWebhook("invitee_rescheduled_activity_created", {
      userId,
      email: parsed.email,
      contactId: contact.id,
      conversationId: written.conversationId,
    });
  }
}

async function handleInviteeNoShowCreated(userId: string, body: Record<string, unknown>): Promise<void> {
  const parsed = extractCalendlyBookingPayload(body);
  if (!parsed) {
    logCalendlyWebhook("invitee_no_show_unparsed", { userId });
    return;
  }
  logCalendlyWebhook("invitee_no_show_parsed", {
    userId,
    email: parsed.email,
    name: parsed.name,
    eventTypeName: parsed.eventTypeName,
    startTime: parsed.startTime || null,
  });
  const preferredContactId = await resolvePreferredCalendlyContactId(userId, parsed.email, parsed.utmContactId);
  const written = await writeCalendlyConversationActivity({
    userId,
    email: parsed.email,
    name: parsed.name,
    content: `Calendly no-show: ${parsed.eventTypeName} at ${formatBookingTime(parsed.startTime)}${parsed.meetingLink ? `\n${parsed.meetingLink}` : ""}`,
    externalMessageId: `calendly-no-show:${parsed.externalMessageId}`,
    preferredContactId,
  });
  const { channelService } = await import("./channelService");
  await channelService.logActivity(userId, written.contactId, written.conversationId, "calendly_no_show", {
    email: parsed.email,
    eventType: parsed.eventTypeName,
    startTime: parsed.startTime || null,
    meetingLink: parsed.meetingLink || null,
  });
  logCalendlyWebhook("invitee_no_show_activity_created", {
    userId,
    email: parsed.email,
    contactId: written.contactId,
    conversationId: written.conversationId,
  });
}

async function processCalendlyPayload(userId: string, body: Record<string, unknown>): Promise<void> {
  const event = String(body.event || "");
  logCalendlyWebhook("processing_started", { userId, calendlyEvent: event });
  switch (event) {
    case "invitee.created":
      await handleInviteeCreated(userId, body);
      break;
    case "invitee.canceled":
      await handleInviteeCanceled(userId, body);
      break;
    case "invitee.rescheduled":
      await handleInviteeRescheduled(userId, body);
      break;
    case "invitee_no_show.created":
      await handleInviteeNoShowCreated(userId, body);
      break;
    default:
      logCalendlyWebhook("ignored_event", { userId, calendlyEvent: event });
  }
}

export async function handleCalendlyWebhook(req: Request, res: Response): Promise<void> {
  const userId = req.params.userId;
  if (!userId) {
    res.status(400).json({ error: "Missing user" });
    return;
  }

  const rawBody = (req as { rawBody?: Buffer }).rawBody;
  const sigHeader = req.get("calendly-webhook-signature") || undefined;
  logCalendlyWebhook("http_received", {
    userId,
    method: req.method,
    path: req.originalUrl || req.url,
    rawBodyBytes: rawBody?.length || 0,
    signatureHeaderExists: Boolean(sigHeader),
    sessionAuthenticated: typeof req.isAuthenticated === "function" ? req.isAuthenticated() : false,
  });

  const integration = await storage.getIntegrationByUserAndType(userId, "calendly");
  if (!integration?.isActive) {
    logCalendlyWebhook("inactive_integration_ignored", {
      userId,
      integrationExists: Boolean(integration),
      integrationActive: Boolean(integration?.isActive),
    });
    res.status(200).json({ ok: true, ignored: true });
    return;
  }

  const cfg = decryptIntegrationConfigLocal((integration.config || {}) as Record<string, unknown>);
  let signingKey = String(cfg.webhookSigningKey || "").trim();
  logCalendlyWebhook("integration_loaded", {
    userId,
    integrationId: integration.id,
    webhookStatus: typeof cfg.calendlyWebhookStatus === "string" ? cfg.calendlyWebhookStatus : "unknown",
    signingKeyExists: Boolean(signingKey),
    callbackUrl: typeof cfg.calendlyWebhookCallbackUrl === "string" ? cfg.calendlyWebhookCallbackUrl : null,
    subscriptionUriExists: Boolean(cfg.calendlyWebhookSubscriptionUri),
  });

  if (!signingKey) {
    signingKey = await recoverCalendlySigningKeyFromSubscription({
      userId,
      integrationId: integration.id,
      config: cfg,
    });
  }

  const expectedCallbackUrl = `https://app.whachatcrm.com/api/webhooks/calendly/${userId}`;
  const unsignedFallbackAccepted =
    !sigHeader &&
    process.env.CALENDLY_ALLOW_UNSIGNED_WEBHOOKS === "true" &&
    typeof cfg.calendlyWebhookSubscriptionUri === "string" &&
    Boolean(cfg.calendlyWebhookSubscriptionUri) &&
    cfg.calendlyWebhookCallbackUrl === expectedCallbackUrl &&
    cfg.calendlyWebhookStatus === "connected";
  const signatureDiag = calendlySignatureDiagnostics(rawBody, signingKey, sigHeader);

  if (unsignedFallbackAccepted) {
    logCalendlyWebhook("unsigned_fallback_accepted", {
      userId,
      integrationId: integration.id,
      expectedCallbackUrl,
      subscriptionUriExists: Boolean(cfg.calendlyWebhookSubscriptionUri),
    });
  } else {
    if (!signingKey || !rawBody || !sigHeader) {
      logCalendlyWebhook("signature_prerequisite_failed", {
        userId,
        signingKeyExists: Boolean(signingKey),
        rawBodyExists: Boolean(rawBody),
        rawBodyBytes: rawBody?.length || 0,
        signatureHeaderExists: Boolean(sigHeader),
        ...signatureDiag,
      });
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!verifyCalendlyWebhookSignature(rawBody, sigHeader, signingKey)) {
      logCalendlyWebhook("signature_invalid", {
        userId,
        rawBodyBytes: rawBody.length,
        signatureHeaderExists: Boolean(sigHeader),
        ...signatureDiag,
      });
      res.status(401).json({ error: "Invalid signature" });
      return;
    }
  }

  const body = req.body as Record<string, unknown>;
  const parsed = extractCalendlyBookingPayload(body);
  logCalendlyWebhook("auth_passed", {
    userId,
    signatureVerified: !unsignedFallbackAccepted,
    unsignedFallbackAccepted,
    calendlyEvent: String(body.event || ""),
    inviteeEmail: parsed?.email || null,
    inviteeName: parsed?.name || null,
    startTime: parsed?.startTime || null,
    scheduledEventUri: parsed?.scheduledEventUri || null,
    ...signatureDiag,
  });

  res.status(200).json({ ok: true });

  setImmediate(() => {
    processCalendlyPayload(userId, body)
      .then(() => {
        logCalendlyWebhook("async_processing_complete", {
          userId,
          calendlyEvent: String(body.event || ""),
        });
      })
      .catch((err) => {
        console.error("[Calendly] Async processing error:", err);
        logCalendlyWebhook("async_processing_failed", {
          userId,
          calendlyEvent: String(body.event || ""),
          error: err instanceof Error ? err.message : String(err),
        });
      });
  });
}
