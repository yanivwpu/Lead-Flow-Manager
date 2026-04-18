import { storage } from "./storage";
import { subscriptionService } from "./subscriptionService";
import { notifyUser } from "./presence";
import { 
  type Contact, type Conversation, type Message, type Channel, 
  CHANNEL_INFO, CHANNELS 
} from "@shared/schema";

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

  async sendMessage(params: {
    userId: string;
    contactId: string;
    content?: string;
    contentType?: string;
    mediaUrl?: string;
    mediaType?: string;
    mediaFilename?: string;
    forceChannel?: Channel;
    templateVariables?: Record<string, any>;
  }): Promise<SendMessageResult> {
    const { userId, contactId, contentType = 'text', mediaUrl, mediaType, mediaFilename, forceChannel, templateVariables } = params;
    const content = params.content ?? '';

    if (!content && !mediaUrl) {
      return { success: false, channel: 'whatsapp', error: 'Message must have content or media' };
    }

    const contact = await storage.getContact(contactId);
    if (!contact) {
      return { success: false, channel: 'whatsapp', error: 'Contact not found' };
    }

    const targetChannel = forceChannel || this.getPrimaryChannel(contact);
    
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

    const fallbackChannels = await this.getFallbackChannels(userId);
    for (const fallbackChannel of fallbackChannels) {
      if (fallbackChannel === targetChannel) continue;

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
        }
      }

      // 2. Always-on auto-reply (when not already handled by away message)
      if (!shouldReply && user.autoReplyEnabled) {
        shouldReply = true;
        replyText = user.autoReplyMessage || "Thanks for your message! We'll get back to you shortly.";
      }

      if (!shouldReply || !replyText) return;

      const delayMs = (user.autoReplyDelay || 0) * 1000;
      const self = this;

      setTimeout(async () => {
        try {
          const result = await self.sendMessage({
            userId,
            contactId: contact.id,
            content: replyText,
            forceChannel: channel,
          });
          if (result.success) {
            console.log(`[AutoReply] ✓ Sent via ${channel} to "${contact.name}" (conversationId: ${conversation.id})`);
          } else {
            console.error(`[AutoReply] ✗ Send failed via ${channel}: ${result.error}`);
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
