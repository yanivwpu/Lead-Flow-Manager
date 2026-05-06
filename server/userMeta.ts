import crypto from "crypto";
import { storage } from "./storage";
import type { User, Chat } from "@shared/schema";
import { getMetaGraphApiBase } from "./metaGraphVersion";

export interface WhatsAppMessage {
  id: string;
  text: string;
  time: string;
  sent: boolean;
  sender?: "me" | "them";
  status?: "sent" | "delivered" | "read" | "failed";
  metaMessageId?: string;
}

const ENCRYPTION_KEY = process.env.META_ENCRYPTION_KEY || process.env.SESSION_SECRET || "default-encryption-key-change-in-production";
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

export interface MetaCredentials {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  appSecret?: string;
  webhookVerifyToken?: string;
}

/** Extra columns when connecting via Embedded Signup vs manual paste. */
export interface MetaConnectExtras {
  /** OAuth Embedded Signup completion + legacy manual paste path */
  connectionType?: "embedded_signup" | "embedded" | "coexistence" | "manual_legacy";
  displayPhoneNumber?: string | null;
  verifiedName?: string | null;
  tokenExpiresAt?: Date | null;
  webhookSubscribed?: boolean;
  metaIntegrationStatus?: string;
}

export async function getMetaAccessToken(userId: string): Promise<string | null> {
  const user = await storage.getUserForSession(userId);
  if (!user || !user.metaAccessToken || !user.metaConnected) {
    return null;
  }
  return isEncrypted(user.metaAccessToken)
    ? decryptCredential(user.metaAccessToken)
    : user.metaAccessToken;
}

export async function getMetaPhoneNumberId(userId: string): Promise<string | null> {
  const user = await storage.getUserForSession(userId);
  if (!user || !user.metaPhoneNumberId || !user.metaConnected) {
    return null;
  }
  return user.metaPhoneNumberId;
}

export async function verifyMetaConnection(userId: string): Promise<boolean> {
  const accessToken = await getMetaAccessToken(userId);
  const phoneNumberId = await getMetaPhoneNumberId(userId);
  
  if (!accessToken || !phoneNumberId) return false;

  try {
    const response = await fetch(
      `${getMetaGraphApiBase()}/${phoneNumberId}?access_token=${accessToken}`
    );
    
    if (!response.ok) {
      let errCode: unknown;
      try {
        const body = (await response.json()) as { error?: { code?: number; message?: string } };
        errCode = body?.error?.code;
      } catch {
        /* ignore body parse errors */
      }
      console.error("Meta connection verification failed:", {
        status: response.status,
        errorCode: errCode,
      });
      return false;
    }
    
    return true;
  } catch (error) {
    console.error("Meta connection verification error:", error);
    return false;
  }
}

export async function validateMetaCredentials(credentials: MetaCredentials): Promise<{ valid: boolean; error?: string; phoneNumber?: string }> {
  try {
    const response = await fetch(
      `${getMetaGraphApiBase()}/${credentials.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating&access_token=${credentials.accessToken}`
    );

    if (!response.ok) {
      const error = await response.json();
      if (error.error?.code === 190) {
        return { valid: false, error: "Invalid or expired access token" };
      }
      if (error.error?.code === 100) {
        return { valid: false, error: "Invalid Phone Number ID" };
      }
      return { valid: false, error: error.error?.message || "Failed to validate credentials" };
    }

    const data = await response.json();
    return { 
      valid: true, 
      phoneNumber: data.display_phone_number 
    };
  } catch (error: any) {
    return { valid: false, error: error.message || "Failed to validate credentials" };
  }
}

export async function connectUserMeta(
  userId: string,
  credentials: MetaCredentials,
  extras?: MetaConnectExtras & { skipCredentialValidation?: boolean }
): Promise<{ success: boolean; error?: string; phoneNumber?: string }> {
  const validation =
    extras?.skipCredentialValidation === true
      ? { valid: true as const, phoneNumber: undefined as string | undefined }
      : await validateMetaCredentials(credentials);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const encryptedAccessToken = encryptCredential(credentials.accessToken);
  const encryptedAppSecret = credentials.appSecret ? encryptCredential(credentials.appSecret) : null;
  const globalVerify = process.env.META_WEBHOOK_VERIFY_TOKEN;
  const webhookVerifyToken =
    credentials.webhookVerifyToken ||
    (extras?.connectionType === "embedded_signup" ||
    extras?.connectionType === "embedded" ||
    extras?.connectionType === "coexistence"
      ? globalVerify || crypto.randomBytes(32).toString("hex")
      : crypto.randomBytes(32).toString("hex"));

  const now = new Date();
  console.log("[WHATSAPP SAVE] Saving integration", {
    userId,
    wabaId: credentials.businessAccountId,
    phoneNumberId: credentials.phoneNumberId,
    connectionType: extras?.connectionType ?? "manual_legacy",
    skipCredentialValidation: !!extras?.skipCredentialValidation,
  });
  await storage.updateUser(userId, {
    metaAccessToken: encryptedAccessToken,
    metaPhoneNumberId: credentials.phoneNumberId,
    metaBusinessAccountId: credentials.businessAccountId,
    metaAppSecret: encryptedAppSecret,
    metaWebhookVerifyToken: webhookVerifyToken,
    metaConnected: true,
    whatsappProvider: "meta",
    metaConnectionType: extras?.connectionType ?? "manual_legacy",
    metaDisplayPhoneNumber: extras?.displayPhoneNumber ?? validation.phoneNumber ?? null,
    metaVerifiedName: extras?.verifiedName ?? null,
    metaTokenExpiresAt: extras?.tokenExpiresAt ?? null,
    metaWebhookSubscribed: extras?.webhookSubscribed ?? false,
    metaWebhookLastCheckedAt: extras?.webhookSubscribed ? now : null,
    metaIntegrationStatus: extras?.metaIntegrationStatus ?? "connected",
    metaLastErrorCode: null,
    metaLastErrorMessage: null,
  });
  console.log("[WHATSAPP SAVE] Saved integration", {
    userId,
    wabaId: credentials.businessAccountId,
    phoneNumberId: credentials.phoneNumberId,
    metaConnected: true,
  });

  return { success: true, phoneNumber: validation.phoneNumber };
}

export async function disconnectUserMeta(userId: string): Promise<void> {
  const user = await storage.getUserForSession(userId);
  
  // Determine the provider after disconnect:
  // - If Twilio is connected, switch to it
  // - Otherwise, keep "twilio" as the default (but it won't be available)
  const newProvider = "twilio";
  
  await storage.updateUser(userId, {
    metaAccessToken: null,
    metaPhoneNumberId: null,
    metaBusinessAccountId: null,
    metaAppSecret: null,
    metaWebhookVerifyToken: null,
    metaConnected: false,
    whatsappProvider: newProvider,
    metaConnectionType: null,
    metaTokenExpiresAt: null,
    metaWebhookSubscribed: false,
    metaWebhookLastCheckedAt: null,
    metaIntegrationStatus: "disconnected",
    metaLastErrorCode: null,
    metaLastErrorMessage: null,
    metaDisplayPhoneNumber: null,
    metaVerifiedName: null,
  });
  
  // Update channel settings to reflect connection state
  // WhatsApp is "connected" only if Twilio is still connected after Meta disconnect
  try {
    await storage.upsertChannelSetting(userId, 'whatsapp', {
      isConnected: user?.twilioConnected || false,
    });
  } catch (error) {
    console.error('[disconnectUserMeta] Failed to update channel settings:', error);
  }
}

export async function switchProvider(userId: string, provider: "twilio" | "meta"): Promise<{ success: boolean; error?: string }> {
  const user = await storage.getUserForSession(userId);
  if (!user) {
    return { success: false, error: "User not found" };
  }

  if (provider === "twilio" && !user.twilioConnected) {
    return { success: false, error: "Twilio is not connected" };
  }

  if (provider === "meta" && !user.metaConnected) {
    return { success: false, error: "Meta WhatsApp Business API is not connected" };
  }

  await storage.updateUser(userId, { whatsappProvider: provider });
  return { success: true };
}

export async function sendMetaWhatsAppMessage(
  userId: string,
  toPhone: string,
  message: string
): Promise<{ messageId: string; status: string }> {
  const accessToken = await getMetaAccessToken(userId);
  const phoneNumberId = await getMetaPhoneNumberId(userId);

  if (!accessToken || !phoneNumberId) {
    throw new Error("Meta WhatsApp Business API not connected. Please connect your Meta account first.");
  }

  const normalizedPhone = toPhone.replace(/[^\d]/g, "");

  const response = await fetch(
    `${getMetaGraphApiBase()}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizedPhone,
        type: "text",
        text: {
          preview_url: true,
          body: message,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Failed to send message via Meta WhatsApp API");
  }

  const result = await response.json();
  return { 
    messageId: result.messages?.[0]?.id || "", 
    status: "sent" 
  };
}

export async function sendMetaWhatsAppMedia(
  userId: string,
  toPhone: string,
  mediaUrl: string,
  mediaType: "image" | "video" | "audio" | "document",
  caption?: string,
  filename?: string
): Promise<{ messageId: string; status: string }> {
  const accessToken = await getMetaAccessToken(userId);
  const phoneNumberId = await getMetaPhoneNumberId(userId);

  if (!accessToken || !phoneNumberId) {
    throw new Error("Meta WhatsApp Business API not connected. Please connect your Meta account first.");
  }

  const normalizedPhone = toPhone.replace(/[^\d]/g, "");

  const mediaPayload: any = {
    link: mediaUrl,
  };

  if (caption && (mediaType === "image" || mediaType === "video" || mediaType === "document")) {
    mediaPayload.caption = caption;
  }

  if (filename && mediaType === "document") {
    mediaPayload.filename = filename;
  }

  console.log(
    `[MetaWhatsApp] Sending media — to=${normalizedPhone} type=${mediaType}` +
    ` filename="${filename || "(none)"}" url=${mediaUrl}`
  );

  const response = await fetch(
    `${getMetaGraphApiBase()}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizedPhone,
        type: mediaType,
        [mediaType]: mediaPayload,
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.json();
    const errorMsg = errorBody.error?.message || "Failed to send media via Meta WhatsApp API";
    console.error(
      `[MetaWhatsApp] Media send failed — to=${normalizedPhone} type=${mediaType}` +
      ` httpStatus=${response.status} metaError="${errorMsg}"`
    );
    throw new Error(errorMsg);
  }

  const result = await response.json();
  const messageId = result.messages?.[0]?.id || "";
  console.log(
    `[MetaWhatsApp] Media sent OK — to=${normalizedPhone} type=${mediaType}` +
    ` messageId=${messageId}`
  );
  return { messageId, status: "sent" };
}

export async function sendMetaWhatsAppTemplate(
  userId: string,
  toPhone: string,
  templateName: string,
  languageCode: string = "en",
  components?: any[]
): Promise<{ messageId: string; status: string }> {
  const accessToken = await getMetaAccessToken(userId);
  const phoneNumberId = await getMetaPhoneNumberId(userId);

  if (!accessToken || !phoneNumberId) {
    throw new Error("Meta WhatsApp Business API not connected. Please connect your Meta account first.");
  }

  const normalizedPhone = toPhone.replace(/[^\d]/g, "");

  const templatePayload: any = {
    name: templateName,
    language: {
      code: languageCode,
    },
  };

  if (components && components.length > 0) {
    templatePayload.components = components;
  }

  const response = await fetch(
    `${getMetaGraphApiBase()}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizedPhone,
        type: "template",
        template: templatePayload,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Failed to send template via Meta WhatsApp API");
  }

  const result = await response.json();
  return { 
    messageId: result.messages?.[0]?.id || "", 
    status: "sent" 
  };
}

export async function sendMetaInteractiveMessage(
  userId: string,
  toPhone: string,
  interactiveType: "button" | "list" | "product" | "product_list",
  interactive: any
): Promise<{ messageId: string; status: string }> {
  const accessToken = await getMetaAccessToken(userId);
  const phoneNumberId = await getMetaPhoneNumberId(userId);

  if (!accessToken || !phoneNumberId) {
    throw new Error("Meta WhatsApp Business API not connected.");
  }

  const normalizedPhone = toPhone.replace(/[^\d]/g, "");

  const response = await fetch(
    `${getMetaGraphApiBase()}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizedPhone,
        type: "interactive",
        interactive: {
          type: interactiveType,
          ...interactive,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Failed to send interactive message");
  }

  const result = await response.json();
  return { 
    messageId: result.messages?.[0]?.id || "", 
    status: "sent" 
  };
}

export async function markMessageAsRead(
  userId: string,
  messageId: string
): Promise<boolean> {
  const accessToken = await getMetaAccessToken(userId);
  const phoneNumberId = await getMetaPhoneNumberId(userId);

  if (!accessToken || !phoneNumberId) {
    return false;
  }

  try {
    const response = await fetch(
      `${getMetaGraphApiBase()}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          status: "read",
          message_id: messageId,
        }),
      }
    );

    return response.ok;
  } catch {
    return false;
  }
}

export async function getMetaMessageTemplates(
  userId: string
): Promise<any[]> {
  const accessToken = await getMetaAccessToken(userId);
  const user = await storage.getUserForSession(userId);

  if (!accessToken || !user?.metaBusinessAccountId) {
    throw new Error("Meta WhatsApp Business API not connected.");
  }

  const response = await fetch(
    `${getMetaGraphApiBase()}/${user.metaBusinessAccountId}/message_templates?fields=id,name,status,language,category,components&limit=100&access_token=${accessToken}`
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Failed to fetch templates");
  }

  const result = await response.json();
  return result.data || [];
}

export interface MetaWebhookEntry {
  id: string;
  changes: Array<{
    value: {
      messaging_product: string;
      metadata: {
        display_phone_number: string;
        phone_number_id: string;
      };
      contacts?: Array<{
        profile: { name: string };
        wa_id: string;
      }>;
      messages?: Array<{
        from: string;
        id: string;
        timestamp: string;
        type: string;
        text?: { body: string };
        image?: { id: string; mime_type: string; sha256: string; caption?: string };
        video?: { id: string; mime_type: string; sha256: string; caption?: string };
        audio?: { id: string; mime_type: string; sha256: string };
        document?: { id: string; mime_type: string; sha256: string; filename?: string; caption?: string };
        location?: { latitude: number; longitude: number; name?: string; address?: string };
        contacts?: any[];
        interactive?: { type: string; button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string; description?: string } };
        button?: { text: string; payload: string };
      }>;
      statuses?: Array<{
        id: string;
        status: "sent" | "delivered" | "read" | "failed";
        timestamp: string;
        recipient_id: string;
        errors?: Array<{ code: number; title: string }>;
      }>;
    };
    field: string;
  }>;
}

export function parseMetaIncomingWebhook(body: any): {
  phoneNumberId: string;
  from: string;
  messageId: string;
  timestamp: string;
  type: string;
  text?: string;
  mediaId?: string;
  caption?: string;
  profileName?: string;
  interactive?: { type: string; id: string; title: string };
} | null {
  try {
    const entry = body.entry?.[0] as MetaWebhookEntry;
    const change = entry?.changes?.[0];
    const value = change?.value;
    
    if (!value?.messages?.[0]) {
      return null;
    }

    const message = value.messages[0];
    const contact = value.contacts?.[0];

    let text: string | undefined;
    let mediaId: string | undefined;
    let caption: string | undefined;
    let interactive: { type: string; id: string; title: string } | undefined;

    switch (message.type) {
      case "text":
        text = message.text?.body;
        break;
      case "image":
        mediaId = message.image?.id;
        caption = message.image?.caption;
        break;
      case "video":
        mediaId = message.video?.id;
        caption = message.video?.caption;
        break;
      case "audio":
        mediaId = message.audio?.id;
        break;
      case "document":
        mediaId = message.document?.id;
        caption = message.document?.caption;
        break;
      case "interactive":
        if (message.interactive?.button_reply) {
          interactive = {
            type: "button",
            id: message.interactive.button_reply.id,
            title: message.interactive.button_reply.title,
          };
          text = message.interactive.button_reply.title;
        } else if (message.interactive?.list_reply) {
          interactive = {
            type: "list",
            id: message.interactive.list_reply.id,
            title: message.interactive.list_reply.title,
          };
          text = message.interactive.list_reply.title;
        }
        break;
      case "button":
        text = message.button?.text;
        break;
    }

    return {
      phoneNumberId: value.metadata.phone_number_id,
      from: message.from,
      messageId: message.id,
      timestamp: message.timestamp,
      type: message.type,
      text,
      mediaId,
      caption,
      profileName: contact?.profile?.name || "",
      interactive,
    };
  } catch (error) {
    console.error("Error parsing Meta webhook:", error);
    return null;
  }
}

export function parseMetaStatusWebhook(body: any): {
  phoneNumberId: string;
  messageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipientId: string;
  errorCode?: number;
  errorTitle?: string;
} | null {
  try {
    const entry = body.entry?.[0] as MetaWebhookEntry;
    const change = entry?.changes?.[0];
    const value = change?.value;
    
    if (!value?.statuses?.[0]) {
      return null;
    }

    const status = value.statuses[0];

    return {
      phoneNumberId: value.metadata.phone_number_id,
      messageId: status.id,
      status: status.status,
      timestamp: status.timestamp,
      recipientId: status.recipient_id,
      errorCode: status.errors?.[0]?.code,
      errorTitle: status.errors?.[0]?.title,
    };
  } catch (error) {
    console.error("Error parsing Meta status webhook:", error);
    return null;
  }
}

export async function findUserByMetaPhoneNumberId(phoneNumberId: string): Promise<User | undefined> {
  const { db } = await import("../drizzle/db");
  const { users } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");

  const result = await db
    .select()
    .from(users)
    .where(eq(users.metaPhoneNumberId, phoneNumberId))
    .limit(2);

  if (result.length > 1) {
    console.warn(
      `[Meta WhatsApp] Multiple users share metaPhoneNumberId=${phoneNumberId}; using the first match. Assign unique phone number IDs per tenant.`
    );
  }

  return result[0];
}

export async function getMediaUrl(
  userId: string,
  mediaId: string
): Promise<string | null> {
  const accessToken = await getMetaAccessToken(userId);
  if (!accessToken) return null;

  try {
    const response = await fetch(
      `${getMetaGraphApiBase()}/${mediaId}?access_token=${accessToken}`
    );

    if (!response.ok) return null;

    const data = await response.json();
    return data.url || null;
  } catch {
    return null;
  }
}

export async function downloadMedia(
  userId: string,
  mediaUrl: string
): Promise<Buffer | null> {
  const accessToken = await getMetaAccessToken(userId);
  if (!accessToken) return null;

  try {
    const response = await fetch(mediaUrl, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

export function verifyMetaWebhookSignature(
  payload: string,
  signature: string,
  appSecret: string
): boolean {
  try {
    const expectedSignature = crypto
      .createHmac("sha256", appSecret)
      .update(payload)
      .digest("hex");
    
    const signatureHash = signature.replace("sha256=", "");
    
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signatureHash)
    );
  } catch {
    return false;
  }
}
