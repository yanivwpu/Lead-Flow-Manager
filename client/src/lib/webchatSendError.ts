export {
  WEBCHAT_NOT_CONFIGURED_MESSAGE,
  WEBCHAT_SESSION_INACTIVE_MESSAGE,
  WEBCHAT_SESSION_INACTIVE_EXPANDED_MESSAGE,
  WEBCHAT_DELIVERY_FAILED_MESSAGE,
  webchatSendErrorDescription,
  type WebchatSendErrorCode,
} from "@shared/webchatSendErrors";

import { webchatSendErrorDescription } from "@shared/webchatSendErrors";

/** Toast/bubble copy for failed Web Chat sends; falls back to the server error string. */
export function formatOutboundSendErrorDescription(
  error: string | null | undefined,
  errorCode?: string | null,
): string {
  return (
    webchatSendErrorDescription(error, errorCode) ||
    (error || "").trim() ||
    "Unable to deliver the message. Please try again."
  );
}
