import { storage } from "./storage";
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
  }): Promise<{ contact: Contact; conversation: Conversation; message: Message }> {
    const { userId, channel, channelContactId, contactName, content, contentType = 'text', mediaUrl, externalMessageId } = params;

    let contact = await storage.getContactByChannelId(userId, channel, channelContactId);
    
    if (!contact) {
      const channelIdField = this.getChannelIdField(channel);
      contact = await storage.createContact({
        userId,
        name: contactName || channelContactId,
        [channelIdField]: channelContactId,
        phone: channel === 'whatsapp' || channel === 'sms' ? channelContactId : undefined,
        primaryChannel: channel,
        lastIncomingChannel: channel,
        lastIncomingAt: new Date(),
        source: channel,
      });

      await this.logActivity(userId, contact.id, undefined, 'lead_created', {
        source: channel,
        channelContactId,
      });
    } else {
      await storage.updateContact(contact.id, {
        lastIncomingChannel: channel,
        lastIncomingAt: new Date(),
        primaryChannel: channel,
      });
    }

    let conversation = await storage.getConversationByContactAndChannel(contact.id, channel);
    if (!conversation) {
      conversation = await storage.createConversation({
        userId,
        contactId: contact.id,
        channel,
        status: 'open',
        windowActive: true,
        windowExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
    } else {
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

    await storage.updateConversation(conversation.id, {
      lastMessageAt: new Date(),
      lastMessagePreview: content.substring(0, 100),
      lastMessageDirection: 'inbound',
      unreadCount: (conversation.unreadCount || 0) + 1,
    });

    await this.logActivity(userId, contact.id, conversation.id, 'message', {
      direction: 'inbound',
      channel,
      preview: content.substring(0, 100),
    });

    return { contact, conversation, message };
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
