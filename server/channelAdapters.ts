import { storage } from "./storage";
import { channelService, ChannelAdapter } from "./channelService";
import { 
  sendUserWhatsAppMessage, 
  sendUserWhatsAppMedia,
  getUserTwilioClient,
  getUserTwilioNumber 
} from "./userTwilio";
import type { Channel } from "@shared/schema";

class WhatsAppAdapter implements ChannelAdapter {
  async send(params: {
    contactId: string;
    conversationId: string;
    content: string;
    contentType?: string;
    mediaUrl?: string;
  }): Promise<{ success: boolean; externalMessageId?: string; error?: string }> {
    try {
      const conversation = await storage.getConversation(params.conversationId);
      if (!conversation) {
        return { success: false, error: "Conversation not found" };
      }

      const contact = await storage.getContact(params.contactId);
      if (!contact || !contact.phone) {
        return { success: false, error: "Contact phone number not found" };
      }

      const phone = contact.phone.startsWith("+") ? contact.phone : `+${contact.phone}`;

      let result;
      if (params.mediaUrl && params.contentType !== 'text') {
        result = await sendUserWhatsAppMedia(
          conversation.userId,
          phone,
          params.mediaUrl,
          params.content
        );
      } else {
        result = await sendUserWhatsAppMessage(
          conversation.userId,
          phone,
          params.content
        );
      }

      return {
        success: true,
        externalMessageId: result.sid,
      };
    } catch (error: any) {
      console.error("WhatsApp send error:", error);
      return {
        success: false,
        error: error.message || "Failed to send WhatsApp message",
      };
    }
  }

  async isAvailable(userId: string): Promise<boolean> {
    const client = await getUserTwilioClient(userId);
    const number = await getUserTwilioNumber(userId);
    return !!(client && number);
  }
}

class SMSAdapter implements ChannelAdapter {
  async send(params: {
    contactId: string;
    conversationId: string;
    content: string;
    contentType?: string;
    mediaUrl?: string;
  }): Promise<{ success: boolean; externalMessageId?: string; error?: string }> {
    try {
      const conversation = await storage.getConversation(params.conversationId);
      if (!conversation) {
        return { success: false, error: "Conversation not found" };
      }

      const contact = await storage.getContact(params.contactId);
      if (!contact || !contact.phone) {
        return { success: false, error: "Contact phone number not found" };
      }

      const client = await getUserTwilioClient(conversation.userId);
      const fromNumber = await getUserTwilioNumber(conversation.userId);

      if (!client || !fromNumber) {
        return { success: false, error: "Twilio not configured" };
      }

      const phone = contact.phone.startsWith("+") ? contact.phone : `+${contact.phone}`;

      const messageOptions: any = {
        from: fromNumber,
        to: phone,
        body: params.content,
      };

      if (params.mediaUrl) {
        messageOptions.mediaUrl = [params.mediaUrl];
      }

      const result = await client.messages.create(messageOptions);

      return {
        success: true,
        externalMessageId: result.sid,
      };
    } catch (error: any) {
      console.error("SMS send error:", error);
      return {
        success: false,
        error: error.message || "Failed to send SMS",
      };
    }
  }

  async isAvailable(userId: string): Promise<boolean> {
    const client = await getUserTwilioClient(userId);
    const number = await getUserTwilioNumber(userId);
    return !!(client && number);
  }
}

class WebChatAdapter implements ChannelAdapter {
  async send(params: {
    contactId: string;
    conversationId: string;
    content: string;
    contentType?: string;
    mediaUrl?: string;
  }): Promise<{ success: boolean; externalMessageId?: string; error?: string }> {
    return {
      success: true,
      externalMessageId: `webchat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
  }

  async isAvailable(userId: string): Promise<boolean> {
    return true;
  }
}

class InstagramAdapter implements ChannelAdapter {
  async send(params: {
    contactId: string;
    conversationId: string;
    content: string;
    contentType?: string;
    mediaUrl?: string;
  }): Promise<{ success: boolean; externalMessageId?: string; error?: string }> {
    try {
      const conversation = await storage.getConversation(params.conversationId);
      if (!conversation) {
        return { success: false, error: "Conversation not found" };
      }

      const contact = await storage.getContact(params.contactId);
      if (!contact || !contact.instagramId) {
        return { success: false, error: "Contact Instagram ID not found" };
      }

      const settings = await storage.getChannelSettings(conversation.userId);
      const instagramSettings = settings.find(s => s.channel === 'instagram');
      
      if (!instagramSettings?.config) {
        return { success: false, error: "Instagram not configured" };
      }

      const config = instagramSettings.config as any;
      if (!config.accessToken) {
        return { success: false, error: "Instagram access token missing" };
      }
      if (!config.pageId) {
        return { success: false, error: "Instagram page ID missing" };
      }

      const accessToken = config.accessToken;
      const pageId = config.pageId;
      const recipientId = contact.instagramId;

      const response = await fetch(
        `https://graph.facebook.com/v19.0/${pageId}/messages`,
        {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            recipient: { id: recipientId },
            message: params.mediaUrl 
              ? { attachment: { type: 'image', payload: { url: params.mediaUrl } } }
              : { text: params.content },
            messaging_type: 'RESPONSE',
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Instagram API HTTP error:", response.status, errorText);
        return { success: false, error: `Instagram API error: ${response.status}` };
      }

      const result = await response.json();

      if (result.error) {
        return { success: false, error: result.error.message || "Instagram API error" };
      }

      return {
        success: true,
        externalMessageId: result.message_id,
      };
    } catch (error: any) {
      console.error("Instagram send error:", error);
      return {
        success: false,
        error: error.message || "Failed to send Instagram message",
      };
    }
  }

  async isAvailable(userId: string): Promise<boolean> {
    const settings = await storage.getChannelSettings(userId);
    const instagramSettings = settings.find(s => s.channel === 'instagram');
    const config = instagramSettings?.config as any;
    return !!(instagramSettings?.isConnected && config?.accessToken && config?.pageId);
  }
}

class FacebookAdapter implements ChannelAdapter {
  async send(params: {
    contactId: string;
    conversationId: string;
    content: string;
    contentType?: string;
    mediaUrl?: string;
  }): Promise<{ success: boolean; externalMessageId?: string; error?: string }> {
    try {
      const conversation = await storage.getConversation(params.conversationId);
      if (!conversation) {
        return { success: false, error: "Conversation not found" };
      }

      const contact = await storage.getContact(params.contactId);
      if (!contact || !contact.facebookId) {
        return { success: false, error: "Contact Facebook ID not found" };
      }

      const settings = await storage.getChannelSettings(conversation.userId);
      const facebookSettings = settings.find(s => s.channel === 'facebook');
      
      if (!facebookSettings?.config) {
        return { success: false, error: "Facebook Messenger not configured" };
      }

      const config = facebookSettings.config as any;
      if (!config.accessToken) {
        return { success: false, error: "Facebook access token missing" };
      }
      if (!config.pageId) {
        return { success: false, error: "Facebook page ID missing" };
      }

      const accessToken = config.accessToken;
      const pageId = config.pageId;
      const recipientId = contact.facebookId;

      const response = await fetch(
        `https://graph.facebook.com/v19.0/${pageId}/messages`,
        {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            recipient: { id: recipientId },
            message: params.mediaUrl 
              ? { attachment: { type: 'image', payload: { url: params.mediaUrl } } }
              : { text: params.content },
            messaging_type: 'RESPONSE',
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Facebook API HTTP error:", response.status, errorText);
        return { success: false, error: `Facebook API error: ${response.status}` };
      }

      const result = await response.json();

      if (result.error) {
        return { success: false, error: result.error.message || "Facebook API error" };
      }

      return {
        success: true,
        externalMessageId: result.message_id,
      };
    } catch (error: any) {
      console.error("Facebook send error:", error);
      return {
        success: false,
        error: error.message || "Failed to send Facebook message",
      };
    }
  }

  async isAvailable(userId: string): Promise<boolean> {
    const settings = await storage.getChannelSettings(userId);
    const facebookSettings = settings.find(s => s.channel === 'facebook');
    const config = facebookSettings?.config as any;
    return !!(facebookSettings?.isConnected && config?.accessToken && config?.pageId);
  }
}

class TiktokAdapter implements ChannelAdapter {
  async send(params: {
    contactId: string;
    conversationId: string;
    content: string;
    contentType?: string;
    mediaUrl?: string;
  }): Promise<{ success: boolean; externalMessageId?: string; error?: string }> {
    return { 
      success: false, 
      error: "TikTok does not support direct messaging. Please reach out via WhatsApp or SMS." 
    };
  }

  async isAvailable(userId: string): Promise<boolean> {
    return false;
  }
}

class TelegramAdapter implements ChannelAdapter {
  async send(params: {
    contactId: string;
    conversationId: string;
    content: string;
    contentType?: string;
    mediaUrl?: string;
  }): Promise<{ success: boolean; externalMessageId?: string; error?: string }> {
    try {
      const conversation = await storage.getConversation(params.conversationId);
      if (!conversation) {
        return { success: false, error: "Conversation not found" };
      }

      const contact = await storage.getContact(params.contactId);
      if (!contact || !contact.telegramId) {
        return { success: false, error: "Contact Telegram ID not found" };
      }

      const settings = await storage.getChannelSettings(conversation.userId);
      const telegramSettings = settings.find(s => s.channel === 'telegram');
      
      if (!telegramSettings?.config || !(telegramSettings.config as any).botToken) {
        return { success: false, error: "Telegram bot not configured" };
      }

      const botToken = (telegramSettings.config as any).botToken;
      const chatId = contact.telegramId;

      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: params.content,
          }),
        }
      );

      const result = await response.json();

      if (!result.ok) {
        return { success: false, error: result.description || "Telegram API error" };
      }

      return {
        success: true,
        externalMessageId: String(result.result.message_id),
      };
    } catch (error: any) {
      console.error("Telegram send error:", error);
      return {
        success: false,
        error: error.message || "Failed to send Telegram message",
      };
    }
  }

  async isAvailable(userId: string): Promise<boolean> {
    const settings = await storage.getChannelSettings(userId);
    const telegramSettings = settings.find(s => s.channel === 'telegram');
    return !!(telegramSettings?.isConnected && (telegramSettings.config as any)?.botToken);
  }
}

export function registerChannelAdapters(): void {
  channelService.registerAdapter('whatsapp', new WhatsAppAdapter());
  channelService.registerAdapter('sms', new SMSAdapter());
  channelService.registerAdapter('webchat', new WebChatAdapter());
  channelService.registerAdapter('telegram', new TelegramAdapter());
  channelService.registerAdapter('instagram', new InstagramAdapter());
  channelService.registerAdapter('facebook', new FacebookAdapter());
  channelService.registerAdapter('tiktok', new TiktokAdapter());
  
  console.log("Channel adapters registered: whatsapp, sms, webchat, telegram, instagram, facebook, tiktok");
}
