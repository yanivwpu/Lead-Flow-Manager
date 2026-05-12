import type { Chat, Contact } from "@shared/schema";
import { findOrCreateChatByPhone } from "./userTwilio";
import {
  triggerKeywordWorkflows,
  triggerNewChatWorkflows,
  triggerPipelineChangeWorkflows,
  triggerTagChangeWorkflows,
} from "./workflowEngine";

const DEDUP_TTL_MS = 3_000;
const recentAutomationKeys = new Map<string, number>();

function automationDedupeHit(key: string): boolean {
  const now = Date.now();
  for (const [k, t] of recentAutomationKeys) {
    if (now - t > DEDUP_TTL_MS) recentAutomationKeys.delete(k);
  }
  // Prevent unbounded growth if many unique contacts churn through without key reuse
  const MAX_KEYS = 5_000;
  while (recentAutomationKeys.size > MAX_KEYS) {
    const first = recentAutomationKeys.keys().next().value;
    if (first === undefined) break;
    recentAutomationKeys.delete(first);
  }
  if (recentAutomationKeys.has(key)) return true;
  recentAutomationKeys.set(key, now);
  return false;
}

/**
 * Resolve a legacy `chats` row used by workflow execution + workflow_executions.chat_id.
 */
export async function resolveLegacyChatForContact(contact: Contact, userId: string): Promise<Chat | null> {
  const raw = (contact.whatsappId || contact.phone || "").replace(/\D/g, "");
  if (!raw || raw.length < 8) {
    return null;
  }
  try {
    return await findOrCreateChatByPhone(userId, raw, contact.name || raw);
  } catch {
    return null;
  }
}

export type ContactAutomationDiff = {
  userId: string;
  before: Contact;
  after: Contact;
};

/**
 * Fires tag_change / pipeline_change automations after a contact row update.
 * Call sites should pass `skipAutomationHooks` from `storage.updateContact` for workflow-originated writes.
 */
export async function dispatchAutomationContactDiff(params: ContactAutomationDiff): Promise<void> {
  const { userId, before, after } = params;
  if (before.tag !== after.tag) {
    const dk = `tag:${after.id}:${before.tag}->${after.tag}`;
    if (automationDedupeHit(dk)) {
      console.log(
        JSON.stringify({
          tag: "[AutomationDispatcher]",
          event: "contact_tag_changed",
          deduped: true,
          contactId: after.id,
        })
      );
      return;
    }
    const chat = await resolveLegacyChatForContact(after, userId);
    if (!chat) {
      console.log(
        JSON.stringify({
          tag: "[AutomationDispatcher]",
          event: "contact_tag_changed",
          skipped: true,
          reason: "no_legacy_chat",
          contactId: after.id,
        })
      );
      return;
    }
    await triggerTagChangeWorkflows(
      userId,
      chat,
      before.tag || "New",
      after.tag || "New",
      after,
      undefined
    );
  }

  if (before.pipelineStage !== after.pipelineStage) {
    const dk = `stage:${after.id}:${before.pipelineStage}->${after.pipelineStage}`;
    if (automationDedupeHit(dk)) {
      console.log(
        JSON.stringify({
          tag: "[AutomationDispatcher]",
          event: "contact_stage_changed",
          deduped: true,
          contactId: after.id,
        })
      );
      return;
    }
    const chat = await resolveLegacyChatForContact(after, userId);
    if (!chat) {
      console.log(
        JSON.stringify({
          tag: "[AutomationDispatcher]",
          event: "pipeline_changed",
          skipped: true,
          reason: "no_legacy_chat",
          contactId: after.id,
        })
      );
      return;
    }
    await triggerPipelineChangeWorkflows(
      userId,
      chat,
      before.pipelineStage || "Lead",
      after.pipelineStage || "Lead",
      after,
      undefined
    );
  }
}

export type InboundMessagingAutomationParams = {
  userId: string;
  isNewChat: boolean;
  updatedChat: Chat;
  messageBody: string;
  contact?: Contact;
  conversationId?: string;
  /** When true, skip keyword workflows (e.g. chatbot owns reply) */
  skipKeywordWorkflows?: boolean;
};

/** Central entry for inbound-driven CRM workflow triggers (new_chat + keyword). */
export async function dispatchInboundMessagingAutomation(
  params: InboundMessagingAutomationParams
): Promise<void> {
  const { userId, isNewChat, updatedChat, messageBody, contact, conversationId, skipKeywordWorkflows } = params;
  if (isNewChat) {
    triggerNewChatWorkflows(userId, updatedChat, contact, conversationId).catch((err) =>
      console.error("[AutomationDispatcher] new_chat workflows:", err)
    );
  }
  if (!skipKeywordWorkflows) {
    triggerKeywordWorkflows(userId, updatedChat, messageBody, contact, conversationId).catch((err) =>
      console.error("[AutomationDispatcher] keyword workflows:", err)
    );
  }
}

/** Reserved hook for future AI-score-driven automations (no default workflows today). */
export async function dispatchAiScoreChanged(_params: {
  userId: string;
  contactId: string;
  score?: number;
  bucket?: string;
}): Promise<void> {
  // Intentionally empty — Phase 1 wires the event surface without adding new trigger types.
}

/** Reserved hook for booking-intent automations beyond keyword/W3 paths. */
export async function dispatchBookingIntentDetected(_params: {
  userId: string;
  contactId: string;
  conversationId?: string;
}): Promise<void> {
  // Intentionally empty — RGE W3 remains in workflowEngine + routes.
}
