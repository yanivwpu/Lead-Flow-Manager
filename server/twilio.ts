import Twilio from "twilio";
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

export function createTwilioClient(user: User) {
  if (!user.twilioAccountSid || !user.twilioAuthToken) {
    throw new Error("Twilio credentials not configured");
  }
  return Twilio(user.twilioAccountSid, user.twilioAuthToken);
}

export async function sendWhatsAppMessage(
  user: User,
  toPhone: string,
  message: string
): Promise<{ sid: string; status: string }> {
  const client = createTwilioClient(user);
  
  if (!user.twilioWhatsappNumber) {
    throw new Error("Twilio WhatsApp number not configured");
  }

  const result = await client.messages.create({
    from: `whatsapp:${user.twilioWhatsappNumber}`,
    to: `whatsapp:${toPhone}`,
    body: message,
  });

  return { sid: result.sid, status: result.status };
}

export async function verifyTwilioCredentials(
  accountSid: string,
  authToken: string
): Promise<boolean> {
  try {
    const client = Twilio(accountSid, authToken);
    await client.api.accounts(accountSid).fetch();
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

export async function findUserByTwilioAccount(accountSid: string): Promise<User | undefined> {
  const { db } = await import("../drizzle/db");
  const { users } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");
  
  const result = await db.select().from(users).where(eq(users.twilioAccountSid, accountSid));
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
