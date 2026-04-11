import { storage } from "./storage";
import { channelService, ChannelAdapter } from "./channelService";
import {
  sendWhatsAppMessage,
  sendWhatsAppMedia,
  getWhatsAppAvailability,
} from "./whatsappService";
import { 
  getUserTwilioClient,
  getUserTwilioNumber 
} from "./userTwilio";
import type { Channel } from "@shared/schema";

// Meta's 24-hour messaging window constants
const META_WINDOW_HOURS = 24;
const META_WINDOW_WARNING_HOURS = 4; // Warn when less than 4 hours remaining

// Helper to check Meta messaging window status
interface WindowStatus {
  isActive: boolean;
  expiresAt: Date | null;
  hoursRemaining: number | null;
  isExpiringSoon: boolean; // Less than 4 hours remaining
}

async function checkMetaWindow(conversationId: string): Promise<WindowStatus> {
  const conversation = await storage.getConversation(conversationId);
  
  if (!conversation) {
    return { isActive: false, expiresAt: null, hoursRemaining: null, isExpiringSoon: false };
  }

  // If no window expiry set, assume window is NOT active (user hasn't messaged yet)
  if (!conversation.windowExpiresAt) {
    return { isActive: false, expiresAt: null, hoursRemaining: null, isExpiringSoon: false };
  }

  const now = new Date();
  const expiresAt = new Date(conversation.windowExpiresAt);
  const hoursRemaining = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);

  return {
    isActive: expiresAt > now,
    expiresAt,
    hoursRemaining: Math.max(0, hoursRemaining),
    isExpiringSoon: hoursRemaining > 0 && hoursRemaining < META_WINDOW_WARNING_HOURS,
  };
}

// Update the messaging window when receiving an inbound message
export async function updateMetaWindowOnInbound(conversationId: string): Promise<void> {
  const windowExpiresAt = new Date(Date.now() + META_WINDOW_HOURS * 60 * 60 * 1000);
  await storage.updateConversation(conversationId, {
    windowActive: true,
    windowExpiresAt,
  });
}

// Parse Meta API errors into user-friendly messages
function parseMetaError(error: any, channel: string): string {
  const code = error?.code;
  const subcode = error?.error_subcode;
  const message = error?.message || '';

  // Common Meta error codes
  if (code === 10 || message.includes('permission')) {
    return `${channel} permissions error. Please reconnect your ${channel} account in Settings.`;
  }
  if (code === 100 && subcode === 2018278) {
    return `The 24-hour messaging window has expired. You can only respond after the customer messages you first.`;
  }
  if (code === 100 && message.includes('recipient')) {
    return `Cannot reach this user on ${channel}. They may have blocked messages or their account is unavailable.`;
  }
  if (code === 190) {
    return `${channel} access token expired. Please reconnect your account in Settings.`;
  }
  if (code === 551) {
    return `This user cannot receive messages on ${channel}. They may need to start the conversation first.`;
  }
  if (message.includes('rate limit') || code === 4) {
    return `Too many messages sent. Please wait a moment before sending more.`;
  }

  return error?.message || `Failed to send ${channel} message`;
}

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
      const isMedia = !!(params.mediaUrl && params.contentType !== "text");

      // Multi-number: use the specific business number this conversation is tied to
      const fromNumber = conversation.channelAccountId || undefined;
      if (fromNumber) {
        console.log(`[WhatsAppAdapter] Using channelAccountId=${fromNumber} as from-number (multi-number conversation)`);
      }

      if (isMedia) {
        const mediaType = (params.contentType === "video" ? "video"
          : params.contentType === "audio" ? "audio"
          : params.contentType === "document" ? "document"
          : "image") as "image" | "video" | "audio" | "document";
        const result = await sendWhatsAppMedia(
          conversation.userId, phone, params.mediaUrl!, mediaType, params.content, fromNumber
        );
        console.log(`[WhatsAppAdapter] media sent via ${result.provider} to ${phone}`);
        if (!result.success) return { success: false, error: result.error };
        return { success: true, externalMessageId: result.messageId };
      }

      const result = await sendWhatsAppMessage(conversation.userId, phone, params.content, fromNumber);
      console.log(`[WhatsAppAdapter] text sent via ${result.provider} to ${phone}`);
      if (!result.success) return { success: false, error: result.error };
      return { success: true, externalMessageId: result.messageId };
    } catch (error: any) {
      console.error("WhatsApp send error:", error);
      return { success: false, error: error.message || "Failed to send WhatsApp message" };
    }
  }

  async isAvailable(userId: string): Promise<boolean> {
    const result = await getWhatsAppAvailability(userId);
    console.log(`[WhatsAppAdapter] isAvailable: provider=${result.provider}, available=${result.available}`);
    return result.available;
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
  }): Promise<{ success: boolean; externalMessageId?: string; error?: string; windowStatus?: WindowStatus }> {
    try {
      const conversation = await storage.getConversation(params.conversationId);
      if (!conversation) {
        return { success: false, error: "Conversation not found" };
      }

      const contact = await storage.getContact(params.contactId);
      if (!contact || !contact.instagramId) {
        return { success: false, error: "Contact Instagram ID not found" };
      }

      // Check 24-hour messaging window (Meta policy)
      const windowStatus = await checkMetaWindow(params.conversationId);
      if (!windowStatus.isActive) {
        return { 
          success: false, 
          error: "The 24-hour Instagram messaging window has expired. You can only respond after the customer messages you first.",
          windowStatus,
        };
      }

      const settings = await storage.getChannelSettings(conversation.userId);
      const instagramSettings = settings.find(s => s.channel === 'instagram');

      if (!instagramSettings?.config) {
        console.error(`[Outbound] Instagram credential lookup FAILED for userId=${conversation.userId} — no channelSettings record found for channel=instagram. Hint: Connect Instagram via Integrations page.`);
        return { success: false, error: "Instagram not configured. Please connect your Instagram account in Settings > Integrations." };
      }

      const config = instagramSettings.config as any;
      if (!config.accessToken) {
        console.error(`[Outbound] Instagram credential lookup FAILED for userId=${conversation.userId} — accessToken missing from channelSettings.config.`);
        return { success: false, error: "Instagram access token missing. Please reconnect your Instagram account." };
      }
      if (!config.pageId) {
        console.error(`[Outbound] Instagram credential lookup FAILED for userId=${conversation.userId} — pageId missing from channelSettings.config.`);
        return { success: false, error: "Instagram page ID missing. Please reconnect your Instagram account." };
      }

      console.log(`[Outbound] Instagram credentials loaded — userId=${conversation.userId}, pageId=${config.pageId}`);
      const accessToken = config.accessToken;
      const pageId = config.pageId;
      const recipientId = contact.instagramId;

      // Use RESPONSE messaging type (within 24-hour window) or MESSAGE_TAG for allowed cases
      const messagingType = windowStatus.isExpiringSoon ? 'RESPONSE' : 'RESPONSE';

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
            messaging_type: messagingType,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || result.error) {
        const errorMessage = parseMetaError(result.error, 'Instagram');
        console.error("Instagram API error:", response.status, result.error);
        return { success: false, error: errorMessage, windowStatus };
      }

      return {
        success: true,
        externalMessageId: result.message_id,
        windowStatus,
      };
    } catch (error: any) {
      console.error("Instagram send error:", error);
      return {
        success: false,
        error: parseMetaError(error, 'Instagram'),
      };
    }
  }

  async isAvailable(userId: string): Promise<boolean> {
    const settings = await storage.getChannelSettings(userId);
    const instagramSettings = settings.find(s => s.channel === 'instagram');
    const config = instagramSettings?.config as any;
    return !!(instagramSettings?.isConnected && config?.accessToken && config?.pageId);
  }

  // Check window status without sending (for UI)
  async getWindowStatus(conversationId: string): Promise<WindowStatus> {
    return checkMetaWindow(conversationId);
  }
}

class FacebookAdapter implements ChannelAdapter {
  async send(params: {
    contactId: string;
    conversationId: string;
    content: string;
    contentType?: string;
    mediaUrl?: string;
  }): Promise<{ success: boolean; externalMessageId?: string; error?: string; windowStatus?: WindowStatus }> {
    try {
      const conversation = await storage.getConversation(params.conversationId);
      if (!conversation) {
        return { success: false, error: "Conversation not found" };
      }

      const contact = await storage.getContact(params.contactId);
      if (!contact || !contact.facebookId) {
        return { success: false, error: "Contact Facebook ID not found" };
      }

      // Check 24-hour messaging window (Meta policy)
      const windowStatus = await checkMetaWindow(params.conversationId);
      if (!windowStatus.isActive) {
        return { 
          success: false, 
          error: "The 24-hour Facebook Messenger window has expired. You can only respond after the customer messages you first.",
          windowStatus,
        };
      }

      const settings = await storage.getChannelSettings(conversation.userId);
      const facebookSettings = settings.find(s => s.channel === 'facebook');

      if (!facebookSettings?.config) {
        console.error(`[Outbound] Facebook credential lookup FAILED for userId=${conversation.userId} — no channelSettings record found for channel=facebook. Hint: Connect Facebook via Integrations page.`);
        return { success: false, error: "Facebook Messenger not configured. Please connect your Facebook Page in Settings > Integrations." };
      }

      const config = facebookSettings.config as any;
      if (!config.accessToken) {
        console.error(`[Outbound] Facebook credential lookup FAILED for userId=${conversation.userId} — accessToken missing from channelSettings.config.`);
        return { success: false, error: "Facebook access token missing. Please reconnect your Facebook Page." };
      }
      if (!config.pageId) {
        console.error(`[Outbound] Facebook credential lookup FAILED for userId=${conversation.userId} — pageId missing from channelSettings.config.`);
        return { success: false, error: "Facebook page ID missing. Please reconnect your Facebook Page." };
      }

      console.log(`[Outbound] Facebook credentials loaded — userId=${conversation.userId}, pageId=${config.pageId}`);
      const accessToken = config.accessToken;
      const pageId = config.pageId;
      const recipientId = contact.facebookId;

      // Use RESPONSE messaging type (within 24-hour window)
      const messagingType = 'RESPONSE';

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
            messaging_type: messagingType,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || result.error) {
        const errorMessage = parseMetaError(result.error, 'Facebook Messenger');
        console.error("Facebook API error:", response.status, result.error);
        return { success: false, error: errorMessage, windowStatus };
      }

      return {
        success: true,
        externalMessageId: result.message_id,
        windowStatus,
      };
    } catch (error: any) {
      console.error("Facebook send error:", error);
      return {
        success: false,
        error: parseMetaError(error, 'Facebook Messenger'),
      };
    }
  }

  async isAvailable(userId: string): Promise<boolean> {
    const settings = await storage.getChannelSettings(userId);
    const facebookSettings = settings.find(s => s.channel === 'facebook');
    const config = facebookSettings?.config as any;
    return !!(facebookSettings?.isConnected && config?.accessToken && config?.pageId);
  }

  // Check window status without sending (for UI)
  async getWindowStatus(conversationId: string): Promise<WindowStatus> {
    return checkMetaWindow(conversationId);
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
