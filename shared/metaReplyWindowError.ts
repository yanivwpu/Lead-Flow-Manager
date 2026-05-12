import type { Channel } from "./schema";

/**
 * Meta / WhatsApp-style "outside 24-hour reply window" errors from API or stored `error_message`.
 * Shared by Unified Inbox UI and server persistence so failed bubbles stay consistent after refetch.
 */
export function isMetaReplyWindowExpiredError(message: string): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  if (m.includes("24-hour") || m.includes("24 hour")) return true;
  if (m.includes("window expired")) return true;
  if (m.includes("messaging window has expired")) return true;
  if (m.includes("outside") && m.includes("24") && m.includes("hour")) return true;
  if (m.includes("messenger policy")) return true;
  if (m.includes("policy") && m.includes("message") && (m.includes("window") || m.includes("24"))) return true;
  if (m.includes("customer service window") || m.includes("service window")) return true;
  if (m.includes("reply window") && m.includes("outside")) return true;
  return false;
}

/** True when copy clearly refers to WhatsApp template / CSW failures (may be mis-attached to non-WA channels). */
export function errorLooksLikeReplyWindowOrTemplateBlock(message: string): boolean {
  if (!message) return false;
  if (isMetaReplyWindowExpiredError(message)) return true;
  const m = message.toLowerCase();
  if (m.includes("whatsapptemplatename") || m.includes("whatsapp template")) return true;
  if (m.includes("free-form whatsapp") || m.includes("free form whatsapp")) return true;
  if (m.includes("outside the whatsapp")) return true;
  return false;
}

/**
 * User-facing copy when outbound is blocked by an expired / closed messaging session.
 * WhatsApp-only paths may mention templates; other channels must not reference WhatsApp templates.
 */
export function userFacingReplyWindowBlockedMessage(channel: Channel | string): string {
  const c = (channel || "").toLowerCase() as Channel;
  switch (c) {
    case "whatsapp":
      return "Outside the WhatsApp reply window. Add an approved WhatsApp template to this step or wait for the customer to message you.";
    case "facebook":
      return "Outside the Facebook Messenger reply window. Wait for the customer to reply again or use an approved Messenger re-engagement method if available.";
    case "instagram":
      return "Outside the Instagram reply window. Wait for the customer to reply again.";
    case "sms":
      return "This SMS could not be sent right now. Wait for the customer to text you again, or confirm the phone number and SMS consent.";
    default:
      return "Outside the messaging reply window. Wait for the customer to reach out again before sending.";
  }
}

/** Inbox / composer: same policy without “this step” (not tied to a campaign step row). */
export function userFacingReplyWindowBlockedMessageInbox(channel: Channel | string): string {
  const c = (channel || "").toLowerCase() as Channel;
  if (c === "whatsapp") {
    return "Outside the WhatsApp reply window. Add an approved WhatsApp template or wait for the customer to message you again.";
  }
  return userFacingReplyWindowBlockedMessage(c);
}

/** Normalize provider or legacy errors to channel-appropriate user copy when the session is closed. */
export function coerceReplyWindowErrorToUserMessage(channel: Channel | string, errorMessage: string): string {
  if (!errorMessage) return errorMessage;
  if (!errorLooksLikeReplyWindowOrTemplateBlock(errorMessage)) return errorMessage;
  return userFacingReplyWindowBlockedMessage(channel);
}

/** True for empty or vague client-only fallback copy — never replace a specific backend error with this. */
export function isGenericOutboundSendFallbackMessage(message: string): boolean {
  const t = (message || "").trim().toLowerCase();
  if (!t) return true;
  if (t.includes("check your connection") && t.includes("try again")) return true;
  if (t === "failed to send message" || t === "message delivery failed") return true;
  return false;
}
