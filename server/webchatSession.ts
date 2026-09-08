import type { Contact, Conversation } from "@shared/schema";
import { storage } from "./storage";
import { isPublicWebchatVisitorId } from "@shared/webchatVisitorId";
import { HARD_BLOCKED_CONVERSATION_STATUSES, RE_ENGAGEMENT_REOPENABLE_CONVERSATION_STATUSES } from "@shared/automationSendGuardMessages";
import {
  WEBCHAT_CONVERSATION_INACCESSIBLE_MESSAGE,
  WEBCHAT_LAST_ACTIVE_FIELD,
  WEBCHAT_NOT_CONFIGURED_MESSAGE,
  WEBCHAT_OUTBOUND_DEDUP_MS,
  WEBCHAT_SESSION_IDLE_MS,
  WEBCHAT_VISITOR_IDENTITY_INVALID_MESSAGE,
  type WebchatSendErrorCode,
} from "@shared/webchatSendErrors";

export function readWebchatLastActiveAt(contact: Contact): Date | null {
  const cf = contact.customFields as Record<string, unknown> | null | undefined;
  const raw = cf?.[WEBCHAT_LAST_ACTIVE_FIELD];
  if (typeof raw !== "string" || !raw.trim()) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Immutable public visitor UUID stored on the contact. Never email or phone. */
export function readWebchatVisitorId(contact: Contact): string | null {
  const id = String(contact.webchatId || "").trim();
  return isPublicWebchatVisitorId(id) ? id : null;
}

export function contactHasWebchatSessionSignals(
  contact: Contact,
  conversation?: Conversation | null,
): boolean {
  return (
    !!readWebchatVisitorId(contact) ||
    contact.lastIncomingChannel === "webchat" ||
    contact.primaryChannel === "webchat" ||
    contact.source === "webchat" ||
    conversation?.channel === "webchat"
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

/**
 * Presence only. A quiet or closed widget after WEBCHAT_SESSION_IDLE_MS is offline,
 * not an invalid conversation. Outbound storage must not use this gate.
 */
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

export function isWebchatOutboundDuplicate(params: {
  candidate: {
    direction?: string | null;
    status?: string | null;
    content?: string | null;
    mediaUrl?: string | null;
    createdAt?: string | Date | null;
  };
  content: string;
  mediaUrl?: string | null;
  now?: number;
  windowMs?: number;
}): boolean {
  if (params.candidate.direction !== "outbound") return false;
  if (params.candidate.status === "failed") return false;
  if ((params.candidate.content || "") !== (params.content || "")) return false;
  if ((params.candidate.mediaUrl || "") !== (params.mediaUrl || "")) return false;
  const created = params.candidate.createdAt ? new Date(params.candidate.createdAt).getTime() : 0;
  if (!created) return false;
  return (params.now ?? Date.now()) - created < (params.windowMs ?? WEBCHAT_OUTBOUND_DEDUP_MS);
}

export function webchatConversationIsInaccessible(conversation?: Conversation | null): boolean {
  const status = String(conversation?.status || "").toLowerCase();
  return (HARD_BLOCKED_CONVERSATION_STATUSES as readonly string[]).includes(status);
}

export function webchatConversationShouldReopenOnOutbound(conversation?: Conversation | null): boolean {
  const status = String(conversation?.status || "").toLowerCase();
  return (RE_ENGAGEMENT_REOPENABLE_CONVERSATION_STATUSES as readonly string[]).includes(status);
}

export type WebchatStoredReplyGate =
  | { ok: true }
  | { ok: false; error: string; code: WebchatSendErrorCode };

/**
 * Tenant-scoped store-and-poll eligibility. Does not require the visitor to be online.
 */
export async function evaluateWebchatStoredReplyGate(params: {
  workspaceUserId: string;
  contact: Contact;
  conversation?: Conversation | null;
}): Promise<WebchatStoredReplyGate> {
  const { workspaceUserId, contact, conversation } = params;
  if (contact.userId !== workspaceUserId) {
    return { ok: false, error: WEBCHAT_CONVERSATION_INACCESSIBLE_MESSAGE, code: "webchat_conversation_inaccessible" };
  }
  if (!(await isWebchatConfiguredForWorkspace(workspaceUserId))) {
    return { ok: false, error: WEBCHAT_NOT_CONFIGURED_MESSAGE, code: "webchat_not_configured" };
  }
  if (!readWebchatVisitorId(contact)) {
    return {
      ok: false,
      error: WEBCHAT_VISITOR_IDENTITY_INVALID_MESSAGE,
      code: "webchat_conversation_inaccessible",
    };
  }
  if (!conversation) return { ok: true };
  if (conversation.userId !== workspaceUserId || conversation.contactId !== contact.id) {
    return { ok: false, error: WEBCHAT_CONVERSATION_INACCESSIBLE_MESSAGE, code: "webchat_conversation_inaccessible" };
  }
  if (conversation.channel !== "webchat") {
    return { ok: false, error: WEBCHAT_CONVERSATION_INACCESSIBLE_MESSAGE, code: "webchat_conversation_inaccessible" };
  }
  if (webchatConversationIsInaccessible(conversation)) {
    return { ok: false, error: WEBCHAT_CONVERSATION_INACCESSIBLE_MESSAGE, code: "webchat_conversation_inaccessible" };
  }
  return { ok: true };
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
