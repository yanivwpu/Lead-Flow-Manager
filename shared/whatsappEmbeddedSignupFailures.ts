/**
 * Safe failure categories + user-facing copy keys for WhatsApp Embedded Signup.
 * Never includes raw Meta payloads, tokens, codes, PINs, config IDs, or stack traces.
 */

export const EMBEDDED_SIGNUP_FAILURE_CATEGORIES = [
  "dialog_cancelled",
  "oauth_state_expired",
  "code_exchange_failed",
  "session_assets_missing",
  "waba_validation_failed",
  "phone_waba_mismatch",
  "phone_workspace_conflict",
  "webhook_subscription_failed",
  "phone_registration_required",
  "meta_temporary_unavailable",
  "completion_in_progress",
  "architecture_mismatch",
  "phone_setup_incomplete",
  "sdk_launch_failed",
  "unknown",
] as const;

export type EmbeddedSignupFailureCategory =
  (typeof EMBEDDED_SIGNUP_FAILURE_CATEGORIES)[number];

/** Map server errorCode / internal labels → public failure category. */
export function mapEmbeddedSignupFailureCategory(
  errorCode: string | null | undefined,
): EmbeddedSignupFailureCategory {
  const code = String(errorCode || "").trim();
  switch (code) {
    case "dialog_cancelled":
    case "cancelled":
    case "CANCEL":
      return "dialog_cancelled";
    case "oauth_state_expired":
    case "oauth_state_expired_or_invalid":
      return "oauth_state_expired";
    case "code_exchange_failed":
    case "long_lived_exchange_failed":
      return "code_exchange_failed";
    case "session_assets_missing":
      return "session_assets_missing";
    case "waba_discovery_missing_permission":
    case "waba_access_denied":
    case "discovery_failed":
    case "no_valid_waba_or_phone":
    case "phone_ambiguous":
      return "waba_validation_failed";
    case "phone_not_under_waba":
      return "phone_waba_mismatch";
    case "phone_workspace_conflict":
      return "phone_workspace_conflict";
    case "waba_subscription_failed":
      return "webhook_subscription_failed";
    case "phone_registration_required":
    case "needs_phone_registration":
      return "phone_registration_required";
    case "meta_temporary_unavailable":
    case "completion_in_progress":
      return code === "completion_in_progress"
        ? "completion_in_progress"
        : "meta_temporary_unavailable";
    case "architecture_mismatch":
      return "architecture_mismatch";
    case "phone_setup_incomplete":
      return "phone_setup_incomplete";
    case "sdk_launch_failed":
    case "popup_blocked":
    case "fb_sdk_unavailable":
      return "sdk_launch_failed";
    default:
      return "unknown";
  }
}

/** English fallback copy (also mirrored in locales EN/ES/HE). */
export const EMBEDDED_SIGNUP_FAILURE_COPY_EN: Record<
  EmbeddedSignupFailureCategory,
  { message: string; recovery: string }
> = {
  dialog_cancelled: {
    message: "WhatsApp setup was cancelled. You can try again anytime.",
    recovery: "Click Connect WhatsApp when you are ready.",
  },
  oauth_state_expired: {
    message:
      "This signup session expired before Meta finished. Close any Facebook windows and start again from Settings.",
    recovery: "Start a fresh Connect WhatsApp session — do not reuse an old browser tab.",
  },
  code_exchange_failed: {
    message: "We could not complete authorization with Meta. Please try again.",
    recovery: "Close Meta windows, then try Connect WhatsApp again.",
  },
  session_assets_missing: {
    message:
      "Meta did not return the WhatsApp account details needed to finish setup.",
    recovery: "Try Connect WhatsApp again and complete every step in the Meta dialog.",
  },
  waba_validation_failed: {
    message: "We could not validate your WhatsApp Business Account with Meta.",
    recovery: "Confirm the account in Meta Business Manager, then try again.",
  },
  phone_waba_mismatch: {
    message: "The selected phone number does not belong to this WhatsApp Business Account.",
    recovery: "Reconnect and choose a phone number that belongs to the same account.",
  },
  phone_workspace_conflict: {
    message:
      "This WhatsApp number is already connected to another WhachatCRM account.",
    recovery: "Disconnect it from the other account, or use a different number.",
  },
  webhook_subscription_failed: {
    message: "WhatsApp was saved, but inbound message setup could not be verified yet.",
    recovery: "Use Check again in Settings, or try Connect WhatsApp again.",
  },
  phone_registration_required: {
    message: "Meta requires a six-digit PIN to finish activating this phone number.",
    recovery: "Enter and confirm your six-digit PIN to finish setup.",
  },
  meta_temporary_unavailable: {
    message: "Meta is temporarily unavailable. Please try again in a few minutes.",
    recovery: "Wait briefly, then try Connect WhatsApp again.",
  },
  completion_in_progress: {
    message: "WhatsApp setup is already finishing. Please wait a moment.",
    recovery: "Refresh Settings after a few seconds if the connection does not appear.",
  },
  architecture_mismatch: {
    message: "This connection session is out of date. Close the window and start again from Settings.",
    recovery: "Start a new Connect WhatsApp session from Settings.",
  },
  phone_setup_incomplete: {
    message:
      "Your WhatsApp account was created, but phone setup is incomplete in Meta.",
    recovery: "Finish the number in Meta Business Manager, then reconnect.",
  },
  sdk_launch_failed: {
    message:
      "We couldn't open the secure WhatsApp connection window. Please allow pop-ups and try again.",
    recovery: "Allow pop-ups for this site, then click Connect WhatsApp again.",
  },
  unknown: {
    message: "Could not finish WhatsApp setup. Please try Connect WhatsApp again.",
    recovery: "If this keeps happening, contact support from Settings.",
  },
};

export function resolveEmbeddedSignupFailureCopy(
  errorCode: string | null | undefined,
): {
  category: EmbeddedSignupFailureCategory;
  message: string;
  recovery: string;
  i18nKey: string;
} {
  const category = mapEmbeddedSignupFailureCategory(errorCode);
  const copy = EMBEDDED_SIGNUP_FAILURE_COPY_EN[category];
  return {
    category,
    message: copy.message,
    recovery: copy.recovery,
    i18nKey: `whatsappEmbeddedSignup.errors.${category}`,
  };
}

/** True when a message looks like Graph/env/stack detail that must not reach customers. */
export function looksLikeTechnicalWhatsappCustomerError(message: string): boolean {
  const msg = String(message || "");
  return /is not defined|ReferenceError|TypeError|Cannot read propert|Cannot access|Unexpected token|Internal Server Error|access_token|app_secret|verify_token|client_secret|EAA[A-Za-z0-9]|META_[A-Z0-9_]+|config_id|FINISH_WHATSAPP|\/me\/businesses|\/phone_numbers|\/register\b|subscribed_apps|config isolation|architecture v[24]|Graph endpoint|stack trace|\bWABA\b|featureType|sessionInfoVersion|GET \.\.\.\/phone_numbers/i.test(
    msg,
  );
}

/** Strip Graph/env/stack detail from customer-visible WhatsApp errors. */
export function sanitizeWhatsappCustomerFacingError(
  message: string,
  fallback = EMBEDDED_SIGNUP_FAILURE_COPY_EN.unknown.message,
): string {
  const trimmed = String(message || "").trim();
  if (!trimmed) return fallback;
  if (looksLikeTechnicalWhatsappCustomerError(trimmed)) return fallback;
  return trimmed;
}
