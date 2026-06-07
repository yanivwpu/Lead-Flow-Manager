import {
  automationSendGuardBlockUserMessage,
  HARD_BLOCKED_CONVERSATION_STATUSES,
  RE_ENGAGEMENT_REOPENABLE_CONVERSATION_STATUSES,
  type AutomationSendGuardBlockReason as SharedAutomationSendGuardBlockReason,
} from "@shared/automationSendGuardMessages";
import { storage } from "./storage";
import type { Channel, Contact, Conversation } from "@shared/schema";

export { automationSendGuardBlockUserMessage };

export type AutomationSendDedupResult<T> =
  | { ok: true; result: T }
  | { ok: false; skipped: true };

export type AutomationSendGuardSource =
  | "ai_auto"
  | "workflow"
  | "delayed_job"
  | "template"
  | "broadcast"
  | "follow_up"
  | "booking_flow"
  | "chatbot"
  | "campaign";

export type AutomationSendGuardBlockReason = SharedAutomationSendGuardBlockReason;

export type AutomationSendGuardDecision =
  | { ok: true; contact: Contact; conversation?: Conversation; channel?: Channel }
  | { ok: false; reason: AutomationSendGuardBlockReason; detail?: string };

export type AutomationSendGuardParams = {
  userId: string;
  contactId: string;
  /** Required for idempotency. One logical automated send attempt = one stable key. */
  idempotencyKey: string;
  source: AutomationSendGuardSource;
  channel?: Channel | string | null;
  conversationId?: string | null;
  /** Most automation sends should not create/reopen closed conversations. */
  allowMissingConversation?: boolean;
  /**
   * WhatsApp re-engagement template sends (`templates_campaign`) may target conversations
   * closed/resolved/archived/inactive; hard blocks (blocked/deleted/wrong_user) still apply.
   */
  allowReEngagementTemplateSend?: boolean;
};

function normalizedChannel(channel: unknown): Channel | undefined {
  const ch = String(channel || "").trim().toLowerCase();
  if (!ch) return undefined;
  return ch as Channel;
}

function contactCustomFields(contact: Contact): Record<string, unknown> {
  const cf = contact.customFields;
  return cf && typeof cf === "object" && !Array.isArray(cf) ? (cf as Record<string, unknown>) : {};
}

export function contactHasDoNotContact(contact: Contact): { blocked: boolean; reason?: AutomationSendGuardBlockReason; detail?: string } {
  const tag = String(contact.tag || "").toLowerCase();
  const stage = String(contact.pipelineStage || "").toLowerCase();
  const cf = contactCustomFields(contact);
  const text = `${tag} ${stage}`;

  if (/\b(do not contact|dnc|stop|unsubscribe|unsubscribed|opt\s*out|remove me)\b/i.test(text)) {
    return { blocked: true, reason: "do_not_contact", detail: "tag_or_stage" };
  }
  if (cf.campaignOptOut === true || cf.marketingOptIn === false) {
    return { blocked: true, reason: "unsubscribed", detail: "marketing_opt_out" };
  }
  for (const key of ["doNotContact", "dnc", "optOut", "optedOut", "unsubscribed", "unsubscribe", "stop"]) {
    if (cf[key] === true) {
      return { blocked: true, reason: "unsubscribed", detail: key };
    }
  }
  return { blocked: false };
}

function contactEligibleForChannel(contact: Contact, channel: Channel | undefined): boolean {
  if (!channel) return true;
  switch (channel) {
    case "whatsapp":
      return !!(contact.whatsappId || contact.phone);
    case "sms":
      return !!contact.phone;
    case "instagram":
      return !!contact.instagramId;
    case "facebook":
      return !!contact.facebookId;
    case "telegram":
      return !!contact.telegramId;
    case "calendly":
      return !!contact.email;
    case "tiktok":
      return false;
    case "gohighlevel":
      return !!contact.ghlId;
    case "webchat":
      return true;
    default:
      return true;
  }
}

export function isConversationInactiveForAutomation(
  conversation: Conversation | undefined,
  opts?: { allowReEngagementTemplateSend?: boolean }
): boolean {
  if (!conversation) return false;
  const status = String(conversation.status || "").toLowerCase();
  if ((HARD_BLOCKED_CONVERSATION_STATUSES as readonly string[]).includes(status)) {
    return true;
  }
  if (
    opts?.allowReEngagementTemplateSend &&
    (RE_ENGAGEMENT_REOPENABLE_CONVERSATION_STATUSES as readonly string[]).includes(status)
  ) {
    return false;
  }
  return [
    ...RE_ENGAGEMENT_REOPENABLE_CONVERSATION_STATUSES,
    ...HARD_BLOCKED_CONVERSATION_STATUSES,
  ].includes(status as (typeof RE_ENGAGEMENT_REOPENABLE_CONVERSATION_STATUSES)[number]);
}

export async function evaluateAutomationSendGuard(
  params: AutomationSendGuardParams
): Promise<AutomationSendGuardDecision> {
  const idempotencyKey = String(params.idempotencyKey || "").trim();
  if (!idempotencyKey) {
    return { ok: false, reason: "missing_idempotency_key" };
  }

  const contact = await storage.getContact(params.contactId);
  if (!contact) {
    return { ok: false, reason: "contact_missing" };
  }
  if (contact.userId !== params.userId) {
    return { ok: false, reason: "contact_wrong_user" };
  }

  const dnc = contactHasDoNotContact(contact);
  if (dnc.blocked) {
    return { ok: false, reason: dnc.reason || "do_not_contact", detail: dnc.detail };
  }

  let channel = normalizedChannel(params.channel);
  let conversation: Conversation | undefined;
  if (params.conversationId) {
    conversation = await storage.getConversation(params.conversationId);
    if (conversation && conversation.userId !== params.userId) {
      return { ok: false, reason: "conversation_inactive", detail: "wrong_user" };
    }
    if (conversation?.channel) {
      channel = normalizedChannel(conversation.channel) || channel;
    }
  } else if (channel) {
    conversation = await storage.getConversationByContactAndChannel(contact.id, channel);
  }

  if (
    isConversationInactiveForAutomation(conversation, {
      allowReEngagementTemplateSend: params.allowReEngagementTemplateSend,
    })
  ) {
    return {
      ok: false,
      reason: "conversation_inactive",
      detail: conversation?.status || "inactive",
    };
  }

  if (!contactEligibleForChannel(contact, channel)) {
    return {
      ok: false,
      reason: "channel_ineligible",
      detail: channel || "unknown",
    };
  }

  return { ok: true, contact, conversation, channel };
}

export type AutomationGuardedSendResult<T> =
  | { ok: true; result: T }
  | { ok: false; skipped: true; reason: AutomationSendGuardBlockReason; detail?: string };

export async function withAutomationSendGuard<T>(
  params: AutomationSendGuardParams,
  fn: (decision: Extract<AutomationSendGuardDecision, { ok: true }>) => Promise<T>
): Promise<AutomationGuardedSendResult<T>> {
  const decision = await evaluateAutomationSendGuard(params);
  if (!decision.ok) {
    console.warn(
      JSON.stringify({
        tag: "[AutomationSendGuard]",
        event: "blocked",
        source: params.source,
        userId: params.userId,
        contactId: params.contactId,
        conversationId: params.conversationId ?? null,
        channel: params.channel ?? decision.detail ?? null,
        idempotencyKey: params.idempotencyKey,
        reason: decision.reason,
        detail: decision.detail,
      })
    );
    return { ok: false, skipped: true, reason: decision.reason, detail: decision.detail };
  }

  const acquired = await storage.tryAcquireAutomationSendDedup(params.idempotencyKey, params.userId, params.contactId);
  if (!acquired) {
    return { ok: false, skipped: true, reason: "duplicate" };
  }
  try {
    const result = await fn(decision);
    await storage.completeAutomationSendDedup(params.idempotencyKey, "completed");
    return { ok: true, result };
  } catch (e) {
    await storage.completeAutomationSendDedup(params.idempotencyKey, "skipped");
    throw e;
  }
}

/**
 * Runs `fn` only if dedup key can be acquired. Always completes dedup row to terminal status.
 */
export async function withAutomationSendDedup<T>(
  dedupKey: string,
  userId: string,
  contactId: string | null | undefined,
  fn: () => Promise<T>
): Promise<AutomationSendDedupResult<T>> {
  const acquired = await storage.tryAcquireAutomationSendDedup(dedupKey, userId, contactId ?? null);
  if (!acquired) {
    return { ok: false, skipped: true };
  }
  try {
    const result = await fn();
    await storage.completeAutomationSendDedup(dedupKey, "completed");
    return { ok: true, result };
  } catch (e) {
    await storage.completeAutomationSendDedup(dedupKey, "skipped");
    throw e;
  }
}
