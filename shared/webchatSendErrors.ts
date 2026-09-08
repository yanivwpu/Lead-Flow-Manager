/** User-facing copy for outbound Web Chat send failures. */

export const WEBCHAT_LAST_ACTIVE_FIELD = "webchatLastActiveAt";

/**
 * Presence only: last poll or inbound within this window counts as "visitor online".
 * This is not a delivery or send gate. Offline replies are stored for later poll.
 */
export const WEBCHAT_SESSION_IDLE_MS = 5 * 60 * 1000;

/** Collapse duplicate manual/AI-reviewed sends of the same payload on one thread. */
export const WEBCHAT_OUTBOUND_DEDUP_MS = 30 * 1000;

export type WebchatSendErrorCode =
  | "webchat_not_configured"
  | "webchat_session_inactive"
  | "webchat_conversation_inaccessible"
  | "webchat_delivery_failed";

export const WEBCHAT_NOT_CONFIGURED_MESSAGE =
  "Web Chat is not configured for this workspace.";

export const WEBCHAT_SESSION_INACTIVE_MESSAGE =
  "This web chat session is no longer active. The visitor may have left or closed the chat.";

export const WEBCHAT_SESSION_INACTIVE_EXPANDED_MESSAGE =
  "This web chat session is no longer active. Ask the visitor for a phone number, email, WhatsApp, Facebook, or Instagram contact to continue the conversation.";

export const WEBCHAT_CONVERSATION_CLOSED_MESSAGE =
  "This conversation is closed. Reopen it in Inbox before sending.";

export const WEBCHAT_CONVERSATION_INACCESSIBLE_MESSAGE =
  "This conversation is no longer accessible.";

export const WEBCHAT_VISITOR_IDENTITY_INVALID_MESSAGE =
  "This web chat conversation cannot accept a reply because the visitor identity is invalid.";

export const WEBCHAT_DELIVERY_FAILED_MESSAGE =
  "Unable to deliver the message. Please try again.";

export const WEBCHAT_MEDIA_UNAVAILABLE_MESSAGE =
  "This image could not be delivered to the visitor.";

export const WEBCHAT_MEDIA_UNSUPPORTED_MESSAGE =
  "Website Chat only supports JPEG, PNG, and WebP images.";

export function webchatErrorCodeForMessage(error: string | null | undefined): WebchatSendErrorCode | undefined {
  const msg = (error || "").trim();
  if (msg === WEBCHAT_NOT_CONFIGURED_MESSAGE) return "webchat_not_configured";
  if (
    msg === WEBCHAT_SESSION_INACTIVE_MESSAGE ||
    msg === WEBCHAT_SESSION_INACTIVE_EXPANDED_MESSAGE ||
    msg.includes("no web chat session")
  ) {
    return "webchat_session_inactive";
  }
  if (
    msg === WEBCHAT_CONVERSATION_CLOSED_MESSAGE ||
    msg === WEBCHAT_CONVERSATION_INACCESSIBLE_MESSAGE ||
    msg === WEBCHAT_VISITOR_IDENTITY_INVALID_MESSAGE
  ) {
    return "webchat_conversation_inaccessible";
  }
  if (msg === WEBCHAT_DELIVERY_FAILED_MESSAGE) return "webchat_delivery_failed";
  if (msg === WEBCHAT_MEDIA_UNAVAILABLE_MESSAGE || msg === WEBCHAT_MEDIA_UNSUPPORTED_MESSAGE) {
    return "webchat_delivery_failed";
  }
  if (msg.includes("is not connected for this workspace") && msg.toLowerCase().includes("web chat")) {
    return "webchat_not_configured";
  }
  return undefined;
}

export function isWebchatSendErrorCode(value: unknown): value is WebchatSendErrorCode {
  return (
    value === "webchat_not_configured" ||
    value === "webchat_session_inactive" ||
    value === "webchat_conversation_inaccessible" ||
    value === "webchat_delivery_failed"
  );
}

export function webchatSendErrorDescription(
  error: string | null | undefined,
  errorCode?: string | null,
  opts?: { expanded?: boolean },
): string | null {
  const code = isWebchatSendErrorCode(errorCode) ? errorCode : null;
  const msg = (error || "").trim();

  if (code === "webchat_not_configured" || msg === WEBCHAT_NOT_CONFIGURED_MESSAGE) {
    return WEBCHAT_NOT_CONFIGURED_MESSAGE;
  }
  if (
    code === "webchat_session_inactive" ||
    msg === WEBCHAT_SESSION_INACTIVE_MESSAGE ||
    msg === WEBCHAT_SESSION_INACTIVE_EXPANDED_MESSAGE ||
    msg.includes("no web chat session") ||
    msg.includes("no longer active")
  ) {
    return opts?.expanded ? WEBCHAT_SESSION_INACTIVE_EXPANDED_MESSAGE : WEBCHAT_SESSION_INACTIVE_MESSAGE;
  }
  if (
    code === "webchat_conversation_inaccessible" ||
    msg === WEBCHAT_CONVERSATION_CLOSED_MESSAGE ||
    msg === WEBCHAT_CONVERSATION_INACCESSIBLE_MESSAGE ||
    msg === WEBCHAT_VISITOR_IDENTITY_INVALID_MESSAGE
  ) {
    if (msg === WEBCHAT_CONVERSATION_CLOSED_MESSAGE) return WEBCHAT_CONVERSATION_CLOSED_MESSAGE;
    if (msg === WEBCHAT_VISITOR_IDENTITY_INVALID_MESSAGE) return WEBCHAT_VISITOR_IDENTITY_INVALID_MESSAGE;
    return WEBCHAT_CONVERSATION_INACCESSIBLE_MESSAGE;
  }
  if (code === "webchat_delivery_failed" || msg === WEBCHAT_DELIVERY_FAILED_MESSAGE) {
    return WEBCHAT_DELIVERY_FAILED_MESSAGE;
  }
  if (msg === WEBCHAT_MEDIA_UNAVAILABLE_MESSAGE) return WEBCHAT_MEDIA_UNAVAILABLE_MESSAGE;
  if (msg === WEBCHAT_MEDIA_UNSUPPORTED_MESSAGE) return WEBCHAT_MEDIA_UNSUPPORTED_MESSAGE;
  if (msg.includes("is not connected for this workspace") && msg.toLowerCase().includes("web chat")) {
    return WEBCHAT_NOT_CONFIGURED_MESSAGE;
  }
  return null;
}
