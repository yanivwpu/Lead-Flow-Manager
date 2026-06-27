import type { Contact, Conversation } from "@shared/schema";
import { storage } from "./storage";
import {
  WEBCHAT_LAST_ACTIVE_FIELD,
  WEBCHAT_SESSION_IDLE_MS,
} from "@shared/webchatSendErrors";

export function readWebchatLastActiveAt(contact: Contact): Date | null {
  const cf = contact.customFields as Record<string, unknown> | null | undefined;
  const raw = cf?.[WEBCHAT_LAST_ACTIVE_FIELD];
  if (typeof raw !== "string" || !raw.trim()) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function contactHasWebchatSessionSignals(
  contact: Contact,
  conversation?: Conversation | null,
): boolean {
  return (
    contact.lastIncomingChannel === "webchat" ||
    contact.primaryChannel === "webchat" ||
    contact.source === "webchat" ||
    !!conversation
  );
}

export async function isWebchatConfiguredForWorkspace(userId: string): Promise<boolean> {
  const settings = await storage.getChannelSettings(userId);
  const webchatSetting = settings.find((s) => s.channel === "webchat");
  if (webchatSetting?.isEnabled && webchatSetting?.isConnected) return true;

  const user = await storage.getUser(userId);
  const ws = (user?.widgetSettings as Record<string, unknown> | null | undefined) || {};
  if (ws.enabled === false) return false;
  return true;
}

export async function isWebchatVisitorSessionActive(
  contact: Contact,
  conversation?: Conversation | null,
  now = Date.now(),
): Promise<boolean> {
  const lastActive = readWebchatLastActiveAt(contact);
  if (lastActive) {
    return now - lastActive.getTime() < WEBCHAT_SESSION_IDLE_MS;
  }

  if (!conversation?.id) return false;

  const messages = await storage.getMessages(conversation.id, 20);
  let lastInboundMs = 0;
  for (const message of messages) {
    if (message.direction !== "inbound") continue;
    const ms = message.createdAt ? new Date(message.createdAt).getTime() : 0;
    if (ms > lastInboundMs) lastInboundMs = ms;
  }
  if (!lastInboundMs) return false;
  return now - lastInboundMs < WEBCHAT_SESSION_IDLE_MS;
}

export async function touchWebchatVisitorSession(contactId: string): Promise<void> {
  const contact = await storage.getContact(contactId);
  if (!contact) return;
  const existing =
    contact.customFields && typeof contact.customFields === "object" && !Array.isArray(contact.customFields)
      ? (contact.customFields as Record<string, unknown>)
      : {};
  await storage.updateContact(
    contactId,
    {
      customFields: {
        ...existing,
        [WEBCHAT_LAST_ACTIVE_FIELD]: new Date().toISOString(),
      },
    },
    { skipAutomationHooks: true },
  );
}
