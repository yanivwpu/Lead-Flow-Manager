import twilio from "twilio";
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

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('Twilio connector not available');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=twilio',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.account_sid || !connectionSettings.settings.api_key || !connectionSettings.settings.api_key_secret)) {
    throw new Error('Twilio not connected');
  }
  return {
    accountSid: connectionSettings.settings.account_sid,
    apiKey: connectionSettings.settings.api_key,
    apiKeySecret: connectionSettings.settings.api_key_secret,
    phoneNumber: connectionSettings.settings.phone_number
  };
}

export async function getTwilioClient() {
  const { accountSid, apiKey, apiKeySecret } = await getCredentials();
  return twilio(apiKey, apiKeySecret, {
    accountSid: accountSid
  });
}

export async function getTwilioFromPhoneNumber() {
  const { phoneNumber } = await getCredentials();
  return phoneNumber;
}

export async function getTwilioAccountSid() {
  const { accountSid } = await getCredentials();
  return accountSid;
}

export async function sendWhatsAppMessage(
  toPhone: string,
  message: string
): Promise<{ sid: string; status: string }> {
  const client = await getTwilioClient();
  const fromNumber = await getTwilioFromPhoneNumber();
  
  if (!fromNumber) {
    throw new Error("Twilio WhatsApp number not configured");
  }

  const result = await client.messages.create({
    from: `whatsapp:${fromNumber}`,
    to: `whatsapp:${toPhone}`,
    body: message,
  });

  return { sid: result.sid, status: result.status };
}

export async function verifyTwilioConnection(): Promise<boolean> {
  try {
    await getCredentials();
    return true;
  } catch (error) {
    console.error("Twilio verification failed:", error);
    return false;
  }
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
