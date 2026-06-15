import { storage } from "./storage";
import { subscriptionService } from "./subscriptionService";
import { notifyUser } from "./presence";
import crypto from "crypto";
import {
  type Contact, type Conversation, type Message, type Channel,
  CHANNEL_INFO, CHANNELS,
} from "@shared/schema";
import {
  AI_HANDOFF_RESOLVED_EVENT,
  isConversationHandoffActive,
} from "@shared/handoffActivity";
import { matchesHandoffKeyword } from "@shared/aiRouting";
import { detectHighConfidenceBookingIntent } from "@shared/bookingIntent";
import { detectSellerConsultationBookingIntent, classifySellerIntent, isPureSellerIntent } from "@shared/sellerIntent";
import { db } from "../drizzle/db";
import { messages as messagesTbl } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { scheduleHubSpotAutoSync } from "./hubspotAutoSync";
import { parseConversationReEngagement } from "@shared/reEngagement";
import {
  isAlreadyCanonicalPermanentUrl,
  persistInboundMedia,
  type PersistInboundMediaAuth,
} from "./mediaStorageService";
import { sanitizeCalendlyBookingLinks } from "@shared/calendlyBookingMessage";
import { decryptCredential, isEncrypted } from "./userTwilio";
import {
  coerceReplyWindowErrorToUserMessage,
  errorLooksLikeReplyWindowOrTemplateBlock,
  isMetaReplyWindowExpiredError,
  userFacingReplyWindowBlockedMessageInbox,
} from "@shared/metaReplyWindowError";
import {
  inboundProcessingLog,
  type InboundProcessingResult,
  type InboundProcessingSubState,
} from "@shared/inboundProcessing";

type ForceChannelInput = Channel | string | undefined;

/** Simple greeting classification for business auto-reply (inlined so deploy has no extra module). */
type GreetingInboundKind = "none" | "pure" | "impatience";
const PURE_GREETING_RE =
  /^(hi|hello|hey|yo|sup|hola|good morning|good afternoon|good evening|gm|gn|howdy|greetings|good day)[\s!?.]*$/i;

function classifyGreetingInbound(text: string): GreetingInboundKind {
  const t = text.trim();
  if (!t || t.length > 120) return "none";
  const lower = t.toLowerCase();
  const greetingStem =
    /^(hi|hello|hey|good morning|good afternoon|good evening|yo|sup|hola|howdy|greetings|good day)\b/i;
  if (!greetingStem.test(lower)) return "none";
  if (/\?\?/.test(t)) return "impatience";
  if (/\?$/.test(t) && t.length <= 35) return "impatience";
  if (/!{2,}/.test(t) && t.length <= 40) return "impatience";
  if (PURE_GREETING_RE.test(t)) return "pure";
  return "none";
}

function nicheGreetingOpener(industryRaw: string | null | undefined): string {
  const i = (industryRaw || "").toLowerCase();
  if (
    i.includes("real estate") ||
    i.includes("real_estate") ||
    i.includes("realtor") ||
    i.includes("property")
  ) {
    return "Hi! Are you looking to buy or sell?";
  }
  if (i.includes("clinic") || i.includes("health") || i.includes("medical") || i.includes("dental")) {
    return "Hi! How can we help you today?";
  }
  if (i.includes("travel") || i.includes("tour")) {
    return "Hi! Where would you like to go?";
  }
  return "Hi! What can we help you with today?";
}

const LIGHT_GREETING_FOLLOWUP = "Hi again! How can I help?";
const IMPATIENCE_GREETING_REPLY = "Hey! Sorry about that — how can I help?";

const GREETING_ACTIVITY = {
  niche: "auto_greeting_niche",
  light: "auto_greeting_light",
  impatience: "auto_greeting_impatience",
} as const;

async function countMessagesInConversation(conversationId: string): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(messagesTbl)
    .where(eq(messagesTbl.conversationId, conversationId));
  return Number(row?.c ?? 0);
}

function isUniqueExternalMessageViolation(err: unknown): boolean {
  const e = err as { code?: string; constraint?: string; message?: string; detail?: string };
  if (e?.code !== "23505") return false;
  const joined = `${e.constraint || ""} ${e.message || ""} ${e.detail || ""}`;
  return joined.includes("messages_user_external_message_id_uq") || joined.includes("external_message_id");
}

function logInboundDuplicateIgnored(provider: string, externalMessageId: string): void {
  console.log(
    JSON.stringify({
      tag: "[InboundDedup]",
      event: "duplicate_ignored",
      provider,
      external_message_id: externalMessageId,
    })
  );
}

function buildInboundResult(params: {
  success: boolean;
  contact: Contact | null;
  conversation: Conversation | null;
  message: Message | null;
  workflowState?: InboundProcessingSubState;
  chatbotState?: InboundProcessingSubState & { willFire: boolean };
  automationState?: InboundProcessingSubState;
  created?: Partial<InboundProcessingResult["created"]>;
  updated?: Partial<InboundProcessingResult["updated"]>;
  deduped?: boolean;
  channel: Channel;
  sourceEventId?: string | null;
  errors?: InboundProcessingResult["errors"];
  isNewConversation?: boolean;
  chatbotWillFire?: boolean;
}): InboundProcessingResult {
  const chatbotWillFire = params.chatbotWillFire ?? params.chatbotState?.willFire ?? false;
  const result: InboundProcessingResult = {
    success: params.success,
    contact: params.contact,
    conversation: params.conversation,
    message: params.message,
    workflowState: params.workflowState || { status: "skipped", reason: "not_evaluated" },
    chatbotState: params.chatbotState || { status: "skipped", reason: "not_evaluated", willFire: chatbotWillFire },
    automationState: params.automationState || { status: "skipped", reason: "not_evaluated" },
    created: {
      contact: Boolean(params.created?.contact),
      conversation: Boolean(params.created?.conversation),
      message: Boolean(params.created?.message),
    },
    updated: {
      contact: Boolean(params.updated?.contact),
      conversation: Boolean(params.updated?.conversation),
      message: Boolean(params.updated?.message),
    },
    deduped: Boolean(params.deduped),
    channel: params.channel,
    sourceEventId: params.sourceEventId || null,
    errors: params.errors || [],
    isNewConversation: Boolean(params.isNewConversation),
    chatbotWillFire,
  };
  if (!result.contact) inboundProcessingLog("missing_contact", { channel: params.channel, sourceEventId: result.sourceEventId });
  if (!result.conversation) inboundProcessingLog("missing_conversation", { channel: params.channel, sourceEventId: result.sourceEventId });
  if (!result.workflowState || !result.chatbotState || !result.automationState) {
    inboundProcessingLog("missing_state", { channel: params.channel, sourceEventId: result.sourceEventId });
  }
  if (result.workflowState.status === "skipped") {
    inboundProcessingLog("workflow_skipped", { channel: params.channel, sourceEventId: result.sourceEventId, reason: result.workflowState.reason || null });
  }
  if (result.automationState.status === "skipped") {
    inboundProcessingLog("automation_skipped", { channel: params.channel, sourceEventId: result.sourceEventId, reason: result.automationState.reason || null });
  }
  return result;
}

/** Inbox WhatsApp free-form: enforce ~23h from last inbound when DB stores a 24h ceiling (1h safety margin). */
const WHATSAPP_INBOX_CSW_BUFFER_MS = 60 * 60 * 1000;

const WHATSAPP_WINDOW_EXPIRED_MSG = userFacingReplyWindowBlockedMessageInbox("whatsapp");
const CALENDLY_CONTEXT_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

/** Human-readable last-message preview for media messages. */
function mediaPreviewLabel(contentType?: string): string {
  switch (contentType) {
    case 'image':    return 'Photo';
    case 'video':    return 'Video';
    case 'audio':    return 'Audio';
    case 'document': return 'Document';
    default:         return 'Media';
  }
}

async function rememberCalendlyBookingContext(contact: Contact, context: {
  userId: string;
  contactId: string;
  conversationId: string;
  channel: Channel;
  token: string;
  calendlyUrls: string[];
}): Promise<void> {
  if (context.calendlyUrls.length === 0) return;
  const now = new Date();
  const customFields = ((contact.customFields as Record<string, unknown> | null) || {}) as Record<string, unknown>;
  const existing = Array.isArray(customFields._calendlyBookingContexts)
    ? customFields._calendlyBookingContexts.filter((raw) => {
        const item = raw as Record<string, unknown>;
        const sentAt = typeof item.bookingLinkSentAt === "string" ? Date.parse(item.bookingLinkSentAt) : 0;
        return sentAt > Date.now() - CALENDLY_CONTEXT_RETENTION_MS;
      })
    : [];
  const nextContext = {
    userId: context.userId,
    contactId: context.contactId,
    conversationId: context.conversationId,
    channel: context.channel,
    eventTypeUri: context.calendlyUrls[0] || null,
    trackingToken: context.token,
    bookingLinkSentAt: now.toISOString(),
    calendlyUrls: context.calendlyUrls.slice(0, 3),
  };
  await storage.updateContact(
    context.contactId,
    {
      customFields: {
        ...customFields,
        _calendlyBookingContexts: [nextContext, ...existing].slice(0, 10),
      },
    } as any,
    { skipAutomationHooks: true }
  );
  console.log(JSON.stringify({
    tag: "[CalendlyBookingContext]",
    event: "outbound_context_stored",
    userId: context.userId,
    contactId: context.contactId,
    conversationId: context.conversationId,
    channel: context.channel,
    calendlyUrlCount: context.calendlyUrls.length,
  }));
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  channel: Channel;
  externalMessageId?: string;
  error?: string;
  fallbackUsed?: boolean;
}

export interface ChannelAdapter {
  send(params: {
    contactId: string;
    conversationId: string;
    content: string;
    contentType?: string;
    mediaUrl?: string;
    mediaFilename?: string;
  }): Promise<{ success: boolean; externalMessageId?: string; error?: string }>;
  
  isAvailable(userId: string): Promise<boolean>;
}

class ChannelService {
  private adapters: Map<Channel, ChannelAdapter> = new Map();

  getPrimaryChannel(contact: Contact): Channel {
    if (contact.primaryChannelOverride) {
      const override = contact.primaryChannelOverride as Channel;
      // Only use the override if the contact actually has an identifier for that channel.
      // If the override points to a channel with no contact ID (e.g. override="facebook"
      // but facebookId is null), fall through to the natural channel so we don't send
      // to a dead-end and get "Contact X ID not found" errors.
      const channelIdField: Record<string, keyof Contact> = {
        whatsapp:  'whatsappId',
        instagram: 'instagramId',
        facebook:  'facebookId',
        sms:       'phone',
        telegram:  'telegramId',
        calendly:  'email',
      };
      const idField = channelIdField[override];
      const hasId = !idField || !!contact[idField];
      if (hasId) return override;
    }
    return (contact.lastIncomingChannel || contact.primaryChannel || 'whatsapp') as Channel;
  }

  getMessagingChannels(): Channel[] {
    return CHANNELS.filter(ch => CHANNEL_INFO[ch].isMessaging);
  }

  async getEnabledChannels(userId: string): Promise<Channel[]> {
    const settings = await storage.getChannelSettings(userId);
    const enabledChannels: Channel[] = ['whatsapp'];
    
    for (const setting of settings) {
      if (setting.isEnabled && setting.isConnected) {
        enabledChannels.push(setting.channel as Channel);
      }
    }
    
    return Array.from(new Set(enabledChannels));
  }

  async getFallbackChannels(userId: string): Promise<Channel[]> {
    const settings = await storage.getChannelSettings(userId);
    return settings
      .filter(s => s.fallbackEnabled && s.isConnected)
      .sort((a, b) => (a.fallbackPriority || 0) - (b.fallbackPriority || 0))
      .map(s => s.channel as Channel);
  }

  /** Sync checks only — used for delivery fallback so we never SMS/WhatsApp/etc. without identifiers. */
  private contactHasIdentifiersForChannel(contact: Contact, channel: Channel): boolean {
    if (channel === 'webchat') {
      return (
        contact.lastIncomingChannel === 'webchat' ||
        contact.primaryChannel === 'webchat' ||
        contact.source === 'webchat'
      );
    }
    if (channel === 'gohighlevel') return !!contact.ghlId;
    const channelIdField: Partial<Record<Channel, keyof Contact>> = {
      whatsapp: 'whatsappId',
      instagram: 'instagramId',
      facebook: 'facebookId',
      sms: 'phone',
      telegram: 'telegramId',
      calendly: 'email',
    };
    const idField = channelIdField[channel];
    if (!idField) return true;
    return !!contact[idField];
  }

  /** Validates outbound-only constraints when the client forces a channel (no silent fallback). */
  private async validateForcedOutboundChannel(
    userId: string,
    contact: Contact,
    channel: Channel
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (!CHANNEL_INFO[channel]?.isMessaging) {
      return { ok: false, reason: 'This channel cannot be used for outbound messaging' };
    }

    if (channel === 'webchat') {
      const conv = await storage.getConversationByContactAndChannel(contact.id, 'webchat');
      const ok =
        contact.lastIncomingChannel === 'webchat' ||
        contact.primaryChannel === 'webchat' ||
        contact.source === 'webchat' ||
        !!conv;
      if (!ok) {
        return { ok: false, reason: 'This contact has no web chat session — cannot send on Web Chat' };
      }
    } else if (channel === 'gohighlevel' && !contact.ghlId) {
      return { ok: false, reason: 'Contact has no GoHighLevel identifier — cannot send on this channel' };
    } else {
      const channelIdField: Partial<Record<Channel, keyof Contact>> = {
        whatsapp: 'whatsappId',
        instagram: 'instagramId',
        facebook: 'facebookId',
        sms: 'phone',
        telegram: 'telegramId',
        calendly: 'email',
      };
      const idField = channelIdField[channel];
      if (idField && !contact[idField]) {
        return { ok: false, reason: 'Contact has no identifier for this channel — choose another channel or update the contact' };
      }
    }

    const enabled = await this.getEnabledChannels(userId);
    if (!enabled.includes(channel)) {
      return { ok: false, reason: `${CHANNEL_INFO[channel].label} is not connected for this workspace` };
    }

    const adapter = this.adapters.get(channel);
    if (adapter) {
      const available = await adapter.isAvailable(userId);
      if (!available) {
        return { ok: false, reason: `${CHANNEL_INFO[channel].label} is not available — check connection settings` };
      }
    }

    return { ok: true };
  }

  /**
   * Inbox/contact free-form WhatsApp: block outside customer service window (23h effective vs 24h stored).
   * Does not apply to other channels or to internal callers that omit enforceWhatsAppCustomerServiceWindow.
   */
  private assertWhatsAppInboxCustomerServiceWindow(conversation: Conversation): {
    ok: true;
  } | {
    ok: false;
    reason: string;
  } {
    if (conversation.channel !== 'whatsapp') return { ok: true };
    const raw = conversation.windowExpiresAt;
    if (!raw) {
      return { ok: false, reason: 'no_window_expires_at' };
    }
    const expiresAtMs = new Date(raw).getTime();
    const freeFormDeadlineMs = expiresAtMs - WHATSAPP_INBOX_CSW_BUFFER_MS;
    if (Date.now() >= freeFormDeadlineMs) {
      return { ok: false, reason: 'outside_customer_service_window' };
    }
    return { ok: true };
  }

  async sendMessage(params: {
    userId: string;
    contactId: string;
    content?: string;
    contentType?: string;
    mediaUrl?: string;
    mediaType?: string;
    mediaFilename?: string;
    forceChannel?: ForceChannelInput;
    /** When true (e.g. inbox user picked a channel), validate availability and never delivery-fallback to another channel. */
    suppressFallback?: boolean;
    /** When true (Unified Inbox / POST /api/contacts/:id/send), block WhatsApp free-form outside CSW. */
    enforceWhatsAppCustomerServiceWindow?: boolean;
    templateVariables?: Record<string, any>;
  }): Promise<SendMessageResult> {
    const {
      userId,
      contactId,
      contentType = 'text',
      mediaUrl,
      mediaType,
      mediaFilename,
      forceChannel,
      suppressFallback,
      enforceWhatsAppCustomerServiceWindow,
      templateVariables,
    } = params;
    let content = params.content ?? '';

    if (!content && !mediaUrl) {
      return { success: false, channel: 'whatsapp', error: 'Message must have content or media' };
    }

    const contact = await storage.getContact(contactId);
    if (!contact) {
      return { success: false, channel: 'whatsapp', error: 'Contact not found' };
    }

    const rawForce = forceChannel;
    const trimmedForce =
      rawForce === undefined || rawForce === null
        ? ''
        : String(rawForce).trim();
    const explicitForce = trimmedForce.length > 0;
    const pinChannelNoFallback = explicitForce && suppressFallback === true;

    let targetChannel: Channel;

    if (explicitForce) {
      if (!(CHANNELS as readonly string[]).includes(trimmedForce)) {
        console.warn(`[sendMessage] blocked contactId=${contactId} selectedChannel=${trimmedForce} reason=invalid_channel`);
        return { success: false, channel: 'whatsapp', error: 'Invalid channel' };
      }
      const forced = trimmedForce as Channel;
      if (pinChannelNoFallback) {
        const gate = await this.validateForcedOutboundChannel(userId, contact, forced);
        if (!gate.ok) {
          console.warn(
            `[sendMessage] blocked contactId=${contactId} selectedChannel=${forced} reason=${gate.reason}`
          );
          return { success: false, channel: forced, error: gate.reason };
        }
      }
      targetChannel = forced;
    } else {
      targetChannel = this.getPrimaryChannel(contact);
    }

    console.log(
      `[sendMessage] start contactId=${contactId} selectedChannel=${explicitForce ? targetChannel : '(auto)'} resolvedChannel=${targetChannel} suppressFallback=${pinChannelNoFallback}`
    );

    let conversation = await storage.getConversationByContactAndChannel(contactId, targetChannel);
    if (!conversation) {
      conversation = await storage.createConversation({
        userId,
        contactId,
        channel: targetChannel,
        status: 'open',
      });
      await subscriptionService.incrementConversationUsage(userId);
    }

    if (enforceWhatsAppCustomerServiceWindow === true && targetChannel === 'whatsapp') {
      const waWin = this.assertWhatsAppInboxCustomerServiceWindow(conversation);
      if (!waWin.ok) {
        console.warn(
          `[sendMessage] whatsapp_window_blocked contactId=${contactId} conversationId=${conversation.id} ` +
            `selectedChannel=${explicitForce ? targetChannel : '(auto)'} finalChannel=whatsapp ` +
            `windowExpiresAt=${conversation.windowExpiresAt ?? 'null'} reason=${waWin.reason}`
        );
        const preview = content || (mediaUrl ? mediaPreviewLabel(contentType) : "");
        const failed = await storage.createMessage({
          conversationId: conversation.id,
          contactId,
          userId,
          direction: "outbound",
          content,
          contentType,
          mediaUrl,
          mediaType,
          mediaFilename,
          status: "failed",
          errorMessage: WHATSAPP_WINDOW_EXPIRED_MSG,
          errorCode: "meta_reply_window",
        });
        await storage.updateConversation(conversation.id, {
          lastMessageAt: new Date(),
          lastMessagePreview: preview.substring(0, 100),
          lastMessageDirection: "outbound",
        });
        return {
          success: false,
          channel: "whatsapp",
          error: WHATSAPP_WINDOW_EXPIRED_MSG,
          messageId: failed.id,
        };
      }
    }

    const bookingContextToken = crypto.randomBytes(12).toString("hex");
    const calendlyLinks = sanitizeCalendlyBookingLinks(content);
    if (calendlyLinks.calendlyUrls.length > 0) {
      content = calendlyLinks.content;
      await rememberCalendlyBookingContext(contact, {
        userId,
        contactId,
        conversationId: conversation.id,
        channel: targetChannel,
        token: bookingContextToken,
        calendlyUrls: calendlyLinks.calendlyUrls,
      }).catch((err) =>
        console.warn(`[CalendlyBookingContext] store failed contactId=${contactId}: ${err instanceof Error ? err.message : String(err)}`)
      );
    }

    const message = await storage.createMessage({
      conversationId: conversation.id,
      contactId,
      userId,
      direction: 'outbound',
      content,
      contentType,
      mediaUrl,
      mediaType,
      mediaFilename,
      status: 'pending',
      ...(templateVariables ? { templateVariables } : {}),
    });

    const sendResult = await this.dispatchMessage(userId, targetChannel, {
      contactId,
      conversationId: conversation.id,
      content,
      contentType,
      mediaUrl,
      mediaFilename,
    });

    const preview = content || (mediaUrl ? mediaPreviewLabel(contentType) : '');

    if (sendResult.success) {
      console.log(
        `[sendMessage] success contactId=${contactId} finalChannel=${targetChannel} messageId=${message.id}`
      );
      console.log(`[Debug] Outgoing message sent — messageId: ${message.id}, conversationId: ${conversation.id}, channel: ${targetChannel}`);
      await storage.updateMessage(message.id, {
        status: 'sent',
        externalMessageId: sendResult.externalMessageId,
        sentAt: new Date(),
      });

      await storage.updateConversation(conversation.id, {
        lastMessageAt: new Date(),
        lastMessagePreview: preview.substring(0, 100),
        lastMessageDirection: 'outbound',
      });
      console.log(`[Debug] Conversation summary updated after outbound — conversationId: ${conversation.id}, preview: "${preview.substring(0, 60)}"`);

      await this.logActivity(userId, contactId, conversation.id, 'message', {
        direction: 'outbound',
        channel: targetChannel,
        preview: content.substring(0, 100),
      });

      await this.resolveHandoffIfActive(userId, contactId, conversation.id, "agent_outbound_message");

      void import("./automationNoReply").then(({ scheduleNoReplyJobsAfterTeamOutbound }) =>
        scheduleNoReplyJobsAfterTeamOutbound({
          userId,
          contactId,
          conversationId: conversation.id,
          channel: targetChannel,
        }).catch(() => {})
      );

      // Mirror outbound message to GHL if contact has a GHL ID (fire-and-forget)
      if (contact.ghlId) {
        import('./ghlSync').then(({ ghlSyncOutboundMessage }) => {
          ghlSyncOutboundMessage(userId, contact.ghlId!, content, targetChannel).catch(() => {});
        }).catch(() => {});
      }

      return {
        success: true,
        messageId: message.id,
        channel: targetChannel,
        externalMessageId: sendResult.externalMessageId,
      };
    }

    if (pinChannelNoFallback) {
      const rawErr = sendResult.error || "";
      const displayErr = coerceReplyWindowErrorToUserMessage(targetChannel, rawErr || "Message delivery failed");
      const windowClass =
        !!rawErr && (isMetaReplyWindowExpiredError(rawErr) || errorLooksLikeReplyWindowOrTemplateBlock(rawErr));
      await storage.updateMessage(message.id, {
        status: "failed",
        errorMessage: displayErr,
        ...(windowClass ? { errorCode: "meta_reply_window" as const } : {}),
      });
      console.warn(
        `[sendMessage] failed contactId=${contactId} finalChannel=${targetChannel} error=${sendResult.error || 'unknown'}`
      );
      return {
        success: false,
        messageId: message.id,
        channel: targetChannel,
        error: displayErr,
      };
    }

    const fallbackChannels = await this.getFallbackChannels(userId);
    for (const fallbackChannel of fallbackChannels) {
      if (fallbackChannel === targetChannel) continue;
      if (!this.contactHasIdentifiersForChannel(contact, fallbackChannel)) continue;

      let fallbackConv = await storage.getConversationByContactAndChannel(contactId, fallbackChannel);
      if (!fallbackConv) {
        fallbackConv = await storage.createConversation({
          userId,
          contactId,
          channel: fallbackChannel,
          status: 'open',
        });
        await subscriptionService.incrementConversationUsage(userId);
      }

      const fallbackResult = await this.dispatchMessage(userId, fallbackChannel, {
        contactId,
        conversationId: fallbackConv.id,
        content,
        contentType,
        mediaUrl,
        mediaFilename,
      });

      if (fallbackResult.success) {
        console.log(
          `[sendMessage] success contactId=${contactId} finalChannel=${fallbackChannel} messageId=${message.id} (fallback from ${targetChannel})`
        );
        await storage.updateMessage(message.id, {
          status: 'sent',
          externalMessageId: fallbackResult.externalMessageId,
          sentAt: new Date(),
          sentViaFallback: true,
          fallbackChannel: fallbackChannel,
        });

        await storage.updateConversation(fallbackConv.id, {
          lastMessageAt: new Date(),
          lastMessagePreview: content.substring(0, 100),
          lastMessageDirection: 'outbound',
        });

        await this.logActivity(userId, contactId, fallbackConv.id, 'channel_switch', {
          from: targetChannel,
          to: fallbackChannel,
          reason: 'delivery_fallback',
        });

        await this.resolveHandoffIfActive(userId, contactId, fallbackConv.id, "agent_outbound_message");

        void import("./automationNoReply").then(({ scheduleNoReplyJobsAfterTeamOutbound }) =>
          scheduleNoReplyJobsAfterTeamOutbound({
            userId,
            contactId,
            conversationId: fallbackConv.id,
            channel: fallbackChannel,
          }).catch(() => {})
        );

        return {
          success: true,
          messageId: message.id,
          channel: fallbackChannel,
          externalMessageId: fallbackResult.externalMessageId,
          fallbackUsed: true,
        };
      }
    }

    await storage.updateMessage(message.id, {
      status: "failed",
      errorMessage: coerceReplyWindowErrorToUserMessage(
        targetChannel,
        sendResult.error || "Message delivery failed"
      ),
      ...(sendResult.error &&
      (isMetaReplyWindowExpiredError(sendResult.error) ||
        errorLooksLikeReplyWindowOrTemplateBlock(sendResult.error))
        ? { errorCode: "meta_reply_window" as const }
        : {}),
    });

    console.warn(
      `[sendMessage] failed contactId=${contactId} finalChannel=${targetChannel} error=${sendResult.error || "unknown"}`
    );

    return {
      success: false,
      messageId: message.id,
      channel: targetChannel,
      error: coerceReplyWindowErrorToUserMessage(targetChannel, sendResult.error || "Message delivery failed"),
    };
  }

  private async dispatchMessage(
    userId: string,
    channel: Channel,
    params: {
      contactId: string;
      conversationId: string;
      content: string;
      contentType?: string;
      mediaUrl?: string;
      mediaFilename?: string;
    }
  ): Promise<{ success: boolean; externalMessageId?: string; error?: string }> {
    const adapter = this.adapters.get(channel);
    if (adapter) {
      return adapter.send(params);
    }

    return {
      success: true,
      externalMessageId: `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
  }

  private async persistInboundMediaIfNeeded(p: {
    userId: string;
    channel: Channel;
    contentType: string;
    mediaUrl?: string;
    mediaFilename?: string;
    platformMediaId?: string;
    telegramMedia?: { botToken: string; fileId: string };
  }): Promise<{
    mediaUrl?: string;
    mediaFilename?: string;
    providerMediaUrl?: string | null;
    providerMediaId?: string | null;
    mediaMimeType?: string | null;
    mediaSize?: number | null;
    mediaStorageKey?: string | null;
    mediaStoredAt?: Date | null;
    mediaType?: string | null;
  }> {
    const rawMediaUrl = p.mediaUrl?.trim() || "";
    const rawProviderMediaId = p.platformMediaId?.trim() || "";
    const hasMedia = !!rawMediaUrl || !!rawProviderMediaId || !!p.telegramMedia?.fileId;
    if (!hasMedia || p.contentType === "text") {
      return {};
    }

    const mediaType =
      p.contentType === "image" ||
      p.contentType === "video" ||
      p.contentType === "audio" ||
      p.contentType === "document" ||
      p.contentType === "sticker"
        ? p.contentType
        : "document";

    if (rawMediaUrl && isAlreadyCanonicalPermanentUrl(rawMediaUrl)) {
      return {
        mediaUrl: rawMediaUrl,
        mediaFilename: p.mediaFilename,
        providerMediaUrl: null,
        providerMediaId: rawProviderMediaId || null,
        mediaType,
      };
    }

    let auth: PersistInboundMediaAuth = { kind: "public" };
    if (p.channel === "whatsapp" && rawProviderMediaId) {
      auth = { kind: "meta-whatsapp-user", userId: p.userId };
    } else if (p.channel === "facebook" || p.channel === "instagram") {
      const setting = await storage.getChannelSetting(p.userId, p.channel);
      const token = (setting?.config as { accessToken?: string } | null | undefined)?.accessToken;
      auth = token ? { kind: "meta-page-bearer", accessToken: token } : { kind: "public" };
    } else if (p.telegramMedia?.botToken && p.telegramMedia.fileId) {
      auth = { kind: "telegram", botToken: p.telegramMedia.botToken, fileId: p.telegramMedia.fileId };
    } else if ((p.channel === "whatsapp" || p.channel === "sms") && rawMediaUrl && /twilio\.com/i.test(rawMediaUrl)) {
      const user = await storage.getUser(p.userId);
      if (user?.twilioAccountSid && user?.twilioAuthToken) {
        auth = {
          kind: "twilio-basic",
          accountSid: user.twilioAccountSid,
          authToken: isEncrypted(user.twilioAuthToken) ? decryptCredential(user.twilioAuthToken) : user.twilioAuthToken,
        };
      }
    }

    const persisted = await persistInboundMedia({
      userId: p.userId,
      channel: p.channel,
      providerMediaUrl: rawMediaUrl || null,
      providerMediaId: rawProviderMediaId || p.telegramMedia?.fileId || null,
      mediaType,
      filename: p.mediaFilename || null,
      auth,
    });

    if (!persisted) {
      console.warn(
        JSON.stringify({
          tag: "[InboundMediaPersist]",
          event: "failed",
          userId: p.userId,
          channel: p.channel,
          hasProviderUrl: !!rawMediaUrl,
          hasProviderMediaId: !!rawProviderMediaId,
        })
      );
      return rawMediaUrl
        ? {
            mediaUrl: rawMediaUrl,
            mediaFilename: p.mediaFilename,
            providerMediaUrl: rawMediaUrl,
            providerMediaId: rawProviderMediaId || null,
            mediaType,
          }
        : {};
    }

    console.log(
      JSON.stringify({
        tag: "[InboundMediaPersist]",
        event: "stored",
        userId: p.userId,
        channel: p.channel,
        mediaStorageKey: persisted.mediaStorageKey,
        providerMediaId: persisted.providerMediaId,
      })
    );

    return {
      mediaUrl: persisted.mediaUrl,
      mediaFilename: persisted.mediaFilename ?? p.mediaFilename,
      providerMediaUrl: persisted.providerMediaUrl,
      providerMediaId: persisted.providerMediaId,
      mediaMimeType: persisted.mediaMimeType,
      mediaSize: persisted.mediaSize,
      mediaStorageKey: persisted.mediaStorageKey,
      mediaStoredAt: persisted.mediaStoredAt,
      mediaType,
    };
  }

  async processIncomingMessage(params: {
    userId: string;
    channel: Channel;
    channelContactId: string;
    channelAccountId?: string; // the business number/account that received the message (for multi-number isolation)
    contactName?: string;
    content: string;
    contentType?: string;
    mediaUrl?: string;
    mediaFilename?: string; // Actual filename for documents/attachments
    platformMediaId?: string; // Platform-assigned media ID for proxy fetching (e.g. WhatsApp Meta mediaId)
    externalMessageId?: string;
    /** Telegram file_id + bot token — downloaded and stored like other channels */
    telegramMedia?: { botToken: string; fileId: string };
    /** Meta Messenger / IG attachment.type (image, video, …) — stored on messages.media_type when not superseded by persist */
    attachmentType?: string;
    /**
     * Calendly inbound: attach to this CRM contact when known (RGE W3 utm_content),
     * instead of creating a duplicate Calendly-only contact.
     */
    preferredContactId?: string;
    /** Commerce mirror on existing messaging threads — skips chatbot, keyword workflows, AI handoff, auto-reply. */
    inboundMode?: "commerce";
  }): Promise<InboundProcessingResult> {
    const {
      userId,
      channel,
      content,
      contentType = "text",
      mediaUrl,
      mediaFilename,
      platformMediaId,
      externalMessageId,
      channelAccountId,
      telegramMedia,
      attachmentType,
      preferredContactId,
      inboundMode,
    } = params;
    const isCommerceInbound = inboundMode === "commerce";
    let { channelContactId, contactName } = params;
    const inboundErrors: InboundProcessingResult["errors"] = [];

    // Normalise phone-based identifiers to digits-only so "+923364127888" and
    // "923364127888" always resolve to the same contact record.
    if (channel === 'whatsapp' || channel === 'sms') {
      channelContactId = channelContactId.replace(/\D/g, '');
    }
    if (channel === 'calendly') {
      channelContactId = channelContactId.trim().toLowerCase();
    }

    console.log(`[Inbound] Webhook received — channel: ${channel}, from: ${channelContactId}, userId: ${userId}, messageId: ${externalMessageId}`);

    // Deduplicate: skip if this external message ID was already processed
    if (externalMessageId) {
      const existing = await storage.getMessageByUserExternalId(userId, externalMessageId);
      if (existing) {
        logInboundDuplicateIgnored(channel, externalMessageId);
        // Return existing data so callers can still ACK 200 safely
        const conv = await storage.getConversation(existing.conversationId);
        const cont = await storage.getContact(existing.contactId);
        return buildInboundResult({
          success: Boolean(cont && conv),
          contact: cont || null,
          conversation: conv || null,
          message: existing,
          workflowState: { status: "skipped", reason: "deduped" },
          chatbotState: { status: "skipped", reason: "deduped", willFire: false },
          automationState: { status: "skipped", reason: "deduped" },
          deduped: true,
          channel,
          sourceEventId: externalMessageId,
          errors: cont && conv ? [] : [{ code: "dedupe_state_missing", message: "Existing message was found but contact or conversation could not be reloaded.", recoverable: true, stage: "dedupe" }],
        });
      }
    }

    console.log(`[Inbound] Channel identified: ${channel} — starting processIncomingMessage`);

    let contact: Contact | undefined;
    let contactCreated = false;

    if (channel === "calendly" && preferredContactId) {
      const pc = await storage.getContact(preferredContactId);
      if (pc && pc.userId === userId) {
        contact = pc;
        const em = channelContactId.trim().toLowerCase();
        const patch: Partial<Contact> = {
          lastIncomingChannel: channel,
          lastIncomingAt: new Date(),
        };
        if (em.includes("@") && (!pc.email || !String(pc.email).trim())) {
          patch.email = em;
        }
        await storage.updateContact(pc.id, patch);
        console.log(
          `[Inbox Worker] preferredContactId=${preferredContactId} for Calendly inbound (email hint=${em})`
        );
      } else {
        console.warn(`[Inbox Worker] preferredContactId invalid or wrong user — falling back to channel lookup`);
      }
    }

    if (!contact) {
      contact = await storage.getContactByChannelId(userId, channel, channelContactId);
    }
    
    if (!contact) {
      console.log(`[Inbox Worker] Contact not found for channelId=${channelContactId}, creating new contact`);
      const channelIdField = this.getChannelIdField(channel);
      const phoneFields =
        channel === "whatsapp" || channel === "sms" ? { phone: channelContactId as string } : {};
      const channelIdPatch =
        channel === "calendly"
          ? { email: channelContactId }
          : { [channelIdField]: channelContactId as string };
      contact = await storage.createContact({
        userId,
        name: contactName || channelContactId,
        ...phoneFields,
        ...channelIdPatch,
        primaryChannel: channel,
        lastIncomingChannel: channel,
        lastIncomingAt: new Date(),
        source: channel,
      });
      contactCreated = true;
      console.log(`[Inbox Worker] Contact created — contactId: ${contact.id}, name: "${contact.name}"`);

      await this.logActivity(userId, contact.id, undefined, 'lead_created', {
        source: channel,
        channelContactId,
      });
    } else {
      console.log(`[Inbox Worker] Contact matched — contactId: ${contact.id}, name: "${contact.name}"`);
      const contactUpdates: Partial<Contact> = {
        lastIncomingChannel: channel,
        lastIncomingAt: new Date(),
        ...(channel === "calendly" && preferredContactId
          ? {}
          : { primaryChannel: channel }),
      };
      // If this contact was matched via the phone fallback (whatsappId was null),
      // backfill the whatsappId now so subsequent inbound lookups hit the fast path.
      if (channel === 'whatsapp' && !contact.whatsappId) {
        contactUpdates.whatsappId = channelContactId;
        console.log(`[Inbox Worker] Backfilling whatsappId=${channelContactId} on contact ${contact.id} (matched via phone fallback)`);
      }
      await storage.updateContact(contact.id, contactUpdates);
    }

    // For WhatsApp/SMS with a channelAccountId (multi-number), isolate by destination number
    const acctId = (channel === 'whatsapp' || channel === 'sms') ? channelAccountId : undefined;
    let conversation = await storage.getConversationByContactAndChannel(contact.id, channel, acctId);
    let isNewConversation = false;
    /** True when an awaited WhatsApp template re-engagement just reopened via inbound (clears awaiting state + optional toast). */
    let shouldNotifyReplyWindowReopened = false;
    if (!conversation) {
      console.log(`[Inbox Worker] No existing conversation, creating new one for contactId=${contact.id}, channel=${channel}, channelAccountId=${acctId}`);
      conversation = await storage.createConversation({
        userId,
        contactId: contact.id,
        channel,
        channelAccountId: acctId,
        status: 'open',
        windowActive: true,
        windowExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      isNewConversation = true;
      console.log(`[Inbox Worker] Conversation created — conversationId: ${conversation.id}`);
      await subscriptionService.incrementConversationUsage(userId);
    } else {
      console.log(`[Inbox Worker] Existing conversation found — conversationId: ${conversation.id}`);
      const priorRe = parseConversationReEngagement(conversation.reEngagement);
      shouldNotifyReplyWindowReopened = priorRe?.state === "template_sent_awaiting_reply";
      await storage.updateConversation(conversation.id, {
        windowActive: true,
        windowExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        ...(shouldNotifyReplyWindowReopened ? { reEngagement: {} } : {}),
      });
    }

    let persisted: {
      mediaUrl?: string;
      mediaFilename?: string;
      providerMediaUrl?: string | null;
      providerMediaId?: string | null;
      mediaMimeType?: string | null;
      mediaSize?: number | null;
      mediaStorageKey?: string | null;
      mediaStoredAt?: Date | null;
      mediaType?: string | null;
    } = {};
    try {
      persisted = await this.persistInboundMediaIfNeeded({
        userId,
        channel,
        contentType,
        mediaUrl,
        mediaFilename,
        platformMediaId,
        telegramMedia,
      });
    } catch (err: unknown) {
      const messageText = (err as Error)?.message || String(err);
      console.warn("[Inbound] persistInboundMediaIfNeeded error:", messageText);
      inboundErrors.push({
        code: "media_persistence_failed",
        message: messageText,
        recoverable: true,
        stage: "media_persistence",
      });
    }

    const priorMessageCount = await countMessagesInConversation(conversation.id);

    const finalMediaUrl = persisted.mediaUrl ?? mediaUrl;
    const finalMediaFilename = persisted.mediaFilename ?? mediaFilename;

    let message: Message;
    try {
      message = await storage.createMessage({
        conversationId: conversation.id,
        contactId: contact.id,
        userId,
        direction: "inbound",
        content,
        contentType,
        mediaUrl: finalMediaUrl,
        mediaFilename: finalMediaFilename,
        platformMediaId,
        mediaType: persisted.mediaType ?? attachmentType ?? undefined,
        providerMediaUrl: persisted.providerMediaUrl ?? undefined,
        providerMediaId: persisted.providerMediaId ?? undefined,
        mediaMimeType: persisted.mediaMimeType ?? undefined,
        mediaSize: persisted.mediaSize ?? undefined,
        mediaStorageKey: persisted.mediaStorageKey ?? undefined,
        mediaStoredAt: persisted.mediaStoredAt ?? undefined,
        status: "delivered",
        externalMessageId,
      });
    } catch (err: unknown) {
      if (externalMessageId && isUniqueExternalMessageViolation(err)) {
        logInboundDuplicateIgnored(channel, externalMessageId);
        const existing = await storage.getMessageByUserExternalId(userId, externalMessageId);
        if (existing) {
          const existingConversation = (await storage.getConversation(existing.conversationId)) || conversation;
          const existingContact = (await storage.getContact(existing.contactId)) || contact;
          return buildInboundResult({
            success: Boolean(existingContact && existingConversation),
            contact: existingContact || null,
            conversation: existingConversation || null,
            message: existing,
            workflowState: { status: "skipped", reason: "deduped_unique_race" },
            chatbotState: { status: "skipped", reason: "deduped_unique_race", willFire: false },
            automationState: { status: "skipped", reason: "deduped_unique_race" },
            deduped: true,
            channel,
            sourceEventId: externalMessageId,
            errors: existingContact && existingConversation ? [] : [{ code: "dedupe_state_missing", message: "Unique conflict resolved to an existing message, but contact or conversation could not be reloaded.", recoverable: true, stage: "dedupe_unique" }],
          });
        }
      }
      throw err;
    }

    console.log(`[Inbound] DB write success — messageId: ${message.id}, conversationId: ${conversation.id}, contactId: ${contact.id}, preview: "${content.substring(0, 80)}"`);

    await storage.updateConversation(conversation.id, {
      lastMessageAt: new Date(),
      lastMessagePreview: (content || (finalMediaUrl ? mediaPreviewLabel(contentType) : "")).substring(0, 100),
      lastMessageDirection: 'inbound',
      unreadCount: (conversation.unreadCount || 0) + 1,
    });
    console.log(`[Inbound] Conversation/thread updated — conversationId: ${conversation.id}, unreadCount: ${(conversation.unreadCount || 0) + 1}, preview: "${content.substring(0, 60)}"`);

    if (!isCommerceInbound) {
      notifyUser(userId, {
        type: 'new_message',
        conversationId: conversation.id,
        contactId: contact.id,
        ...(shouldNotifyReplyWindowReopened ? { replyWindowReopened: true } : {}),
      });
    }

    await this.logActivity(userId, contact.id, conversation.id, 'message', {
      direction: 'inbound',
      channel,
      preview: content.substring(0, 100),
    });

    {
      const inboundTrimmed = (content || "").trim();
      const triggerSource = `channelService:${channel}`;
      if (isCommerceInbound) {
        void import("./buyerPreferenceService").then(({ debugLogBuyerPreference }) =>
          debugLogBuyerPreference("extraction_skipped", {
            contactId: contact.id,
            userId,
            triggerSource,
            reason: "commerce_inbound",
            channel,
            textLen: inboundTrimmed.length,
          }),
        );
      } else if (inboundTrimmed.length > 0 && inboundTrimmed.length < 12) {
        void import("./buyerPreferenceService").then(({ debugLogBuyerPreference }) =>
          debugLogBuyerPreference("extraction_skipped", {
            contactId: contact.id,
            userId,
            triggerSource,
            reason: "inbound_text_too_short",
            channel,
            textLen: inboundTrimmed.length,
            note: "channelService requires >= 12 chars (or media-only with empty text)",
          }),
        );
      } else {
        const { resolveSellerIntentForContact, shouldSkipBuyerPipelineForSellerLead } = await import(
          "./sellerPreferenceService"
        );
        const sellerIntent = resolveSellerIntentForContact(contact, inboundTrimmed);
        const skipBuyer = shouldSkipBuyerPipelineForSellerLead(sellerIntent);
        if (skipBuyer) {
          const { syncSellerPreferencesForInboundMessage } = await import("./sellerPreferenceService");
          await syncSellerPreferencesForInboundMessage({
            contact,
            inboundText: inboundTrimmed,
            conversationId: conversation.id,
            sellerIntent,
          }).catch(() => {});
        } else {
          const { processInboundBuyerPreferencesOnMessage } = await import("./buyerPreferenceService");
          await processInboundBuyerPreferencesOnMessage({
            userId,
            contact,
            conversationId: conversation.id,
            messageId: message.id,
            inboundText: content,
            triggerSource,
          }).catch((err) => {
            console.warn("[BuyerPreference] inbound sync failed", {
              contactId: contact.id,
              messageId: message.id,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
        if (!skipBuyer && sellerIntent === "seller_and_buyer") {
          const { syncSellerPreferencesForInboundMessage } = await import("./sellerPreferenceService");
          await syncSellerPreferencesForInboundMessage({
            contact,
            inboundText: inboundTrimmed,
            conversationId: conversation.id,
            sellerIntent,
          }).catch(() => {});
        }
      }
    }

    if (isCommerceInbound) {
      return buildInboundResult({
        success: true,
        contact,
        conversation,
        message,
        workflowState: { status: "skipped", reason: "commerce_inbound" },
        chatbotState: { status: "skipped", reason: "commerce_inbound", willFire: false },
        automationState: { status: "skipped", reason: "commerce_inbound" },
        created: { contact: contactCreated, conversation: isNewConversation, message: true },
        updated: { contact: true, conversation: true, message: false },
        channel,
        sourceEventId: externalMessageId || null,
        errors: inboundErrors,
        isNewConversation,
        chatbotWillFire: false,
      });
    }

    // ── Human handoff (conversation-level) ───────────────────────────────────
    // Runs immediately on inbound message receipt so it can override any AI work
    // before auto-send gates or suggestion generation.
    let handoffTriggered = false;
    try {
      const aiSettings = await storage.getAiSettings(userId);
      const { aiService } = await import("./aiService");
      const handoff = await aiService.checkHandoffNeeded(content || "", aiSettings || undefined);
      if (handoff.shouldHandoff) {
        handoffTriggered = true;
        const keywords = (aiSettings?.handoffKeywords || ["call me", "human", "agent", "speak to someone"])
          .map((k) => String(k || "").trim())
          .filter(Boolean);
        const matchedKeyword =
          keywords.find((k) => matchesHandoffKeyword(content || "", [k])) || handoff.reason || "routing_assign_agent";

        console.info("[HANDOFF_TRIGGERED]", {
          contactId: contact.id,
          matchedKeyword,
          message: (content || "").slice(0, 500),
        });

        await this.logActivity(userId, contact.id, conversation.id, "ai_handoff", {
          matchedKeyword,
          message: (content || "").slice(0, 500),
          reason: handoff.reason || "handoff_keyword_match",
        });
      }
    } catch (err: any) {
      console.warn("[HANDOFF_TRIGGERED] check failed", err?.message || err);
    }

    // Handoff means: stop all automated responses (AI, chatbot, auto-replies).
    // The conversation is effectively "Snoozed" and a human should take over.
    if (handoffTriggered) {
      void import("./automationNoReply").then(({ onInboundMessageForNoReplyTimers }) =>
        onInboundMessageForNoReplyTimers(contact.id).catch(() => {})
      );
      scheduleHubSpotAutoSync(userId, contact.id);
      return buildInboundResult({
        success: true,
        contact,
        conversation,
        message,
        workflowState: { status: "skipped", reason: "handoff_triggered" },
        chatbotState: { status: "skipped", reason: "handoff_triggered", willFire: false },
        automationState: { status: "skipped", reason: "handoff_triggered" },
        created: { contact: contactCreated, conversation: isNewConversation, message: true },
        updated: { contact: true, conversation: true, message: false },
        channel,
        sourceEventId: externalMessageId || null,
        errors: inboundErrors,
        isNewConversation,
        chatbotWillFire: false,
      });
    }

    await this.resolveHandoffIfActive(
      userId,
      contact.id,
      conversation.id,
      "customer_normal_message"
    );

    // Evaluate chatbot trigger once — used both to fire the flow and to let
    // callers gate their own outbound messages without an extra DB round-trip.
    const { evaluateChatbotInboundArbitration, triggerChatbotFlows } = await import('./chatbotEngine');
    const chatbotArb = await evaluateChatbotInboundArbitration({
      userId,
      contactId: contact.id,
      conversationId: conversation.id,
      channel,
      message: content,
      isNewConversation,
    });
    const bookingIntent =
      detectHighConfidenceBookingIntent(content) || detectSellerConsultationBookingIntent(content);
    const chatbotWillFire = chatbotArb.flowMatched && !bookingIntent;
    console.info("[INBOUND_AUTOMATION]", {
      tag: "channel_inbound",
      conversationId: conversation.id,
      contactId: contact.id,
      flowMatched: chatbotArb.flowMatched,
      bookingIntent,
      chatbotWillFire,
      aiAutoSuppressed: chatbotWillFire,
      reason: bookingIntent ? "booking_fast_path_priority" : chatbotArb.reason,
    });

    if (bookingIntent) {
      void import("./bookingFastPath").then(({ queueBookingFastPathReply }) =>
        queueBookingFastPathReply({
          userId,
          contact,
          conversation,
          inboundText: content,
          messageId: message.id,
          messageAt: message.createdAt ?? new Date(),
          channel,
        }),
      );
    }

    // Trigger chatbot flows asynchronously (does not block webhook response)
    triggerChatbotFlows({
      userId,
      contactId: contact.id,
      conversationId: conversation.id,
      channel,
      message: content,
      isNewConversation,
    }).catch((err: Error) =>
      console.error('[Chatbot] triggerChatbotFlows error:', err.message)
    );

    // ── Auto-Reply & Business Hours — runs for every channel ─────────────────
    // Chatbot takes full priority: skip auto-reply when a flow will fire.
    if (!chatbotWillFire) {
      this._scheduleAutoReply({
        userId,
        contact,
        conversation,
        channel,
        inboundContent: content,
        priorMessageCount,
      }).catch((err: Error) => console.error("[AutoReply] Scheduling error:", err.message));
    } else {
      console.log(`[AutoReply] Suppressed — chatbot will fire for userId: ${userId}, channel: ${channel}`);
    }

    void import("./automationNoReply").then(({ onInboundMessageForNoReplyTimers }) =>
      onInboundMessageForNoReplyTimers(contact.id).catch(() => {})
    );

    scheduleHubSpotAutoSync(userId, contact.id);
    return buildInboundResult({
      success: true,
      contact,
      conversation,
      message,
      workflowState: { status: "processed", reason: isNewConversation ? "new_conversation_and_keyword_dispatchers_available" : "keyword_dispatcher_available" },
      chatbotState: { status: "processed", reason: chatbotArb.reason, willFire: chatbotWillFire },
      automationState: {
        status: "processed",
        reason: chatbotWillFire ? "chatbot_matched_auto_reply_suppressed" : "auto_reply_and_no_reply_timer_evaluated",
        details: {
          noReplyTimersNotified: true,
          hubspotSyncScheduled: true,
          mediaPersistenceFailed: inboundErrors.some((e) => e.code === "media_persistence_failed"),
        },
      },
      created: { contact: contactCreated, conversation: isNewConversation, message: true },
      updated: { contact: true, conversation: true, message: false },
      channel,
      sourceEventId: externalMessageId || null,
      errors: inboundErrors,
      isNewConversation,
      chatbotWillFire,
    });
  }

  private async _scheduleAutoReply(params: {
    userId: string;
    contact: Contact;
    conversation: Conversation;
    channel: Channel;
    inboundContent: string;
    /** Message rows in this conversation before the current inbound was inserted */
    priorMessageCount: number;
  }): Promise<void> {
    const { userId, contact, conversation, channel, inboundContent, priorMessageCount } = params;

    try {
      const user = await storage.getUser(userId);
      if (!user) return;

      let shouldReply = false;
      let replyText = "";
      let source: "away_message" | "auto_reply" | null = null;
      let greetingActivityToLog: string | null = null;

      // 1. Away message (outside business hours) takes priority — unchanged copy path
      if (user.businessHoursEnabled && user.awayMessageEnabled) {
        const now = new Date();
        const tz = user.timezone || "America/New_York";
        const local = new Date(now.toLocaleString("en-US", { timeZone: tz }));
        const day = local.getDay();
        const time = local.toTimeString().slice(0, 5); // "HH:mm"
        const days = (user.businessDays as number[]) || [1, 2, 3, 4, 5];
        const start = user.businessHoursStart || "09:00";
        const end = user.businessHoursEnd || "17:00";

        if (!days.includes(day) || time < start || time > end) {
          shouldReply = true;
          replyText =
            user.awayMessage ||
            "Thanks for reaching out! We're currently away but will respond as soon as we're back.";
          source = "away_message";
        }
      }

      // 2. Always-on auto-reply — greeting-aware when inbound looks like a simple greeting
      if (!shouldReply && user.autoReplyEnabled) {
        const trimmed = (inboundContent || "").trim();
        const gKind = classifyGreetingInbound(trimmed);

        if (trimmed && gKind !== "none") {
          const events = await storage.getActivityEvents(contact.id, 300);
          const cid = conversation.id;
          const hasEvt = (t: string) =>
            events.some((e) => e.conversationId === cid && e.eventType === t);

          if (gKind === "impatience" && !hasEvt(GREETING_ACTIVITY.impatience)) {
            shouldReply = true;
            replyText = IMPATIENCE_GREETING_REPLY;
            source = "auto_reply";
            greetingActivityToLog = GREETING_ACTIVITY.impatience;
          } else if (gKind === "pure") {
            if (priorMessageCount === 0 && !hasEvt(GREETING_ACTIVITY.niche)) {
              const bk = await storage.getAiBusinessKnowledge(userId);
              shouldReply = true;
              replyText = nicheGreetingOpener(bk?.industry);
              source = "auto_reply";
              greetingActivityToLog = GREETING_ACTIVITY.niche;
            } else if (priorMessageCount > 0 && !hasEvt(GREETING_ACTIVITY.light)) {
              shouldReply = true;
              replyText = LIGHT_GREETING_FOLLOWUP;
              source = "auto_reply";
              greetingActivityToLog = GREETING_ACTIVITY.light;
            }
          }
        }

        // Non-greeting inbound: keep legacy auto-reply body
        if (!shouldReply && classifyGreetingInbound(trimmed) === "none") {
          shouldReply = true;
          replyText =
            user.autoReplyMessage || "Thanks for your message! We'll get back to you shortly.";
          source = "auto_reply";
        }
      }

      if (!shouldReply || !replyText || !source) {
        if (!user.businessHoursEnabled && !user.autoReplyEnabled) {
          console.log(
            `[AutoReply] Skipped — disabled (autoReplyEnabled=false, businessHoursEnabled=false) userId=${userId} channel=${channel}`
          );
        } else if (!user.autoReplyEnabled && !(user.businessHoursEnabled && user.awayMessageEnabled)) {
          console.log(`[AutoReply] Skipped — no rule matched userId=${userId} channel=${channel}`);
        } else if (user.autoReplyEnabled && classifyGreetingInbound((inboundContent || "").trim()) !== "none") {
          console.log(
            `[AutoReply] Skipped — greeting already handled or capped conversationId=${conversation.id}`
          );
        }
        return;
      }

      const delayMs = (user.autoReplyDelay || 0) * 1000;
      const self = this;
      const activityAfterSend = greetingActivityToLog;

      setTimeout(async () => {
        try {
          console.log(
            `[AutoReply] Sending (${source}) — userId=${userId} channel=${channel} contactId=${contact.id} conversationId=${conversation.id}`
          );
          const result = await self.sendMessage({
            userId,
            contactId: contact.id,
            content: replyText,
            forceChannel: channel,
          });
          if (result.success) {
            console.log(
              `[AutoReply] ✓ Sent (${source}) via ${channel} to "${contact.name}" (conversationId: ${conversation.id})`
            );
            if (activityAfterSend) {
              await self.logActivity(userId, contact.id, conversation.id, activityAfterSend, {
                kind: activityAfterSend,
              });
            }
          } else {
            console.error(`[AutoReply] ✗ Send failed (${source}) via ${channel}: ${result.error}`);
          }
        } catch (err) {
          console.error("[AutoReply] Send error:", err);
        }
      }, delayMs);
    } catch (err) {
      console.error("[AutoReply] _scheduleAutoReply error:", err);
    }
  }

  private getChannelIdField(channel: Channel): string {
    switch (channel) {
      case 'whatsapp': return 'whatsappId';
      case 'instagram': return 'instagramId';
      case 'facebook': return 'facebookId';
      case 'telegram': return 'telegramId';
      case 'calendly': return 'email';
      case 'shopify': return 'email';
      default: return 'phone';
    }
  }

  async logActivity(
    userId: string,
    contactId: string,
    conversationId: string | undefined,
    eventType: string,
    eventData: Record<string, any>,
    actorType: string = 'system',
    actorId?: string
  ): Promise<void> {
    await storage.createActivityEvent({
      userId,
      contactId,
      conversationId: conversationId || undefined,
      eventType,
      eventData,
      actorType,
      actorId,
    });
  }

  /**
   * Clears human-handoff escalation when the conversation is no longer in an active handoff state.
   * Appends `ai_handoff_resolved` so timeline ordering reflects recovery.
   */
  async resolveHandoffIfActive(
    userId: string,
    contactId: string,
    conversationId: string,
    reason: string
  ): Promise<void> {
    try {
      const events = await storage.getActivityEvents(contactId, 120);
      if (!isConversationHandoffActive(events, conversationId)) return;
      await this.logActivity(userId, contactId, conversationId, AI_HANDOFF_RESOLVED_EVENT, {
        reason,
      });
      console.info("[HANDOFF_RESOLVED]", { contactId, conversationId, reason });
    } catch (err: unknown) {
      console.warn("[HANDOFF_RESOLVED] failed", (err as Error)?.message || err);
    }
  }

  registerAdapter(channel: Channel, adapter: ChannelAdapter): void {
    this.adapters.set(channel, adapter);
  }
}

export const channelService = new ChannelService();
