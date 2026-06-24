import {
  WEBCHAT_NOT_CONFIGURED_MESSAGE,
  WEBCHAT_SESSION_INACTIVE_MESSAGE,
  WEBCHAT_SESSION_INACTIVE_EXPANDED_MESSAGE,
  WEBCHAT_DELIVERY_FAILED_MESSAGE,
  WEBCHAT_SESSION_IDLE_MS,
  webchatErrorCodeForMessage,
  webchatSendErrorDescription,
} from "../shared/webchatSendErrors";
import {
  contactHasWebchatSessionSignals,
  readWebchatLastActiveAt,
} from "../server/webchatSession";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(
  webchatSendErrorDescription("Web Chat is not connected for this workspace") ===
    WEBCHAT_NOT_CONFIGURED_MESSAGE,
  "legacy not-connected maps to configured message",
);

assert(
  webchatSendErrorDescription(WEBCHAT_SESSION_INACTIVE_MESSAGE, "webchat_session_inactive") ===
    WEBCHAT_SESSION_INACTIVE_MESSAGE,
  "inactive short message",
);

assert(
  webchatSendErrorDescription(WEBCHAT_SESSION_INACTIVE_MESSAGE, "webchat_session_inactive", {
    expanded: true,
  }) === WEBCHAT_SESSION_INACTIVE_EXPANDED_MESSAGE,
  "inactive expanded message",
);

assert(
  webchatSendErrorDescription(WEBCHAT_DELIVERY_FAILED_MESSAGE) === WEBCHAT_DELIVERY_FAILED_MESSAGE,
  "delivery failed message",
);

assert(
  webchatErrorCodeForMessage(WEBCHAT_NOT_CONFIGURED_MESSAGE) === "webchat_not_configured",
  "error code for not configured",
);

const recent = new Date(Date.now() - 60_000).toISOString();
const stale = new Date(Date.now() - WEBCHAT_SESSION_IDLE_MS - 60_000).toISOString();

assert(
  readWebchatLastActiveAt({
    customFields: { webchatLastActiveAt: recent },
  } as any)?.toISOString() === recent,
  "reads recent last active",
);

assert(
  readWebchatLastActiveAt({
    customFields: { webchatLastActiveAt: stale },
  } as any) !== null,
  "reads stale last active timestamp",
);

assert(
  contactHasWebchatSessionSignals({ source: "webchat" } as any, null),
  "webchat source counts as session signal",
);

assert(
  !contactHasWebchatSessionSignals({ source: "manual" } as any, null),
  "manual source without conversation is not webchat",
);

console.log("webchat-session.test.ts: all assertions passed");
