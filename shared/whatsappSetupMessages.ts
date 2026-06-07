/**
 * WhatsApp setup / readiness copy for inbox banners and send errors.
 */

import type { WhatsAppReadinessChecklist } from "./whatsappReadiness";

export type WhatsAppActiveProvider = "meta" | "twilio" | "none";

export const WHATSAPP_SETUP_INCOMPLETE_TITLE = "WhatsApp setup incomplete";

/** Provider-neutral inbox banner (Meta is default; Twilio is legacy). */
export const WHATSAPP_SETUP_INCOMPLETE_SUBTITLE =
  "finish WhatsApp setup in Settings to send messages.";

export const WHATSAPP_SETUP_INCOMPLETE_BANNER = `${WHATSAPP_SETUP_INCOMPLETE_TITLE} — ${WHATSAPP_SETUP_INCOMPLETE_SUBTITLE}`;

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

/** First failing Meta readiness step — used by Settings health checklist, not inbox banner. */
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
  metaConnected?: boolean;
  readiness?: Partial<WhatsAppReadinessChecklist> | null;
};

/** Subtitle after "WhatsApp setup incomplete —" (provider-neutral). */
export function whatsappSetupIncompleteSubtitle(
  _opts?: WhatsAppSetupIncompleteMessageOpts,
): string {
  return WHATSAPP_SETUP_INCOMPLETE_SUBTITLE;
}

export function whatsappSetupIncompleteBannerText(
  _opts?: WhatsAppSetupIncompleteMessageOpts,
): string {
  return WHATSAPP_SETUP_INCOMPLETE_BANNER;
}

export function whatsappProviderNotReadyError(
  _opts?: WhatsAppSetupIncompleteMessageOpts,
): string {
  return WHATSAPP_SETUP_INCOMPLETE_BANNER;
}
