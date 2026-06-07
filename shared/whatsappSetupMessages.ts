/**
 * Provider-aware WhatsApp setup / readiness copy for inbox, composer banners, and template send errors.
 */

import type { WhatsAppReadinessChecklist } from "./whatsappReadiness";

export type WhatsAppActiveProvider = "meta" | "twilio" | "none";

export const WHATSAPP_SETUP_INCOMPLETE_TITLE = "WhatsApp setup incomplete";

export function resolveWhatsAppActiveProvider(user: {
  whatsappProvider?: string | null;
  metaConnected?: boolean | null;
  twilioConnected?: boolean | null;
}): WhatsAppActiveProvider {
  const pref = String(user.whatsappProvider || "")
    .trim()
    .toLowerCase();
  if (pref === "meta") return "meta";
  if (pref === "twilio") return "twilio";
  if (user.metaConnected) return "meta";
  if (user.twilioConnected) return "twilio";
  return "none";
}

/** First failing Meta readiness step, when connected but not fully ready. */
export function metaWhatsAppReadinessBlockerMessage(
  readiness: Partial<WhatsAppReadinessChecklist> | null | undefined,
): string | null {
  if (!readiness) return null;
  if (!readiness.wabaSaved) return "WhatsApp Business Account (WABA) is missing.";
  if (!readiness.phoneSaved) return "WhatsApp phone number is missing.";
  if (!readiness.phoneStatusReady) return "WhatsApp phone number is not ready in Meta.";
  if (!readiness.webhookSubscribed) return "WhatsApp webhook is not subscribed.";
  if (!readiness.inboxReady) return "WhatsApp inbox is not ready to send and receive.";
  return null;
}

export type WhatsAppSetupIncompleteMessageOpts = {
  activeProvider: WhatsAppActiveProvider;
  /** Meta OAuth / embedded signup completed but checklist may be incomplete. */
  metaConnected?: boolean;
  readiness?: Partial<WhatsAppReadinessChecklist> | null;
};

/**
 * Subtitle shown after the title (or after "WhatsApp setup incomplete —").
 * Does not include the title prefix.
 */
export function whatsappSetupIncompleteSubtitle(
  opts: WhatsAppSetupIncompleteMessageOpts,
): string {
  if (opts.activeProvider === "none") {
    return "connect WhatsApp in Settings to send messages.";
  }
  if (opts.activeProvider === "twilio") {
    return "finish Twilio connection in Settings to send messages.";
  }
  if (!opts.metaConnected) {
    return "finish Meta connection in Settings to send messages.";
  }
  const blocker = metaWhatsAppReadinessBlockerMessage(opts.readiness);
  if (blocker) {
    return `${blocker} Finish setup in Settings to send messages.`;
  }
  return "finish Meta connection in Settings to send messages.";
}

/** Full banner line: "WhatsApp setup incomplete — …" */
export function whatsappSetupIncompleteBannerText(
  opts: WhatsAppSetupIncompleteMessageOpts,
): string {
  return `${WHATSAPP_SETUP_INCOMPLETE_TITLE} — ${whatsappSetupIncompleteSubtitle(opts)}`;
}

/** Template sync / send errors when WhatsApp is not ready. */
export function whatsappProviderNotReadyError(
  opts: WhatsAppSetupIncompleteMessageOpts,
): string {
  return whatsappSetupIncompleteBannerText(opts);
}
