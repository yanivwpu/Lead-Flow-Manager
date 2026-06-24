/** User-facing copy for outbound Web Chat send failures. */

export const WEBCHAT_LAST_ACTIVE_FIELD = "webchatLastActiveAt";

/** Visitor must poll or message within this window to count as an active session. */
export const WEBCHAT_SESSION_IDLE_MS = 5 * 60 * 1000;

export type WebchatSendErrorCode =
  | "webchat_not_configured"
  | "webchat_session_inactive"
  | "webchat_delivery_failed";

export const WEBCHAT_NOT_CONFIGURED_MESSAGE =
  "Web Chat is not configured for this workspace.";

export const WEBCHAT_SESSION_INACTIVE_MESSAGE =
  "This web chat session is no longer active. The visitor may have left or closed the chat.";

export const WEBCHAT_SESSION_INACTIVE_EXPANDED_MESSAGE =
  "This web chat session is no longer active. Ask the visitor for a phone number, email, WhatsApp, Facebook, or Instagram contact to continue the conversation.";

export const WEBCHAT_DELIVERY_FAILED_MESSAGE =
  "Unable to deliver the message. Please try again.";

export function webchatErrorCodeForMessage(error: string | null | undefined): WebchatSendErrorCode | undefined {
  const msg = (error || "").trim();
  if (msg === WEBCHAT_NOT_CONFIGURED_MESSAGE) return "webchat_not_configured";
  if (msg === WEBCHAT_SESSION_INACTIVE_MESSAGE || msg === WEBCHAT_SESSION_INACTIVE_EXPANDED_MESSAGE) {
    return "webchat_session_inactive";
  }
  if (msg === WEBCHAT_DELIVERY_FAILED_MESSAGE) return "webchat_delivery_failed";
  if (msg.includes("is not connected for this workspace") && msg.toLowerCase().includes("web chat")) {
    return "webchat_not_configured";
  }
  return undefined;
}

export function isWebchatSendErrorCode(value: unknown): value is WebchatSendErrorCode {
  return (
    value === "webchat_not_configured" ||
    value === "webchat_session_inactive" ||
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
  if (code === "webchat_delivery_failed" || msg === WEBCHAT_DELIVERY_FAILED_MESSAGE) {
    return WEBCHAT_DELIVERY_FAILED_MESSAGE;
  }
  if (msg.includes("is not connected for this workspace") && msg.toLowerCase().includes("web chat")) {
    return WEBCHAT_NOT_CONFIGURED_MESSAGE;
  }
  return null;
}
