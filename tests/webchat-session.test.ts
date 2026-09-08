import {
  WEBCHAT_NOT_CONFIGURED_MESSAGE,
  WEBCHAT_SESSION_INACTIVE_MESSAGE,
  WEBCHAT_SESSION_INACTIVE_EXPANDED_MESSAGE,
  WEBCHAT_DELIVERY_FAILED_MESSAGE,
  WEBCHAT_SESSION_IDLE_MS,
  WEBCHAT_OUTBOUND_DEDUP_MS,
  WEBCHAT_VISITOR_IDENTITY_INVALID_MESSAGE,
  webchatErrorCodeForMessage,
  webchatSendErrorDescription,
} from "../shared/webchatSendErrors";
import {
  contactHasWebchatSessionSignals,
  isWebchatOutboundDuplicate,
  readWebchatLastActiveAt,
  readWebchatVisitorId,
  webchatConversationIsInaccessible,
  webchatConversationShouldReopenOnOutbound,
} from "../server/webchatSession";
import { isPublicWebchatMessageVisible } from "../shared/webchatPublicMessages";
import { WEBCHAT_POLL_HIDDEN_MS } from "../shared/webchatPollPolicy";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

assert(WEBCHAT_SESSION_IDLE_MS === 5 * 60 * 1000, "presence idle window is 5 minutes");
assert(WEBCHAT_POLL_HIDDEN_MS === 0, "backgrounded widgets do not poll");

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

assert(
  webchatErrorCodeForMessage(WEBCHAT_VISITOR_IDENTITY_INVALID_MESSAGE) ===
    "webchat_conversation_inaccessible",
  "invalid visitor identity is fail-closed, not idle",
);

const recent = new Date(Date.now() - 60_000).toISOString();
const stale = new Date(Date.now() - WEBCHAT_SESSION_IDLE_MS - 60_000).toISOString();
const twelveMinAgo = new Date(Date.now() - 12 * 60 * 1000).toISOString();

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
  readWebchatLastActiveAt({
    customFields: { webchatLastActiveAt: twelveMinAgo },
  } as any) !== null,
  "12-minute-old presence timestamp is still stored",
);

const visitor = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
assert(
  readWebchatVisitorId({ webchatId: visitor } as any) === visitor,
  "reads public visitor UUID",
);
assert(readWebchatVisitorId({ webchatId: "visitor_1_abc" } as any) === null, "legacy visitor ids are invalid");
assert(readWebchatVisitorId({ email: "a@example.test" } as any) === null, "email is not a visitor identity");

assert(
  contactHasWebchatSessionSignals({ source: "webchat" } as any, null),
  "webchat source counts as session signal",
);

assert(
  !contactHasWebchatSessionSignals({ source: "manual" } as any, null),
  "manual source without conversation is not webchat",
);

assert(webchatConversationIsInaccessible({ status: "blocked" } as any), "blocked is inaccessible");
assert(webchatConversationIsInaccessible({ status: "deleted" } as any), "deleted is inaccessible");
assert(!webchatConversationIsInaccessible({ status: "closed" } as any), "closed is reopenable, not inaccessible");
assert(webchatConversationShouldReopenOnOutbound({ status: "closed" } as any), "closed reopens on outbound");
assert(webchatConversationShouldReopenOnOutbound({ status: "resolved" } as any), "resolved reopens on outbound");
assert(!webchatConversationShouldReopenOnOutbound({ status: "open" } as any), "open stays open");

const dupNow = Date.now();
assert(
  isWebchatOutboundDuplicate({
    candidate: {
      direction: "outbound",
      status: "sent",
      content: "Thanks — we can help.",
      createdAt: new Date(dupNow - 5_000).toISOString(),
    },
    content: "Thanks — we can help.",
    now: dupNow,
  }),
  "duplicate send collapses",
);
assert(
  !isWebchatOutboundDuplicate({
    candidate: {
      direction: "outbound",
      status: "failed",
      content: "Thanks — we can help.",
      createdAt: new Date(dupNow - 5_000).toISOString(),
    },
    content: "Thanks — we can help.",
    now: dupNow,
  }),
  "failed rows are not duplicates",
);
assert(
  !isWebchatOutboundDuplicate({
    candidate: {
      direction: "outbound",
      status: "sent",
      content: "Thanks — we can help.",
      createdAt: new Date(dupNow - WEBCHAT_OUTBOUND_DEDUP_MS - 1000).toISOString(),
    },
    content: "Thanks — we can help.",
    now: dupNow,
  }),
  "old rows are not duplicates",
);

assert(
  isPublicWebchatMessageVisible({
    id: "offline-1",
    direction: "outbound",
    status: "sent",
    content: "Stored while the visitor was offline",
  }),
  "stored sent outbound is retrievable on the next poll",
);
assert(
  isPublicWebchatMessageVisible({
    id: "pending-1",
    direction: "outbound",
    status: "pending",
    content: "Queued",
  }),
  "pending outbound is visitor-visible",
);
assert(
  !isPublicWebchatMessageVisible({
    id: "fail-1",
    direction: "outbound",
    status: "failed",
    errorMessage: WEBCHAT_SESSION_INACTIVE_MESSAGE,
  }),
  "failed outbound stays inbox-only",
);

const adapter = read("server/channelAdapters.ts");
const adapterSend = adapter.slice(adapter.indexOf("class WebChatAdapter"), adapter.indexOf("class InstagramAdapter"));
assert(adapterSend.includes("evaluateWebchatStoredReplyGate"), "adapter uses store-and-poll gate");
assert(!/isWebchatVisitorSessionActive/.test(adapterSend), "adapter must not require visitor online");
assert(!adapterSend.includes("WEBCHAT_SESSION_INACTIVE_MESSAGE"), "adapter must not emit idle inactive copy");

const channel = read("server/channelService.ts");
assert(channel.includes("evaluateWebchatStoredReplyGate"), "sendMessage stores without presence");
assert(channel.includes("isWebchatOutboundDuplicate"), "sendMessage dedupes webchat outbound");
assert(channel.includes("webchatConversationShouldReopenOnOutbound"), "closed threads reopen on stored send");
assert(
  !/if\s*\(!\(await isWebchatVisitorSessionActive/.test(channel),
  "forced webchat send must not idle-timeout",
);

const contacts = read("server/routes/contacts.ts");
const sendRoute = contacts.slice(contacts.indexOf('app.post("/api/contacts/:id/send"'));
assert(sendRoute.includes("guardedSources"), "automation guard remains source-scoped");
assert(sendRoute.includes('"ai_auto"'), "auto source is still guarded");
assert(/suppressFallback:\s*!!requested/.test(sendRoute), "inbox pins the selected channel");

const inbox = read("client/src/pages/UnifiedInbox.tsx");
assert(inbox.includes("if (sendMessageMutation.isPending) return"), "duplicate click cannot queue two manuals");
assert(inbox.includes('handleComposerChange(data.content, { contactId: data.contactId, source: "manual" })'), "failed manual send restores the draft");
assert(!/source:\s*"ai_auto"/.test(inbox.slice(inbox.indexOf("const body: Record"), inbox.indexOf("const res = await fetch"))), "typed send body does not set ai_auto");

console.log("webchat-session.test.ts: all assertions passed");
