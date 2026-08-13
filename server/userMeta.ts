import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { users } from "@shared/schema";
import { storage } from "./storage";
import type { User, Chat } from "@shared/schema";
import { getMetaGraphApiBase } from "./metaGraphVersion";
import { resolvePersistedMetaConnectionType } from "../shared/whatsappConnectionType";

export {
  isMetaCredentialEncryptionConfigured,
  resolveMetaCredentialEncryptionSource,
  validateMetaEncryptionKey,
} from "@shared/metaCredentialEncryption";

export {
  encryptCredential,
  decryptCredential,
  isEncrypted,
  MetaCredentialEncryptionConfigError,
  migrateMetaCredentialEncryption,
  encryptMetaCredentialWithLegacyFallbackForTests,
  encryptMetaCredentialUnversionedForTests,
  decryptMetaCredentialOrNull,
  migrateMetaCiphertextFieldForTests,
  listUnversionedMetaDecryptPassphrases,
  logMetaCredentialEncryptionBootDiag,
} from "./metaCredentialCrypto";
import {
  encryptCredential,
  decryptCredential,
  isEncrypted,
  MetaCredentialEncryptionConfigError,
} from "./metaCredentialCrypto";

export interface WhatsAppMessage {
  id: string;
  text: string;
  time: string;
  sent: boolean;
  sender?: "me" | "them";
  status?: "sent" | "delivered" | "read" | "failed";
  metaMessageId?: string;
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
  /**
   * When true, allow changing metaConnectionType away from coexistence
   * (authoritative OAuth completion only). Default false preserves coexistence.
   */
  allowArchitectureChange?: boolean;
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

/** Best-effort Graph snapshot for diagnostics (coexistence / routing). Retries with fewer fields if Meta rejects unknown fields. */
export async function fetchMetaWhatsAppPhoneNumberGraphSnapshot(
  accessToken: string,
  phoneNumberId: string
): Promise<{
  ok: boolean;
  fieldsRequested: string;
  data?: Record<string, unknown>;
  httpStatus?: number;
  error?: { message?: string; code?: number };
}> {
  const base = getMetaGraphApiBase();
  const fieldSets = [
    "id,display_phone_number,verified_name,quality_rating,code_verification_status,status,platform_type,account_mode,messaging_limit_tier,name_status,throughput",
    "id,display_phone_number,verified_name,quality_rating,code_verification_status,messaging_limit_tier,name_status,throughput",
    "id,display_phone_number,verified_name,quality_rating,code_verification_status",
    "id,display_phone_number,verified_name,quality_rating",
  ];
  for (const fields of fieldSets) {
    try {
      const url = `${base}/${encodeURIComponent(phoneNumberId)}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(accessToken)}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const json = (await response.json().catch(() => ({}))) as {
        error?: { message?: string; code?: number };
      } & Record<string, unknown>;
      if (response.ok && json && !json.error) {
        const { error: _e, ...rest } = json;
        return { ok: true, fieldsRequested: fields, data: rest as Record<string, unknown>, httpStatus: response.status };
      }
      const errObj = json?.error;
      if (errObj && fieldSets.indexOf(fields) < fieldSets.length - 1) {
        continue;
      }
      return {
        ok: false,
        fieldsRequested: fields,
        httpStatus: response.status,
        error: errObj ? { message: errObj.message, code: errObj.code } : { message: "Unknown Graph error" },
      };
    } catch (e: any) {
      if (fieldSets.indexOf(fields) < fieldSets.length - 1) continue;
      return {
        ok: false,
        fieldsRequested: fields,
        error: { message: e?.message || "fetch_failed" },
      };
    }
  }
  return { ok: false, fieldsRequested: fieldSets[0]!, error: { message: "exhausted_field_retries" } };
}

/**
 * Verbose WhatsApp phone Graph snapshot for coexistence diagnostics.
 * Requests a broad set of safe fields and progressively falls back if Graph rejects unknown fields.
 * Never logs or returns tokens.
 */
export async function fetchMetaWhatsAppPhoneNumberGraphSnapshotVerbose(
  accessToken: string,
  phoneNumberId: string
): Promise<{
  ok: boolean;
  fieldsRequested: string;
  data?: Record<string, unknown>;
  httpStatus?: number;
  error?: { message?: string; code?: number };
}> {
  const base = getMetaGraphApiBase();
  const fieldSets = [
    // “Try everything” set (some may be rejected depending on Graph version / permissions)
    "id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status,throughput,messaging_limit_tier,status,platform_type,account_mode,certificate,webhook_configuration,whatsapp_business_account{id}",
    // Remove most exotic fields
    "id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status,throughput,messaging_limit_tier,status,platform_type,account_mode,whatsapp_business_account{id}",
    // Minimal extended
    "id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status,throughput,messaging_limit_tier,status",
    // Fall back to the existing stable set
    "id,display_phone_number,verified_name,quality_rating,code_verification_status,messaging_limit_tier,name_status,throughput",
    "id,display_phone_number,verified_name,quality_rating,code_verification_status",
    "id,display_phone_number,verified_name,quality_rating",
  ];

  for (const fields of fieldSets) {
    try {
      const url = `${base}/${encodeURIComponent(phoneNumberId)}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(accessToken)}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const json = (await response.json().catch(() => ({}))) as {
        error?: { message?: string; code?: number };
      } & Record<string, unknown>;

      if (response.ok && json && !json.error) {
        const { error: _e, ...rest } = json;
        return {
          ok: true,
          fieldsRequested: fields,
          data: rest as Record<string, unknown>,
          httpStatus: response.status,
        };
      }

      const errObj = json?.error;
      // When Graph rejects a field set, try the next smaller set.
      if (errObj && fieldSets.indexOf(fields) < fieldSets.length - 1) {
        continue;
      }

      return {
        ok: false,
        fieldsRequested: fields,
        httpStatus: response.status,
        error: errObj ? { message: errObj.message, code: errObj.code } : { message: "Unknown Graph error" },
      };
    } catch (e: any) {
      if (fieldSets.indexOf(fields) < fieldSets.length - 1) continue;
      return {
        ok: false,
        fieldsRequested: fields,
        error: { message: e?.message || "fetch_failed" },
      };
    }
  }

  return { ok: false, fieldsRequested: fieldSets[0]!, error: { message: "exhausted_field_retries" } };
}

/**
 * Best-effort: read parent WABA id for a WhatsApp Cloud API phone number id (coexistence / fallback).
 */
export async function fetchWhatsAppPhoneNumberParentWabaId(
  accessToken: string,
  phoneNumberId: string
): Promise<{ ok: true; wabaId: string } | { ok: false; reason: string }> {
  const base = getMetaGraphApiBase();
  const fieldAttempts = ["id,whatsapp_business_account{id}", "whatsapp_business_account{id}"];
  for (const fields of fieldAttempts) {
    try {
      const url = `${base}/${encodeURIComponent(phoneNumberId)}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(accessToken)}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const json = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
        whatsapp_business_account?: { id?: string };
      };
      if (!response.ok || json.error) continue;
      const waba = json.whatsapp_business_account;
      const id = waba && typeof waba === "object" && waba.id != null ? String(waba.id).trim() : "";
      if (id) return { ok: true, wabaId: id };
    } catch {
      /* try next */
    }
  }
  return { ok: false, reason: "parent_waba_not_in_graph_response" };
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

/** Customer-facing copy when a Meta phone number ID is already bound elsewhere. */
export const META_PHONE_NUMBER_WORKSPACE_CONFLICT_MESSAGE =
  "This WhatsApp number is already connected to another WhachatCRM account. Disconnect it there first, or choose a different number.";

/** Postgres unique_violation on users.meta_phone_number_id (race after app-level check). */
export function isMetaPhoneNumberUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; constraint?: string; detail?: string; message?: string } | null;
  if (!e || e.code !== "23505") return false;
  const hay = `${e.constraint || ""} ${e.detail || ""} ${e.message || ""}`;
  return /meta_phone_number_id|users_meta_phone_number_id_uidx/i.test(hay);
}

export async function connectUserMeta(
  userId: string,
  credentials: MetaCredentials,
  extras?: MetaConnectExtras & { skipCredentialValidation?: boolean }
): Promise<{ success: boolean; error?: string; phoneNumber?: string; errorCode?: string }> {
  const conflict = await findMetaPhoneNumberConflict(credentials.phoneNumberId, userId);
  if (conflict) {
    return {
      success: false,
      error: META_PHONE_NUMBER_WORKSPACE_CONFLICT_MESSAGE,
      errorCode: "phone_workspace_conflict",
    };
  }

  const validation =
    extras?.skipCredentialValidation === true
      ? { valid: true as const, phoneNumber: undefined as string | undefined }
      : await validateMetaCredentials(credentials);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  let encryptedAccessToken: string;
  let encryptedAppSecret: string | null;
  try {
    encryptedAccessToken = encryptCredential(credentials.accessToken);
    encryptedAppSecret = credentials.appSecret ? encryptCredential(credentials.appSecret) : null;
  } catch (err) {
    if (err instanceof MetaCredentialEncryptionConfigError) {
      return { success: false, error: err.message };
    }
    throw err;
  }
  const existing = await storage.getUserForSession(userId);
  const requestedType = extras?.connectionType ?? "manual_legacy";
  const persistedConnectionType = resolvePersistedMetaConnectionType({
    previousType: existing?.metaConnectionType,
    requestedType,
    allowArchitectureChange: extras?.allowArchitectureChange === true,
  });
  const globalVerify = process.env.META_WEBHOOK_VERIFY_TOKEN;
  const webhookVerifyToken =
    credentials.webhookVerifyToken ||
    (persistedConnectionType === "embedded_signup" ||
    persistedConnectionType === "embedded" ||
    persistedConnectionType === "coexistence"
      ? globalVerify || crypto.randomBytes(32).toString("hex")
      : crypto.randomBytes(32).toString("hex"));

  const now = new Date();
  console.log("[WHATSAPP SAVE] Saving integration", {
    userId,
    wabaId: credentials.businessAccountId,
    phoneNumberId: credentials.phoneNumberId,
    connectionType: persistedConnectionType,
    requestedConnectionType: requestedType,
    previousConnectionType: existing?.metaConnectionType ?? null,
    skipCredentialValidation: !!extras?.skipCredentialValidation,
  });
  try {
    await storage.updateUser(userId, {
      metaAccessToken: encryptedAccessToken,
      metaPhoneNumberId: credentials.phoneNumberId,
      metaBusinessAccountId: credentials.businessAccountId,
      metaAppSecret: encryptedAppSecret,
      metaWebhookVerifyToken: webhookVerifyToken,
      metaConnected: true,
      whatsappProvider: "meta",
      metaConnectionType: persistedConnectionType,
      metaDisplayPhoneNumber: extras?.displayPhoneNumber ?? validation.phoneNumber ?? null,
      metaVerifiedName: extras?.verifiedName ?? null,
      metaTokenExpiresAt: extras?.tokenExpiresAt ?? null,
      metaWebhookSubscribed: extras?.webhookSubscribed ?? false,
      metaWebhookLastCheckedAt: extras?.webhookSubscribed ? now : null,
      metaIntegrationStatus: extras?.metaIntegrationStatus ?? "connected",
      metaLastErrorCode: null,
      metaLastErrorMessage: null,
    });
  } catch (err) {
    if (isMetaPhoneNumberUniqueViolation(err)) {
      console.warn("[WHATSAPP SAVE] phone_workspace_conflict unique race", {
        userIdTail: String(userId).slice(-6),
        phoneNumberIdTail: String(credentials.phoneNumberId || "").slice(-6),
      });
      return {
        success: false,
        error: META_PHONE_NUMBER_WORKSPACE_CONFLICT_MESSAGE,
        errorCode: "phone_workspace_conflict",
      };
    }
    throw err;
  }
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

  // WhachatCRM-only disconnect: clears local Meta credentials and routing flags.
  // Does NOT call Meta Graph deregister/delete APIs — WhatsApp Business App
  // (including Coexistence) remains intact on the customer's phone.

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

function classifyGraphFetchFailure(err: unknown): "timeout" | "dns" | "connection" | "unknown_network" {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  const m = msg.toLowerCase();
  if (m.includes("abort") || m.includes("timeout")) return "timeout";
  if (m.includes("enotfound") || m.includes("getaddrinfo")) return "dns";
  if (m.includes("econnrefused") || m.includes("econnreset") || m.includes("fetch failed")) {
    return "connection";
  }
  return "unknown_network";
}

export async function sendMetaWhatsAppTemplate(
  userId: string,
  toPhone: string,
  templateName: string,
  languageCode: string = "en",
  components?: any[]
): Promise<{ messageId: string; status: string; httpStatus: number }> {
  const accessToken = await getMetaAccessToken(userId);
  const phoneNumberId = await getMetaPhoneNumberId(userId);

  if (!accessToken || !phoneNumberId) {
    const err = new Error(
      "Meta WhatsApp is not fully connected: missing access token or phone number ID. Open Settings and reconnect WhatsApp (Meta)."
    ) as Error & {
      httpStatus?: number;
      metaErrorCode?: number;
      metaErrorType?: string;
      fetchFailureKind?: string;
    };
    err.httpStatus = 0;
    err.fetchFailureKind = "missing_token_or_phone_number_id";
    console.warn(
      `[WA_TEMPLATE_SEND_FAILED] ${JSON.stringify({
        phase: "missing_credentials",
        templateName,
        language: languageCode,
        hasToken: !!accessToken,
        hasPhoneNumberId: !!phoneNumberId,
      })}`
    );
    throw err;
  }

  const normalizedPhone = toPhone.replace(/[^\d]/g, "");
  const recipientLog =
    normalizedPhone.length > 4 ? `***${normalizedPhone.slice(-4)}` : normalizedPhone ? "(short)" : "(none)";

  const templatePayload: any = {
    name: templateName,
    language: {
      code: languageCode,
    },
  };

  if (components && components.length > 0) {
    templatePayload.components = components;
  }

  const graphPath = `${getMetaGraphApiBase()}/${phoneNumberId}/messages`;
  console.log(
    `[WA_TEMPLATE_SEND_REQUEST] ${JSON.stringify({
      templateName,
      language: languageCode,
      phoneNumberId,
      recipient: recipientLog,
      componentCount: Array.isArray(components) ? components.length : 0,
      graphPathHost: (() => {
        try {
          return new URL(graphPath).hostname;
        } catch {
          return "unknown";
        }
      })(),
    })}`
  );

  let response: Response;
  try {
    response = await fetch(graphPath, {
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
    });
  } catch (fetchErr: unknown) {
    const kind = classifyGraphFetchFailure(fetchErr);
    const detail = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    const err = new Error(
      kind === "timeout"
        ? "Network timeout while calling WhatsApp (Meta). Try again."
        : kind === "dns"
          ? "Could not resolve Meta’s servers (DNS). Check network or VPN."
          : kind === "connection"
            ? "Could not connect to WhatsApp (Meta). Check firewall, proxy, or try again."
            : "Network error while calling WhatsApp (Meta). Try again."
    ) as Error & {
      httpStatus?: number;
      metaErrorCode?: number;
      metaErrorType?: string;
      fetchFailureKind?: string;
    };
    err.httpStatus = 0;
    err.fetchFailureKind = kind;
    console.error(
      `[WA_TEMPLATE_SEND_FAILED] ${JSON.stringify({
        phase: "graph_fetch_threw",
        templateName,
        language: languageCode,
        phoneNumberId,
        recipient: recipientLog,
        fetchFailureKind: kind,
        friendlyError: err.message,
        detail: detail.slice(0, 280),
      })}`,
      fetchErr
    );
    throw err;
  }

  const httpStatus = response.status;

  if (!response.ok) {
    let body: { error?: { message?: string; code?: number; type?: string; error_subcode?: number } } = {};
    try {
      body = (await response.json()) as typeof body;
    } catch {
      /* ignore */
    }
    const msg = body.error?.message || "Failed to send template via Meta WhatsApp API";
    const err = new Error(msg) as Error & {
      httpStatus?: number;
      metaErrorCode?: number;
      metaErrorType?: string;
    };
    err.httpStatus = httpStatus;
    err.metaErrorCode = body.error?.code;
    err.metaErrorType = body.error?.type;
    console.error(
      `[WA_TEMPLATE_SEND_FAILED] ${JSON.stringify({
        phase: "graph_http_error",
        templateName,
        language: languageCode,
        phoneNumberId,
        recipient: recipientLog,
        responseStatus: httpStatus,
        metaMessage: msg,
        metaCode: body.error?.code,
        metaType: body.error?.type,
        metaSubcode: body.error?.error_subcode,
      })}`
    );
    throw err;
  }

  const result = await response.json();
  const messageId = result.messages?.[0]?.id || "";
  console.log(
    `[WA_TEMPLATE_SEND_SUCCESS] ${JSON.stringify({
      templateName,
      language: languageCode,
      phoneNumberId,
      recipient: recipientLog,
      responseStatus: httpStatus,
      messageId,
    })}`
  );
  return {
    messageId,
    status: "sent",
    httpStatus,
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
        sticker?: { id: string; mime_type?: string; sha256?: string };
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
      case "sticker":
        mediaId = message.sticker?.id;
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
  /** Meta `errors[0].message` when present */
  errorDetail?: string;
} | null {
  try {
    const entry = body.entry?.[0] as MetaWebhookEntry;
    const change = entry?.changes?.[0];
    const value = change?.value;
    
    if (!value?.statuses?.[0]) {
      return null;
    }

    const status = value.statuses[0];
    const err0 = status.errors?.[0] as { code?: number; title?: string; message?: string } | undefined;

    return {
      phoneNumberId: value.metadata.phone_number_id,
      messageId: status.id,
      status: status.status,
      timestamp: status.timestamp,
      recipientId: status.recipient_id,
      errorCode: err0?.code,
      errorTitle: err0?.title,
      errorDetail: typeof err0?.message === "string" && err0.message.trim() ? err0.message.trim() : undefined,
    };
  } catch (error) {
    console.error("Error parsing Meta status webhook:", error);
    return null;
  }
}

/**
 * Resolve inbound webhook workspace by Meta phone number ID.
 * Fail closed on duplicate/corrupt ownership — never pick an arbitrary first row.
 */
export async function findUserByMetaPhoneNumberId(phoneNumberId: string): Promise<User | undefined> {
  const id = String(phoneNumberId || "").trim();
  if (!id) return undefined;

  const result = await db
    .select()
    .from(users)
    .where(eq(users.metaPhoneNumberId, id))
    .limit(2);

  if (result.length > 1) {
    console.error(
      `[Meta WhatsApp] CRITICAL inbound routing blocked: duplicate meta_phone_number_id ownership`,
      {
        phoneNumberIdLast6: id.slice(-6),
        ownerCount: result.length,
        userIdTails: result.map((u) => String(u.id).slice(-6)),
      },
    );
    return undefined;
  }

  return result[0];
}

/** Returns another workspace already using this Cloud API phone number id (if any). */
export async function findMetaPhoneNumberConflict(
  phoneNumberId: string,
  excludeUserId: string,
): Promise<User | undefined> {
  const id = phoneNumberId.trim();
  if (!id) return undefined;
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.metaPhoneNumberId, id))
    .limit(5);
  return rows.find((u) => u.id !== excludeUserId);
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

export function computeMetaWebhookSignature(
  payload: Buffer | string,
  appSecret: string
): string {
  return crypto
    .createHmac("sha256", appSecret)
    .update(payload)
    .digest("hex");
}

export function verifyMetaWebhookSignature(
  payload: Buffer | string,
  signature: string,
  appSecret: string
): boolean {
  try {
    const expectedSignature = computeMetaWebhookSignature(payload, appSecret);
    const signatureHash = signature.replace("sha256=", "");

    if (expectedSignature.length !== signatureHash.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signatureHash)
    );
  } catch {
    return false;
  }
}
