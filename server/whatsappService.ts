import type { User } from "@shared/schema";
import {
  resolveWhatsAppActiveProvider,
  whatsappSetupIncompleteBannerText,
  whatsappSetupIncompleteSubtitle,
  type WhatsAppActiveProvider,
} from "@shared/whatsappSetupMessages";
import {
  evaluateMetaWhatsAppReadiness,
  isCanonicalWhatsAppFullyConnectedFromUser,
  type WhatsAppReadinessChecklist,
  type WhatsAppReadinessEvaluation,
} from "@shared/whatsappReadiness";
import { storage } from "./storage";
import {
  buildMetaWhatsAppPhoneClassificationInput,
  classifyMetaWhatsAppPhone,
} from "./metaWhatsAppPhoneKind";
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

export type WhatsAppProvider = "meta" | "twilio" | "none";

// ─── Result types ────────────────────────────────────────────────────────────

export interface AvailabilityResult {
  available: boolean;
  provider: WhatsAppProvider;
  reason?: string;
  message?: string;
  /** Full line for banners: "WhatsApp setup incomplete — …" */
  bannerText?: string;
  /** Aligns with inbox gate — true only when send/receive is allowed. */
  fullyReady?: boolean;
  readiness?: WhatsAppReadinessChecklist;
  setupIncomplete?: boolean;
}

export type { WhatsAppReadinessChecklist, WhatsAppReadinessEvaluation };

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

/** Which backend currently satisfies WhatsApp for Settings + diagnostics (follows `whatsappProvider` + connection flags). */
export type WhatsappConnectedReason = "twilio" | "meta" | "none";

export interface ProviderStatus {
  activeProvider: WhatsAppProvider;
  whatsappConnectedReason: WhatsappConnectedReason;
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

/**
 * Derives the effective WhatsApp backend label for APIs/UI.
 * Uses saved `whatsapp_provider` plus the corresponding connection flag.
 */
export function deriveWhatsappConnectedReason(
  user: Pick<User, "whatsappProvider" | "metaConnected" | "twilioConnected">
): WhatsappConnectedReason {
  const active = resolveWhatsAppActiveProvider(user);
  if (active === "meta") return "meta";
  if (active === "twilio") return "twilio";
  return "none";
}

/** Fields needed to align inbox / channel-health with `/api/integrations/whatsapp/status`. */
export type CanonicalWhatsAppUser = Pick<
  User,
  | "whatsappProvider"
  | "metaConnected"
  | "metaWebhookSubscribed"
  | "metaIntegrationStatus"
  | "twilioConnected"
  | "metaPhoneNumberId"
  | "metaBusinessAccountId"
  | "metaDisplayPhoneNumber"
  | "metaVerifiedName"
>;

/**
 * Canonical WhatsApp “connected” for UI (Meta Cloud vs Twilio), independent of `channel_settings` rows.
 * @see shared/whatsappReadiness.ts
 */
export function isCanonicalWhatsAppFullyConnected(user: CanonicalWhatsAppUser): boolean {
  return isCanonicalWhatsAppFullyConnectedFromUser(user);
}

/** Readiness checklist for Settings / post-connect health UI. */
export function buildMetaWhatsAppReadinessForUser(
  user: CanonicalWhatsAppUser,
  phoneGraphSnapshot?: Record<string, unknown> | null,
): WhatsAppReadinessEvaluation {
  const inner =
    phoneGraphSnapshot?.data && typeof phoneGraphSnapshot.data === "object"
      ? (phoneGraphSnapshot.data as Record<string, unknown>)
      : phoneGraphSnapshot;
  const phoneKind = classifyMetaWhatsAppPhone(
    buildMetaWhatsAppPhoneClassificationInput(user, phoneGraphSnapshot),
  );
  return evaluateMetaWhatsAppReadiness(user, {
    phoneGraphStatus: inner?.status != null ? String(inner.status) : null,
    phoneGraphCodeVerification:
      inner?.code_verification_status != null ? String(inner.code_verification_status) : null,
    isTestNumber: phoneKind.kind === "test",
  });
}

export function logWhatsAppChannelState(payload: {
  userId: string;
  activeProvider: WhatsAppProvider;
  metaConnected: boolean;
  webhookSubscribed: boolean;
  legacyChannelConnected: boolean;
  finalConnected: boolean;
}): void {
  console.log(`[WhatsAppChannelState] ${JSON.stringify(payload)}`);
}

/**
 * Keeps `channel_settings` WhatsApp row in sync when Meta Cloud is canonically connected (fixes stale is_connected).
 */
export async function syncWhatsAppChannelRowFromCanonicalMeta(userId: string): Promise<void> {
  const user = await storage.getUserForSession(userId);
  if (!user) return;

  const activeProvider: WhatsAppActiveProvider = resolveWhatsAppActiveProvider(user);
  if (activeProvider !== "meta") return;
  if (!isCanonicalWhatsAppFullyConnected(user)) return;

  const existing = await storage.getChannelSetting(userId, "whatsapp");
  const prev =
    existing?.config && typeof existing.config === "object" && !Array.isArray(existing.config)
      ? (existing.config as Record<string, unknown>)
      : {};
  const nextConfig = {
    ...prev,
    provider: "meta",
    phoneNumberId: user.metaPhoneNumberId ?? null,
    businessAccountId: user.metaBusinessAccountId ?? null,
    displayPhoneNumber: user.metaDisplayPhoneNumber ?? null,
  };

  const cfg = existing?.config as Record<string, unknown> | undefined;
  const configMatches =
    cfg?.provider === "meta" &&
    String(cfg?.phoneNumberId ?? "") === String(nextConfig.phoneNumberId ?? "") &&
    String(cfg?.businessAccountId ?? "") === String(nextConfig.businessAccountId ?? "") &&
    String(cfg?.displayPhoneNumber ?? "") === String(nextConfig.displayPhoneNumber ?? "");

  if (existing?.isConnected && existing?.isEnabled && configMatches) {
    return;
  }

  await storage.upsertChannelSetting(userId, "whatsapp", {
    isConnected: true,
    isEnabled: true,
    config: nextConfig as any,
  });
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Single source of truth for whether WhatsApp is usable for a user right now.
 * Reads whatsappProvider preference and validates the corresponding connection flag.
 */
export async function getWhatsAppAvailability(userId: string): Promise<AvailabilityResult> {
  const user = await storage.getUserForSession(userId);
  if (!user) {
    return {
      available: false,
      provider: "none",
      reason: "User not found",
      message: "User not found",
    };
  }

  const activeProvider = resolveWhatsAppActiveProvider(user);

  if (activeProvider === "none") {
    const messageOpts = { activeProvider: "none" as const };
    const message = whatsappSetupIncompleteSubtitle(messageOpts);
    return {
      available: false,
      provider: "none",
      reason: "no_whatsapp_provider",
      message,
      bannerText: whatsappSetupIncompleteBannerText(messageOpts),
    };
  }

  if (activeProvider === "meta") {
    const oauthDbg =
      user.metaLastOAuthDebug && typeof user.metaLastOAuthDebug === "object"
        ? (user.metaLastOAuthDebug as Record<string, unknown>)
        : null;
    const phoneGraphSnapshot =
      oauthDbg?.phoneGraphSnapshot && typeof oauthDbg.phoneGraphSnapshot === "object"
        ? (oauthDbg.phoneGraphSnapshot as Record<string, unknown>)
        : null;
    const readiness = buildMetaWhatsAppReadinessForUser(user, phoneGraphSnapshot);
    const ok = readiness.fullyReady;
    const readinessChecklist: WhatsAppReadinessChecklist = {
      wabaSaved: readiness.wabaSaved,
      phoneSaved: readiness.phoneSaved,
      phoneStatusReady: readiness.phoneStatusReady,
      webhookSubscribed: readiness.webhookSubscribed,
      inboxReady: readiness.inboxReady,
    };
    const messageOpts = {
      activeProvider: "meta" as const,
      metaConnected: !!user.metaConnected,
      readiness: readinessChecklist,
    };
    return {
      available: ok,
      provider: "meta",
      fullyReady: ok,
      readiness: readinessChecklist,
      setupIncomplete: readiness.setupIncomplete,
      reason: ok ? undefined : "whatsapp_setup_incomplete",
      message: ok ? undefined : whatsappSetupIncompleteSubtitle(messageOpts),
      bannerText: ok ? undefined : whatsappSetupIncompleteBannerText(messageOpts),
    };
  }

  const isConnected = !!user.twilioConnected;
  const messageOpts = { activeProvider: "twilio" as const };
  return {
    available: isConnected,
    provider: "twilio",
    fullyReady: isConnected,
    reason: isConnected ? undefined : "twilio_not_connected",
    message: isConnected ? undefined : whatsappSetupIncompleteSubtitle(messageOpts),
    bannerText: isConnected ? undefined : whatsappSetupIncompleteBannerText(messageOpts),
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
      error: availability.bannerText || availability.message || availability.reason,
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
      error: availability.bannerText || availability.message || availability.reason,
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
 *
 * Must load the full user row via {@link storage.getUserForSession}. Plain {@link storage.getUser}
 * returns auth-core columns only; using it here incorrectly defaults `activeProvider` to Twilio and
 * hides Meta (`meta_connected`, WABA IDs), which breaks inbox routing and status APIs.
 */
export async function getProviderStatus(userId: string): Promise<ProviderStatus> {
  const user = await storage.getUserForSession(userId);
  if (!user) throw new Error("User not found");

  const webhookBaseUrl =
    process.env.APP_URL ||
    `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;

  return {
    activeProvider: (user.whatsappProvider as WhatsAppProvider) || "twilio",
    whatsappConnectedReason: deriveWhatsappConnectedReason(user),
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

/**
 * Whether WhatsApp is connected for this user — aligned with GET /api/activation-status `whatsappConnected`
 * (canonical Meta/Twilio flags plus synced channel_settings row).
 */
export async function isUserWhatsAppConnectedForActivation(userId: string): Promise<boolean> {
  await syncWhatsAppChannelRowFromCanonicalMeta(userId);
  const user = await storage.getUserForSession(userId);
  const settings = await storage.getChannelSettings(userId);
  const legacyAfterSync = settings.some((s) => s.channel === "whatsapp" && !!s.isConnected);
  const canonicalWa = user ? isCanonicalWhatsAppFullyConnected(user) : false;
  return canonicalWa || legacyAfterSync;
}
