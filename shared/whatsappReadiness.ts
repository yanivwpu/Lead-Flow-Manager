/**
 * Single source of truth for Meta WhatsApp Cloud API readiness (embedded signup + inbox).
 */

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
  isTestNumber?: boolean;
}): boolean {
  if (input.isTestNumber) return true;
  const status = String(input.status ?? "").toUpperCase();
  const code = String(input.codeVerificationStatus ?? "").toUpperCase();
  if (status === "DISCONNECTED") return false;
  if (code === "NOT_VERIFIED") return false;
  return true;
}

export function evaluateMetaWhatsAppReadiness(
  user: MetaWhatsAppReadinessUser,
  opts?: {
    phoneGraphStatus?: string | null;
    phoneGraphCodeVerification?: string | null;
    isTestNumber?: boolean;
  },
): WhatsAppReadinessEvaluation {
  const activeProvider = (user.whatsappProvider as "meta" | "twilio" | undefined) || "twilio";
  const wabaSaved = isValidMetaWhatsAppGraphId(user.metaBusinessAccountId);
  const phoneSaved = isValidMetaWhatsAppGraphId(user.metaPhoneNumberId);
  const webhookSubscribed = !!user.metaWebhookSubscribed;
  const integrationStatus =
    user.metaIntegrationStatus || (user.metaConnected ? "connected" : "disconnected");

  const phoneStatusReady =
    integrationStatus === "connected" ||
    isMetaPhoneGraphRoutingReady({
      status: opts?.phoneGraphStatus,
      codeVerificationStatus: opts?.phoneGraphCodeVerification,
      isTestNumber: opts?.isTestNumber,
    });

  const inboxReady =
    activeProvider === "meta" &&
    !!user.metaConnected &&
    wabaSaved &&
    phoneSaved &&
    webhookSubscribed &&
    integrationStatus === "connected";

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
