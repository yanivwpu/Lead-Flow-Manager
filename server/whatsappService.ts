import { storage } from "./storage";
import {
  sendUserWhatsAppMessage,
  sendUserWhatsAppMedia,
  disconnectUserTwilio,
} from "./userTwilio";
import {
  sendMetaWhatsAppMessage,
  sendMetaWhatsAppMedia,
  disconnectUserMeta,
} from "./userMeta";

export type WhatsAppProvider = "meta" | "twilio";

// ─── Result types ────────────────────────────────────────────────────────────

export interface AvailabilityResult {
  available: boolean;
  provider: WhatsAppProvider;
  reason?: string;
  message?: string;
}

export interface SendResult {
  success: boolean;
  messageId: string;
  provider: WhatsAppProvider;
  error?: string;
}

export interface SendMediaResult {
  success: boolean;
  messageId: string;
  provider: WhatsAppProvider;
  error?: string;
}

export interface ProviderStatus {
  activeProvider: WhatsAppProvider;
  twilio: {
    connected: boolean;
    whatsappNumber: string | null;
    hasCredentials: boolean;
  };
  meta: {
    connected: boolean;
    phoneNumberId: string | null;
    businessAccountId: string | null;
    hasCredentials: boolean;
    webhookUrl: string;
    webhookVerifyToken: string | null;
  };
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Single source of truth for whether WhatsApp is usable for a user right now.
 * Reads whatsappProvider preference and validates the corresponding connection flag.
 */
export async function getWhatsAppAvailability(userId: string): Promise<AvailabilityResult> {
  const user = await storage.getUser(userId);
  if (!user) {
    return {
      available: false,
      provider: "twilio",
      reason: "User not found",
      message: "User not found",
    };
  }

  const provider: WhatsAppProvider = (user.whatsappProvider as WhatsAppProvider) || "twilio";

  if (provider === "meta") {
    const isConnected = user.metaConnected || false;
    return {
      available: isConnected,
      provider: "meta",
      reason: isConnected ? undefined : "Meta WhatsApp Business API not connected",
      message: isConnected ? undefined : "Connect Meta WhatsApp in Settings to send messages",
    };
  }

  const isConnected = user.twilioConnected || false;
  return {
    available: isConnected,
    provider: "twilio",
    reason: isConnected ? undefined : "Twilio WhatsApp connection not found",
    message: isConnected ? undefined : "Connect Twilio in Settings to send messages",
  };
}

/**
 * Send a WhatsApp text message, routing to the correct provider automatically.
 * Callers do not need to know which provider is active.
 */
export async function sendWhatsAppMessage(
  userId: string,
  to: string,
  text: string,
  fromNumber?: string // override the from-number (Twilio multi-number support)
): Promise<SendResult> {
  const availability = await getWhatsAppAvailability(userId);

  if (!availability.available) {
    return {
      success: false,
      messageId: "",
      provider: availability.provider,
      error: availability.reason,
    };
  }

  if (availability.provider === "meta") {
    // Meta doesn't use fromNumber override — it always uses the configured phone number ID
    const result = await sendMetaWhatsAppMessage(userId, to, text);
    return { success: true, messageId: result.messageId, provider: "meta" };
  }

  const result = await sendUserWhatsAppMessage(userId, to, text, fromNumber);
  return { success: true, messageId: result.sid, provider: "twilio" };
}

/**
 * Send a WhatsApp media message, routing to the correct provider automatically.
 * mediaType defaults to "image" when not supplied (covers most send-media cases).
 */
export async function sendWhatsAppMedia(
  userId: string,
  to: string,
  mediaUrl: string,
  mediaType: "image" | "video" | "audio" | "document" = "image",
  caption?: string,
  fromNumber?: string, // override the from-number (Twilio multi-number support)
  filename?: string    // original filename — passed to Meta for document messages
): Promise<SendMediaResult> {
  const availability = await getWhatsAppAvailability(userId);

  if (!availability.available) {
    console.warn(
      `[WhatsAppService] Media send skipped — userId=${userId} provider=${availability.provider}` +
      ` reason="${availability.reason}"`
    );
    return {
      success: false,
      messageId: "",
      provider: availability.provider,
      error: availability.reason,
    };
  }

  console.log(
    `[WhatsAppService] Routing media — userId=${userId} provider=${availability.provider}` +
    ` to=${to} type=${mediaType} filename="${filename || "(none)"}"`
  );

  if (availability.provider === "meta") {
    const result = await sendMetaWhatsAppMedia(userId, to, mediaUrl, mediaType, caption, filename);
    return { success: true, messageId: result.messageId, provider: "meta" };
  }

  const result = await sendUserWhatsAppMedia(userId, to, mediaUrl, caption, fromNumber);
  return { success: true, messageId: result.sid, provider: "twilio" };
}

/**
 * Disconnect one provider.  After disconnect the other provider (if connected)
 * becomes the active one automatically via the disconnect functions.
 */
export async function disconnectWhatsAppProvider(
  userId: string,
  provider: WhatsAppProvider
): Promise<void> {
  if (provider === "meta") {
    await disconnectUserMeta(userId);
  } else {
    await disconnectUserTwilio(userId);
  }
}

/**
 * Full provider status for both Twilio and Meta, from one place.
 * Used by /api/twilio/status, /api/meta/status, and /api/whatsapp/providers.
 */
export async function getProviderStatus(userId: string): Promise<ProviderStatus> {
  const user = await storage.getUser(userId);
  if (!user) throw new Error("User not found");

  const webhookBaseUrl =
    process.env.APP_URL ||
    `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;

  return {
    activeProvider: (user.whatsappProvider as WhatsAppProvider) || "twilio",
    twilio: {
      connected: user.twilioConnected || false,
      whatsappNumber: user.twilioWhatsappNumber || null,
      hasCredentials: !!(user.twilioAccountSid && user.twilioAuthToken),
    },
    meta: {
      connected: user.metaConnected || false,
      phoneNumberId: user.metaPhoneNumberId || null,
      businessAccountId: user.metaBusinessAccountId || null,
      hasCredentials: !!(user.metaAccessToken && user.metaPhoneNumberId),
      webhookUrl: `${webhookBaseUrl}/api/webhook/meta`,
      webhookVerifyToken: user.metaConnected ? user.metaWebhookVerifyToken : null,
    },
  };
}
