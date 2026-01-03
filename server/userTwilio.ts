import twilio from "twilio";
import crypto from "crypto";
import { storage } from "./storage";
import type { User, Chat } from "@shared/schema";

export interface WhatsAppMessage {
  id: string;
  text: string;
  time: string;
  sent: boolean;
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
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
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
  message: string
): Promise<{ sid: string; status: string }> {
  const client = await getUserTwilioClient(userId);
  const fromNumber = await getUserTwilioNumber(userId);

  if (!client || !fromNumber) {
    throw new Error("Twilio not connected. Please connect your Twilio account first.");
  }

  const result = await client.messages.create({
    from: `whatsapp:${fromNumber}`,
    to: `whatsapp:${toPhone}`,
    body: message,
  });

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

export async function connectUserTwilio(
  userId: string,
  credentials: TwilioCredentials
): Promise<{ success: boolean; error?: string }> {
  const validation = await validateTwilioCredentials(credentials);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const encryptedAuthToken = encryptCredential(credentials.authToken);
  const phoneNumber = credentials.whatsappNumber.replace(/[^\d+]/g, "");

  await storage.updateUser(userId, {
    twilioAccountSid: credentials.accountSid,
    twilioAuthToken: encryptedAuthToken,
    twilioWhatsappNumber: phoneNumber,
    twilioConnected: true,
  });

  return { success: true };
}

export async function disconnectUserTwilio(userId: string): Promise<void> {
  await storage.updateUser(userId, {
    twilioAccountSid: null,
    twilioAuthToken: null,
    twilioWhatsappNumber: null,
    twilioConnected: false,
  });
}

export function parseIncomingWebhook(body: any) {
  return {
    from: body.From?.replace("whatsapp:", "") || "",
    to: body.To?.replace("whatsapp:", "") || "",
    body: body.Body || "",
    messageSid: body.MessageSid || "",
    accountSid: body.AccountSid || "",
    numMedia: parseInt(body.NumMedia || "0"),
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
): Promise<User | undefined> {
  const { db } = await import("../drizzle/db");
  const { users } = await import("@shared/schema");
  const { eq, and } = await import("drizzle-orm");

  const normalizedPhone = twilioPhone.replace(/[^\d+]/g, "");

  const result = await db.select().from(users).where(
    and(
      eq(users.twilioAccountSid, accountSid),
      eq(users.twilioWhatsappNumber, normalizedPhone)
    )
  );

  return result[0];
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
