import { storage } from "./storage";
import { subscriptionService } from "./subscriptionService";
import { notifyUser } from "./presence";
import { 
  type Contact, type Conversation, type Message, type Channel, 
  CHANNEL_INFO, CHANNELS 
} from "@shared/schema";

type ForceChannelInput = Channel | string | undefined;

/** Inbox WhatsApp free-form: enforce ~23h from last inbound when DB stores a 24h ceiling (1h safety margin). */
const WHATSAPP_INBOX_CSW_BUFFER_MS = 60 * 60 * 1000;

const WHATSAPP_WINDOW_EXPIRED_MSG =
  'WhatsApp window expired. Use an approved template or switch to another available channel.';

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
    const content = params.content ?? '';

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
        return {
          success: false,
          channel: 'whatsapp',
          error: WHATSAPP_WINDOW_EXPIRED_MSG,
        };
      }
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
      await storage.updateMessage(message.id, {
        status: 'failed',
        errorMessage: sendResult.error,
      });
      console.warn(
        `[sendMessage] failed contactId=${contactId} finalChannel=${targetChannel} error=${sendResult.error || 'unknown'}`
      );
      return {
        success: false,
        messageId: message.id,
        channel: targetChannel,
        error: sendResult.error || 'Message delivery failed',
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
      status: 'failed',
      errorMessage: sendResult.error,
    });

    console.warn(
      `[sendMessage] failed contactId=${contactId} finalChannel=${targetChannel} error=${sendResult.error || 'unknown'}`
    );

    return {
      success: false,
      messageId: message.id,
      channel: targetChannel,
      error: sendResult.error || 'Message delivery failed',
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
  }): Promise<{ contact: Contact; conversation: Conversation; message: Message; isNewConversation: boolean; chatbotWillFire: boolean }> {
    const { userId, channel, content, contentType = 'text', mediaUrl, mediaFilename, platformMediaId, externalMessageId, channelAccountId } = params;
    let { channelContactId, contactName } = params;

    // Normalise phone-based identifiers to digits-only so "+923364127888" and
    // "923364127888" always resolve to the same contact record.
    if (channel === 'whatsapp' || channel === 'sms') {
      channelContactId = channelContactId.replace(/\D/g, '');
    }

    console.log(`[Inbound] Webhook received — channel: ${channel}, from: ${channelContactId}, userId: ${userId}, messageId: ${externalMessageId}`);

    // Deduplicate: skip if this external message ID was already processed
    if (externalMessageId) {
      const existing = await storage.getMessageByExternalId(externalMessageId);
      if (existing) {
        console.log(`[Inbound] Duplicate — skipping already-processed messageId: ${externalMessageId}`);
        // Return existing data so callers can still ACK 200 safely
        const conv = await storage.getConversation(existing.conversationId);
        const cont = await storage.getContact(existing.contactId);
        return { contact: cont!, conversation: conv!, message: existing, isNewConversation: false, chatbotWillFire: false };
      }
    }

    console.log(`[Inbound] Channel identified: ${channel} — starting processIncomingMessage`);

    let contact = await storage.getContactByChannelId(userId, channel, channelContactId);
    
    if (!contact) {
      console.log(`[Inbox Worker] Contact not found for channelId=${channelContactId}, creating new contact`);
      const channelIdField = this.getChannelIdField(channel);
      contact = await storage.createContact({
        userId,
        name: contactName || channelContactId,
        phone: channel === 'whatsapp' || channel === 'sms' ? channelContactId : undefined,
        [channelIdField]: channelContactId,
        primaryChannel: channel,
        lastIncomingChannel: channel,
        lastIncomingAt: new Date(),
        source: channel,
      });
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
        primaryChannel: channel,
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
      await storage.updateConversation(conversation.id, {
        windowActive: true,
        windowExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
    }

    const message = await storage.createMessage({
      conversationId: conversation.id,
      contactId: contact.id,
      userId,
      direction: 'inbound',
      content,
      contentType,
      mediaUrl,
      mediaFilename,
      platformMediaId,
      status: 'delivered',
      externalMessageId,
    });

    console.log(`[Inbound] DB write success — messageId: ${message.id}, conversationId: ${conversation.id}, contactId: ${contact.id}, preview: "${content.substring(0, 80)}"`);

    await storage.updateConversation(conversation.id, {
      lastMessageAt: new Date(),
      lastMessagePreview: (content || (mediaUrl ? mediaPreviewLabel(contentType) : '')).substring(0, 100),
      lastMessageDirection: 'inbound',
      unreadCount: (conversation.unreadCount || 0) + 1,
    });
    console.log(`[Inbound] Conversation/thread updated — conversationId: ${conversation.id}, unreadCount: ${(conversation.unreadCount || 0) + 1}, preview: "${content.substring(0, 60)}"`);

    notifyUser(userId, {
      type: 'new_message',
      conversationId: conversation.id,
      contactId: contact.id,
    });

    await this.logActivity(userId, contact.id, conversation.id, 'message', {
      direction: 'inbound',
      channel,
      preview: content.substring(0, 100),
    });

    // Evaluate chatbot trigger once — used both to fire the flow and to let
    // callers gate their own outbound messages without an extra DB round-trip.
    const { willChatbotTrigger, triggerChatbotFlows } = await import('./chatbotEngine');
    const chatbotWillFire = await willChatbotTrigger(userId, content, isNewConversation);

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
      this._scheduleAutoReply({ userId, contact, conversation, channel }).catch(
        (err: Error) => console.error('[AutoReply] Scheduling error:', err.message)
      );
    } else {
      console.log(`[AutoReply] Suppressed — chatbot will fire for userId: ${userId}, channel: ${channel}`);
    }

    return { contact, conversation, message, isNewConversation, chatbotWillFire };
  }

  private async _scheduleAutoReply(params: {
    userId: string;
    contact: Contact;
    conversation: Conversation;
    channel: Channel;
  }): Promise<void> {
    const { userId, contact, conversation, channel } = params;

    try {
      const user = await storage.getUser(userId);
      if (!user) return;

      let shouldReply = false;
      let replyText = '';
      let source: "away_message" | "auto_reply" | null = null;

      // 1. Away message (outside business hours) takes priority
      if (user.businessHoursEnabled && user.awayMessageEnabled) {
        const now = new Date();
        const tz = user.timezone || 'America/New_York';
        const local = new Date(now.toLocaleString('en-US', { timeZone: tz }));
        const day = local.getDay();
        const time = local.toTimeString().slice(0, 5); // "HH:mm"
        const days = (user.businessDays as number[]) || [1, 2, 3, 4, 5];
        const start = user.businessHoursStart || '09:00';
        const end = user.businessHoursEnd || '17:00';

        if (!days.includes(day) || time < start || time > end) {
          shouldReply = true;
          replyText = user.awayMessage || "Thanks for reaching out! We're currently away but will respond as soon as we're back.";
          source = "away_message";
        }
      }

      // 2. Always-on auto-reply (when not already handled by away message)
      if (!shouldReply && user.autoReplyEnabled) {
        shouldReply = true;
        replyText = user.autoReplyMessage || "Thanks for your message! We'll get back to you shortly.";
        source = "auto_reply";
      }

      if (!shouldReply || !replyText || !source) {
        // Keep this log lightweight; helps distinguish “Facebook sent it” vs “we sent it”.
        if (!user.businessHoursEnabled && !user.autoReplyEnabled) {
          console.log(`[AutoReply] Skipped — disabled (autoReplyEnabled=false, businessHoursEnabled=false) userId=${userId} channel=${channel}`);
        } else if (!user.autoReplyEnabled && !(user.businessHoursEnabled && user.awayMessageEnabled)) {
          console.log(`[AutoReply] Skipped — no rule matched userId=${userId} channel=${channel}`);
        }
        return;
      }

      const delayMs = (user.autoReplyDelay || 0) * 1000;
      const self = this;

      setTimeout(async () => {
        try {
          console.log(`[AutoReply] Sending (${source}) — userId=${userId} channel=${channel} contactId=${contact.id} conversationId=${conversation.id}`);
          const result = await self.sendMessage({
            userId,
            contactId: contact.id,
            content: replyText,
            forceChannel: channel,
          });
          if (result.success) {
            console.log(`[AutoReply] ✓ Sent (${source}) via ${channel} to "${contact.name}" (conversationId: ${conversation.id})`);
          } else {
            console.error(`[AutoReply] ✗ Send failed (${source}) via ${channel}: ${result.error}`);
          }
        } catch (err) {
          console.error('[AutoReply] Send error:', err);
        }
      }, delayMs);

    } catch (err) {
      console.error('[AutoReply] _scheduleAutoReply error:', err);
    }
  }

  private getChannelIdField(channel: Channel): string {
    switch (channel) {
      case 'whatsapp': return 'whatsappId';
      case 'instagram': return 'instagramId';
      case 'facebook': return 'facebookId';
      case 'telegram': return 'telegramId';
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

  registerAdapter(channel: Channel, adapter: ChannelAdapter): void {
    this.adapters.set(channel, adapter);
  }
}

export const channelService = new ChannelService();
