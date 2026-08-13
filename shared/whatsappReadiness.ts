/**
 * Single source of truth for Meta WhatsApp Cloud API readiness (embedded signup + inbox).
 */

import { isMetaPhoneCloudApiOperational } from "./whatsappPhoneRegistration";

export type WhatsAppReadinessChecklist = {
  wabaSaved: boolean;
  phoneSaved: boolean;
  phoneStatusReady: boolean;
  webhookSubscribed: boolean;
  inboxReady: boolean;
};

export type WhatsAppReadinessEvaluation = WhatsAppReadinessChecklist & {
  /** Same gate as inbox send/receive — all checklist items required for Meta provider. */
  fullyReady: boolean;
  /** Meta credentials exist but not fully ready for messaging. */
  setupIncomplete: boolean;
};

export type MetaWhatsAppReadinessUser = {
  whatsappProvider?: string | null;
  metaConnected?: boolean | null;
  metaWebhookSubscribed?: boolean | null;
  metaIntegrationStatus?: string | null;
  metaPhoneNumberId?: string | null;
  metaBusinessAccountId?: string | null;
  metaConnectionType?: string | null;
  twilioConnected?: boolean | null;
};

export function isValidMetaWhatsAppGraphId(id: string | null | undefined): boolean {
  const s = (id ?? "").trim();
  return /^\d{8,}$/.test(s);
}

/** Conservative phone routing check — mirrors server post-connect Graph probe. */
export function isMetaPhoneGraphRoutingReady(input: {
  status?: string | null;
  codeVerificationStatus?: string | null;
  platformType?: string | null;
  isTestNumber?: boolean;
  coexistence?: boolean;
}): boolean {
  if (input.isTestNumber) return true;
  return isMetaPhoneCloudApiOperational(
    {
      status: input.status,
      codeVerificationStatus: input.codeVerificationStatus,
      platformType: input.platformType,
    },
    { coexistence: !!input.coexistence },
  );
}

export function evaluateMetaWhatsAppReadiness(
  user: MetaWhatsAppReadinessUser,
  opts?: {
    phoneGraphStatus?: string | null;
    phoneGraphCodeVerification?: string | null;
    phoneGraphPlatformType?: string | null;
    isTestNumber?: boolean;
    /** Override; defaults from user.metaConnectionType === "coexistence". */
    coexistence?: boolean;
  },
): WhatsAppReadinessEvaluation {
  const activeProvider = (user.whatsappProvider as "meta" | "twilio" | undefined) || "twilio";
  const coexistence =
    opts?.coexistence === true ||
    (opts?.coexistence !== false && user.metaConnectionType === "coexistence");
  const wabaSaved = isValidMetaWhatsAppGraphId(user.metaBusinessAccountId);
  const phoneSaved = isValidMetaWhatsAppGraphId(user.metaPhoneNumberId);
  const webhookSubscribed = !!user.metaWebhookSubscribed;
  const integrationStatus =
    user.metaIntegrationStatus || (user.metaConnected ? "connected" : "disconnected");

  const hasGraphHints =
    opts?.phoneGraphStatus != null ||
    opts?.phoneGraphCodeVerification != null ||
    opts?.phoneGraphPlatformType != null;

  const graphPhoneReady = isMetaPhoneGraphRoutingReady({
    status: opts?.phoneGraphStatus,
    codeVerificationStatus: opts?.phoneGraphCodeVerification,
    platformType: opts?.phoneGraphPlatformType,
    isTestNumber: opts?.isTestNumber,
    coexistence,
  });

  // With a Graph snapshot: require operational Cloud API state.
  // Without snapshot: only trust explicit "connected" integration status (never needs_phone_registration).
  const phoneStatusReady = hasGraphHints
    ? graphPhoneReady
    : integrationStatus === "connected";

  const inboxReady =
    activeProvider === "meta" &&
    !!user.metaConnected &&
    wabaSaved &&
    phoneSaved &&
    webhookSubscribed &&
    integrationStatus === "connected" &&
    phoneStatusReady;

  const fullyReady = inboxReady && phoneStatusReady;

  const setupIncomplete =
    activeProvider === "meta" &&
    !!user.metaConnected &&
    !fullyReady;

  return {
    wabaSaved,
    phoneSaved,
    phoneStatusReady,
    webhookSubscribed,
    inboxReady,
    fullyReady,
    setupIncomplete,
  };
}

/** Canonical Meta WhatsApp connected — inbox send/receive gate. */
export function isCanonicalMetaWhatsAppFullyConnected(user: MetaWhatsAppReadinessUser): boolean {
  const activeProvider = (user.whatsappProvider as "meta" | "twilio" | undefined) || "twilio";
  if (activeProvider !== "meta") return false;

  const integrationStatus =
    user.metaIntegrationStatus || (user.metaConnected ? "connected" : "disconnected");

  return (
    !!user.metaConnected &&
    isValidMetaWhatsAppGraphId(user.metaBusinessAccountId) &&
    isValidMetaWhatsAppGraphId(user.metaPhoneNumberId) &&
    !!user.metaWebhookSubscribed &&
    integrationStatus === "connected"
  );
}

export function isCanonicalTwilioWhatsAppConnected(
  user: Pick<MetaWhatsAppReadinessUser, "whatsappProvider" | "twilioConnected">,
): boolean {
  const activeProvider = (user.whatsappProvider as "meta" | "twilio" | undefined) || "twilio";
  return activeProvider === "twilio" && !!user.twilioConnected;
}

export function isCanonicalWhatsAppFullyConnectedFromUser(user: MetaWhatsAppReadinessUser): boolean {
  const activeProvider = (user.whatsappProvider as "meta" | "twilio" | undefined) || "twilio";
  if (activeProvider === "meta") return isCanonicalMetaWhatsAppFullyConnected(user);
  if (activeProvider === "twilio") return isCanonicalTwilioWhatsAppConnected(user);
  return false;
}
