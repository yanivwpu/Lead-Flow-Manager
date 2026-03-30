import { storage } from "./storage";
import { subscriptionService } from "./subscriptionService";
import { notifyUser } from "./presence";
import { 
  type Contact, type Conversation, type Message, type Channel, 
  CHANNEL_INFO, CHANNELS 
} from "@shared/schema";

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
  }): Promise<{ success: boolean; externalMessageId?: string; error?: string }>;
  
  isAvailable(userId: string): Promise<boolean>;
}

class ChannelService {
  private adapters: Map<Channel, ChannelAdapter> = new Map();

  getPrimaryChannel(contact: Contact): Channel {
    if (contact.primaryChannelOverride) {
      return contact.primaryChannelOverride as Channel;
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
    content: string;
    contentType?: string;
    mediaUrl?: string;
    forceChannel?: Channel;
  }): Promise<SendMessageResult> {
    const { userId, contactId, content, contentType = 'text', mediaUrl, forceChannel } = params;

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
      status: 'pending',
    });

    const sendResult = await this.dispatchMessage(userId, targetChannel, {
      contactId,
      conversationId: conversation.id,
      content,
      contentType,
      mediaUrl,
    });

    if (sendResult.success) {
      console.log(`[Debug] Outgoing message sent — messageId: ${message.id}, conversationId: ${conversation.id}, channel: ${targetChannel}`);
      await storage.updateMessage(message.id, {
        status: 'sent',
        externalMessageId: sendResult.externalMessageId,
        sentAt: new Date(),
      });

      await storage.updateConversation(conversation.id, {
        lastMessageAt: new Date(),
        lastMessagePreview: content.substring(0, 100),
        lastMessageDirection: 'outbound',
      });
      console.log(`[Debug] Conversation summary updated after outbound — conversationId: ${conversation.id}, preview: "${content.substring(0, 60)}"`);

      await this.logActivity(userId, contactId, conversation.id, 'message', {
        direction: 'outbound',
        channel: targetChannel,
        preview: content.substring(0, 100),
      });

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
    contactName?: string;
    content: string;
    contentType?: string;
    mediaUrl?: string;
    externalMessageId?: string;
  }): Promise<{ contact: Contact; conversation: Conversation; message: Message; isNewConversation: boolean; chatbotWillFire: boolean }> {
    const { userId, channel, content, contentType = 'text', mediaUrl, externalMessageId } = params;
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
        return { contact: cont!, conversation: conv!, message: existing };
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

    let conversation = await storage.getConversationByContactAndChannel(contact.id, channel);
    let isNewConversation = false;
    if (!conversation) {
      console.log(`[Inbox Worker] No existing conversation, creating new one for contactId=${contact.id}, channel=${channel}`);
      conversation = await storage.createConversation({
        userId,
        contactId: contact.id,
        channel,
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
      status: 'delivered',
      externalMessageId,
    });

    console.log(`[Inbound] DB write success — messageId: ${message.id}, conversationId: ${conversation.id}, contactId: ${contact.id}, preview: "${content.substring(0, 80)}"`);

    await storage.updateConversation(conversation.id, {
      lastMessageAt: new Date(),
      lastMessagePreview: content.substring(0, 100),
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

    return { contact, conversation, message, isNewConversation, chatbotWillFire };
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
