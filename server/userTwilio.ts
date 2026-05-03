import twilio from "twilio";
import crypto from "crypto";
import { storage } from "./storage";
import type { User, Chat } from "@shared/schema";

export interface WhatsAppMessage {
  id: string;
  text: string;
  time: string;
  sent: boolean;
  sender?: "me" | "them";
  status?: "sent" | "delivered" | "read" | "failed";
  twilioSid?: string;
}

const ENCRYPTION_KEY = process.env.TWILIO_ENCRYPTION_KEY || process.env.SESSION_SECRET || "default-encryption-key-change-in-production";
const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  return crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
}

export function encryptCredential(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decryptCredential(encryptedText: string): string {
  try {
    const [ivHex, authTagHex, encrypted] = encryptedText.split(":");
    if (!ivHex || !authTagHex || !encrypted) {
      return encryptedText;
    }
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: 16 });
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return encryptedText;
  }
}

export function isEncrypted(text: string): boolean {
  const parts = text.split(":");
  return parts.length === 3 && parts[0].length === 32;
}

export async function getUserTwilioClient(userId: string): Promise<ReturnType<typeof twilio> | null> {
  const user = await storage.getUser(userId);
  if (!user || !user.twilioAccountSid || !user.twilioAuthToken || !user.twilioConnected) {
    return null;
  }

  const authToken = isEncrypted(user.twilioAuthToken) 
    ? decryptCredential(user.twilioAuthToken)
    : user.twilioAuthToken;

  return twilio(user.twilioAccountSid, authToken);
}

export async function getUserTwilioNumber(userId: string): Promise<string | null> {
  const user = await storage.getUser(userId);
  if (!user || !user.twilioWhatsappNumber || !user.twilioConnected) {
    return null;
  }
  return user.twilioWhatsappNumber;
}

export async function verifyUserTwilioConnection(userId: string): Promise<boolean> {
  const client = await getUserTwilioClient(userId);
  if (!client) return false;

  try {
    await client.api.accounts.list({ limit: 1 });
    return true;
  } catch (error) {
    console.error("User Twilio verification failed:", error);
    return false;
  }
}

export async function sendUserWhatsAppMessage(
  userId: string,
  toPhone: string,
  message: string,
  fromNumber?: string // optional override — used when conversation.channelAccountId is a secondary number
): Promise<{ sid: string; status: string }> {
  const client = await getUserTwilioClient(userId);
  const defaultFromNumber = await getUserTwilioNumber(userId);
  const actualFrom = fromNumber || defaultFromNumber;

  if (!client || !actualFrom) {
    throw new Error("Twilio not connected. Please connect your Twilio account first.");
  }

  const result = await client.messages.create({
    from: `whatsapp:${actualFrom}`,
    to: `whatsapp:${toPhone}`,
    body: message,
  });

  console.log(`[TwilioSend] Sent from ${actualFrom} to ${toPhone}, sid: ${result.sid}`);
  return { sid: result.sid, status: result.status };
}

export async function sendUserWhatsAppMedia(
  userId: string,
  toPhone: string,
  mediaUrl: string,
  caption?: string,
  fromNumber?: string // optional override — used when conversation.channelAccountId is a secondary number
): Promise<{ sid: string; status: string }> {
  const client = await getUserTwilioClient(userId);
  const defaultFromNumber = await getUserTwilioNumber(userId);
  const actualFrom = fromNumber || defaultFromNumber;

  if (!client || !actualFrom) {
    throw new Error("Twilio not connected. Please connect your Twilio account first.");
  }

  const messageOptions: any = {
    from: `whatsapp:${actualFrom}`,
    to: `whatsapp:${toPhone}`,
    mediaUrl: [mediaUrl],
  };

  if (caption) {
    messageOptions.body = caption;
  }

  const result = await client.messages.create(messageOptions);

  return { sid: result.sid, status: result.status };
}

export interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  whatsappNumber: string;
}

export async function validateTwilioCredentials(credentials: TwilioCredentials): Promise<{ valid: boolean; error?: string }> {
  try {
    const client = twilio(credentials.accountSid, credentials.authToken);
    await client.api.accounts.list({ limit: 1 });

    const phoneNumber = credentials.whatsappNumber.replace(/[^\d+]/g, "");
    if (!phoneNumber.startsWith("+")) {
      return { valid: false, error: "Phone number must start with + and include country code" };
    }

    return { valid: true };
  } catch (error: any) {
    if (error.code === 20003) {
      return { valid: false, error: "Invalid Account SID or Auth Token" };
    }
    return { valid: false, error: error.message || "Failed to validate credentials" };
  }
}

export async function configureWebhooks(
  client: ReturnType<typeof twilio>,
  phoneNumber: string,
  webhookBaseUrl: string
): Promise<{ configured: boolean; method: string; error?: string }> {
  const incomingUrl = `${webhookBaseUrl}/api/webhook/twilio/incoming`;
  const statusUrl = `${webhookBaseUrl}/api/webhook/twilio/status`;

  // WhatsApp webhooks in Twilio are configured SEPARATELY from SMS webhooks.
  // The Twilio REST API does not expose a way to set WhatsApp inbound URLs
  // programmatically via incomingPhoneNumbers or messaging services — those
  // endpoints update the SMS (smsUrl) webhook only, which does NOT apply to
  // WhatsApp messages. WhatsApp webhook configuration must be done manually:
  //   • Sandbox:          console.twilio.com → Messaging → Try it out → Send a WhatsApp message
  //   • Approved Senders: console.twilio.com → Messaging → Senders → WhatsApp Senders → [select sender] → Webhooks
  //
  // We intentionally do NOT attempt an auto-config so we never falsely report
  // success to the user (which led to the "webhooks configured automatically!"
  // message appearing even though WhatsApp webhooks remained unconfigured).
  console.log(`[Twilio Webhook Config] Auto-configuration skipped for WhatsApp.`);
  console.log(`[Twilio Webhook Config] Incoming URL the user must set manually: ${incomingUrl}`);
  console.log(`[Twilio Webhook Config] Status Callback URL the user must set manually: ${statusUrl}`);
  console.log(`[Twilio Webhook Config] Manual setup: Twilio Console → Messaging → Senders → WhatsApp Senders → Webhooks`);

  return {
    configured: false,
    method: 'manual',
    error: 'WhatsApp webhooks require manual configuration in the Twilio Console',
  };
}

export async function connectUserTwilio(
  userId: string,
  credentials: TwilioCredentials,
  webhookBaseUrl?: string
): Promise<{ success: boolean; error?: string; webhooksConfigured?: boolean }> {
  const validation = await validateTwilioCredentials(credentials);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const encryptedAuthToken = encryptCredential(credentials.authToken);

  // Normalise phone number: strip everything except digits and leading '+'
  let phoneNumber = credentials.whatsappNumber.replace(/[^\d+]/g, "");
  // Enforce '+' prefix so findUserByTwilioCredentials can match the webhook "To" field
  if (!phoneNumber.startsWith("+")) {
    phoneNumber = `+${phoneNumber}`;
    console.warn(`[connectUserTwilio] Phone number missing '+' prefix — auto-corrected to: ${phoneNumber}`);
  }

  console.log(`[connectUserTwilio] Saving Twilio credentials — userId: ${userId}, number: ${phoneNumber}`);

  await storage.updateUser(userId, {
    twilioAccountSid: credentials.accountSid,
    twilioAuthToken: encryptedAuthToken,
    twilioWhatsappNumber: phoneNumber,
    twilioConnected: true,
  });

  // Try to auto-configure webhooks
  let webhooksConfigured = false;
  if (webhookBaseUrl) {
    try {
      const client = twilio(credentials.accountSid, credentials.authToken);
      const result = await configureWebhooks(client, phoneNumber, webhookBaseUrl);
      webhooksConfigured = result.configured;
    } catch (e) {
      console.log('Failed to auto-configure webhooks:', e);
    }
  }

  return { success: true, webhooksConfigured };
}

export async function disconnectUserTwilio(userId: string): Promise<void> {
  const user = await storage.getUser(userId);
  
  console.log('[disconnectUserTwilio] Starting disconnect for user:', userId, {
    currentProvider: user?.whatsappProvider,
    metaConnected: user?.metaConnected,
    twilioConnected: user?.twilioConnected,
  });
  
  // Determine the provider after disconnect:
  // - If Meta is connected, switch to it
  // - Otherwise, keep "twilio" as the default (but it won't be available)
  const newProvider = user?.metaConnected ? "meta" : "twilio";
  
  await storage.updateUser(userId, {
    twilioAccountSid: null,
    twilioAuthToken: null,
    twilioWhatsappNumber: null,
    twilioConnected: false,
    whatsappProvider: newProvider,
  });
  
  // Update channel settings to reflect connection state
  // WhatsApp is "connected" only if Meta is still connected after Twilio disconnect
  try {
    await storage.upsertChannelSetting(userId, 'whatsapp', {
      isConnected: user?.metaConnected || false,
    });
    console.log('[disconnectUserTwilio] Channel settings updated, isConnected:', user?.metaConnected || false);
  } catch (error) {
    console.error('[disconnectUserTwilio] Failed to update channel settings:', error);
  }
  
  console.log('[disconnectUserTwilio] Twilio disconnected successfully, new state:', {
    whatsappProvider: newProvider,
    metaConnected: user?.metaConnected || false,
    twilioConnected: false,
    whatsappIsConnected: user?.metaConnected || false,
  });
}

export function parseIncomingWebhook(body: any) {
  const numMedia = parseInt(body.NumMedia || "0", 10);
  let mediaUrl: string | undefined;
  let mediaContentType: string | undefined;
  if (numMedia > 0) {
    mediaUrl = body.MediaUrl0 || body["MediaUrl0"];
    mediaContentType = body.MediaContentType0 || body["MediaContentType0"];
  }
  return {
    from: body.From?.replace("whatsapp:", "") || "",
    to: body.To?.replace("whatsapp:", "") || "",
    body: body.Body || "",
    messageSid: body.MessageSid || "",
    accountSid: body.AccountSid || "",
    numMedia,
    mediaUrl,
    mediaContentType,
    profileName: body.ProfileName || "",
  };
}

export function parseStatusWebhook(body: any) {
  return {
    messageSid: body.MessageSid || "",
    status: body.MessageStatus as "sent" | "delivered" | "read" | "failed",
    to: body.To?.replace("whatsapp:", "") || "",
    accountSid: body.AccountSid || "",
  };
}

export async function findUserByTwilioCredentials(
  accountSid: string,
  twilioPhone: string
): Promise<{ user: User; matchedPhone: string } | undefined> {
  const { db } = await import("../drizzle/db");
  const { users, registeredPhones } = await import("@shared/schema");
  const { eq, and } = await import("drizzle-orm");

  const normalizedPhone = twilioPhone.replace(/[^\d+]/g, "");

  // 1. Check primary number in users table
  const primaryResult = await db.select().from(users).where(
    and(
      eq(users.twilioAccountSid, accountSid),
      eq(users.twilioWhatsappNumber, normalizedPhone)
    )
  );
  if (primaryResult[0]) {
    return { user: primaryResult[0], matchedPhone: normalizedPhone };
  }

  // 2. Check registeredPhones table (secondary numbers)
  const phoneRow = await db.select().from(registeredPhones)
    .where(eq(registeredPhones.phoneNumber, normalizedPhone));
  if (!phoneRow[0]) return undefined;

  // Verify the accountSid belongs to the user who owns this registered phone
  const userRow = await db.select().from(users).where(
    and(
      eq(users.id, phoneRow[0].userId),
      eq(users.twilioAccountSid, accountSid)
    )
  );
  if (!userRow[0]) return undefined;

  console.log(`[TwilioRouter] Matched secondary number ${normalizedPhone} → userId: ${userRow[0].id}`);
  return { user: userRow[0], matchedPhone: normalizedPhone };
}

/**
 * Non–phone values stored in `chats.whatsapp_phone` for legacy workflow dual-write
 * (e.g. Calendly). Prefix is never digits-only, so it cannot collide with Twilio’s
 * normalized numeric `whatsappPhone` keys.
 */
export const LEGACY_CHAT_CALENDLY_PREFIX = "calendly:" as const;

export function isLegacyCalendlyWorkflowChat(whatsappPhone: string | null | undefined): boolean {
  return !!whatsappPhone && whatsappPhone.startsWith(LEGACY_CHAT_CALENDLY_PREFIX);
}

/** Storage key for `chats.whatsapp_phone` — pass already-normalized email. */
export function legacyCalendlyChatStorageKey(normalizedEmail: string): string {
  return `${LEGACY_CHAT_CALENDLY_PREFIX}${normalizedEmail.trim().toLowerCase()}`;
}

/** Legacy `chats` row for workflow triggers — same table as WhatsApp, distinct key namespace. */
export async function findOrCreateLegacyCalendlyWorkflowChat(
  userId: string,
  normalizedEmail: string,
  name: string
): Promise<Chat> {
  return findOrCreateChatByPhone(userId, legacyCalendlyChatStorageKey(normalizedEmail), name);
}

export async function findOrCreateChatByPhone(
  userId: string,
  phone: string,
  name: string
): Promise<Chat> {
  const { db } = await import("../drizzle/db");
  const { chats } = await import("@shared/schema");
  const { eq, and } = await import("drizzle-orm");

  const existing = await db.select().from(chats).where(
    and(eq(chats.userId, userId), eq(chats.whatsappPhone, phone))
  );

  if (existing[0]) {
    return existing[0];
  }

  const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  const colors = ["#22c55e", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444"];
  const color = colors[Math.floor(Math.random() * colors.length)];

  const result = await db.insert(chats).values({
    userId,
    name: name || phone,
    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name || phone)}&background=${color.slice(1)}&color=fff`,
    whatsappPhone: phone,
    lastMessage: "",
    time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    messages: [],
  }).returning();

  return result[0];
}
