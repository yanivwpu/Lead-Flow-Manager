import crypto from "crypto";
import type { Request, Response } from "express";
import { eq, and } from "drizzle-orm";
import { chats } from "@shared/schema";
import { db } from "../drizzle/db";
import {
  decryptCredential,
  isEncrypted,
  findOrCreateLegacyCalendlyWorkflowChat,
  legacyCalendlyChatStorageKey,
  type WhatsAppMessage,
} from "./userTwilio";
import { storage } from "./storage";
import { triggerNewChatWorkflows, triggerKeywordWorkflows } from "./workflowEngine";
import { subscriptionService } from "./subscriptionService";

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

/** Calendly sends `Calendly-Webhook-Signature: t=TIMESTAMP,v1=HEX` — HMAC-SHA256 of `t + '.' + rawBody`. */
export function verifyCalendlyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  signingKey: string
): boolean {
  if (!signatureHeader || !signingKey || !rawBody?.length) return false;
  let t = "";
  const v1s: string[] = [];
  for (const part of signatureHeader.split(",")) {
    const p = part.trim();
    if (p.startsWith("t=")) t = p.slice(2);
    else if (p.startsWith("v1=")) v1s.push(p.slice(3));
  }
  if (!t || v1s.length === 0) return false;
  const payload = Buffer.from(`${t}.${rawBody.toString("utf8")}`, "utf8");
  const expectedHex = crypto.createHmac("sha256", signingKey).update(payload).digest("hex");
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

function extractInviteePayload(body: Record<string, unknown>): {
  email: string;
  name: string;
  eventTypeName: string;
  startTime?: string;
  externalMessageId?: string;
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
  const externalMessageId =
    (invitee.uri as string) || (payload.uri as string) || `${email}:${startTime || body.event || "calendly"}`;

  return { email, name, eventTypeName, startTime: startTime as string | undefined, externalMessageId };
}

function appendContactNote(existing: string | null | undefined, line: string): string {
  const base = (existing || "").trim();
  return base ? `${base}\n\n${line}` : line;
}

async function handleInviteeCreated(
  userId: string,
  body: Record<string, unknown>
): Promise<void> {
  const parsed = extractInviteePayload(body);
  if (!parsed) {
    console.warn("[Calendly] invitee.created — missing email in payload");
    return;
  }
  const { email, name, eventTypeName, startTime, externalMessageId } = parsed;
  const timeLabel = formatBookingTime(startTime);
  const content = `Booked: ${eventTypeName} at ${timeLabel}`;

  const chatKey = legacyCalendlyChatStorageKey(email);
  const chat = await findOrCreateLegacyCalendlyWorkflowChat(userId, email, name);
  await subscriptionService.trackConversationWindow(userId, chat.id, chatKey);

  const newLegacy: WhatsAppMessage = {
    id: String(externalMessageId || `cal-${Date.now()}`).slice(0, 120),
    text: content,
    time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    sent: false,
    sender: "them",
  };
  const messages = (chat.messages as WhatsAppMessage[]) || [];
  messages.push(newLegacy);
  const isNewChat = messages.length === 1;
  await storage.updateChat(chat.id, {
    messages,
    lastMessage: content,
    time: newLegacy.time,
    unread: (chat.unread || 0) + 1,
  });

  const { channelService } = await import("./channelService");
  const { contact, conversation, chatbotWillFire } = await channelService.processIncomingMessage({
    userId,
    channel: "calendly",
    channelContactId: email,
    contactName: name,
    content,
    contentType: "text",
    externalMessageId: String(externalMessageId).slice(0, 500),
  });

  const updatedChat = await storage.getChat(chat.id);
  if (updatedChat) {
    if (isNewChat) {
      triggerNewChatWorkflows(userId, updatedChat, contact, conversation.id).catch((err) =>
        console.error("[Calendly] New chat workflow error:", err)
      );
    }
    if (!chatbotWillFire) {
      triggerKeywordWorkflows(userId, updatedChat, content, contact, conversation.id).catch((err) =>
        console.error("[Calendly] Keyword workflow error:", err)
      );
    }
  }
}

async function handleInviteeCanceled(userId: string, body: Record<string, unknown>): Promise<void> {
  const parsed = extractInviteePayload(body);
  if (!parsed) return;
  const contact = await storage.getContactByChannelId(userId, "calendly", parsed.email);
  if (!contact) {
    console.log(`[Calendly] cancel — no contact for ${parsed.email}`);
    return;
  }
  const line = `Booking canceled (${new Date().toISOString()})`;
  await storage.updateContact(contact.id, {
    notes: appendContactNote(contact.notes, line),
  });
  const { channelService } = await import("./channelService");
  await channelService.logActivity(userId, contact.id, undefined, "calendly_booking_canceled", {
    email: parsed.email,
    eventType: parsed.eventTypeName,
  });
  const chatKey = legacyCalendlyChatStorageKey(parsed.email);
  const chatRows = await db
    .select()
    .from(chats)
    .where(and(eq(chats.userId, userId), eq(chats.whatsappPhone, chatKey)))
    .limit(1);
  const chat = chatRows[0];
  if (chat) {
    triggerKeywordWorkflows(userId, chat, "Booking canceled", contact, undefined).catch(() => {});
  }
}

async function handleInviteeRescheduled(userId: string, body: Record<string, unknown>): Promise<void> {
  const parsed = extractInviteePayload(body);
  if (!parsed) return;
  const contact = await storage.getContactByChannelId(userId, "calendly", parsed.email);
  const timeLabel = formatBookingTime(parsed.startTime);
  const line = `Rescheduled to ${timeLabel} (${parsed.eventTypeName})`;
  if (contact) {
    await storage.updateContact(contact.id, {
      notes: appendContactNote(contact.notes, line),
    });
    const conv = await storage.getConversationByContactAndChannel(contact.id, "calendly");
    const { channelService } = await import("./channelService");
    await channelService.logActivity(userId, contact.id, conv?.id, "calendly_rescheduled", {
      email: parsed.email,
      newTime: parsed.startTime,
      eventType: parsed.eventTypeName,
    });
  }
}

async function processCalendlyPayload(userId: string, body: Record<string, unknown>): Promise<void> {
  const event = String(body.event || "");
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
    default:
      console.log(`[Calendly] Ignoring event: ${event}`);
  }
}

export async function handleCalendlyWebhook(req: Request, res: Response): Promise<void> {
  const userId = req.params.userId;
  if (!userId) {
    res.status(400).json({ error: "Missing user" });
    return;
  }

  const integration = await storage.getIntegrationByUserAndType(userId, "calendly");
  if (!integration?.isActive) {
    console.warn("[Calendly] No active integration — acknowledging without processing");
    res.status(200).json({ ok: true, ignored: true });
    return;
  }

  const cfg = decryptIntegrationConfigLocal((integration.config || {}) as Record<string, unknown>);
  const signingKey = String(cfg.webhookSigningKey || "").trim();
  const rawBody = (req as { rawBody?: Buffer }).rawBody;
  const sigHeader = req.headers["calendly-webhook-signature"] as string | undefined;

  if (!signingKey || !rawBody) {
    console.warn("[Calendly] Missing signing key or raw body — cannot verify");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!verifyCalendlyWebhookSignature(rawBody, sigHeader, signingKey)) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  res.status(200).json({ ok: true });

  const body = req.body as Record<string, unknown>;
  setImmediate(() => {
    processCalendlyPayload(userId, body).catch((err) =>
      console.error("[Calendly] Async processing error:", err)
    );
  });
}
