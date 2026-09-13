/**
 * Single Web Chat inbound AI dispatcher used by processIncomingMessage.
 * Away-reply skip must not terminate this path.
 */

import type { Contact, Conversation } from "@shared/schema";
import { decideWebchatInboundAiEvaluation } from "@shared/webchatInboundAiDispatch";
import type { WebchatAiAutoReplyDeps } from "./webchatAiAutoReply";

export type WebchatInboundAiDispatchResult = {
  evaluated: boolean;
  reason: string;
  decision: string | null;
  sent: boolean;
};

export type WebchatInboundAiRun = (
  params: {
    userId: string;
    contact: Contact;
    conversation: Conversation;
    inboundMessageId: string;
    inboundText: string;
    chatbotWillFire: boolean;
    bookingOwnsReply?: boolean;
    crmFallbackOwnsReply?: boolean;
    awayConfigured?: boolean;
    widgetSettings: Record<string, unknown>;
  },
  deps?: WebchatAiAutoReplyDeps,
) => Promise<{ decision: string; sent: boolean }>;

export type WebchatInboundAiDispatchDeps = WebchatAiAutoReplyDeps & {
  runAi?: WebchatInboundAiRun;
};

function logAiAuto(fields: Record<string, string | boolean | number | null | undefined>): void {
  const clean: Record<string, string | boolean | number | null> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    clean[key] = value;
  }
  console.info("[AIAutoReply]", clean);
}

export async function dispatchWebchatInboundAi(
  params: {
    userId: string;
    contact: Contact;
    conversation: Conversation;
    inboundMessageId: string;
    inboundText: string;
    contentType?: string | null;
    channel: string;
    chatbotOwnsReply: boolean;
    turnOwner?: string | null;
    awayConfigured: boolean;
    awayReplyWillSend: boolean;
    widgetSettings: Record<string, unknown>;
  },
  deps: WebchatInboundAiDispatchDeps = {},
): Promise<WebchatInboundAiDispatchResult> {
  const gate = decideWebchatInboundAiEvaluation({
    channel: params.channel,
    contentType: params.contentType,
    chatbotOwnsReply: params.chatbotOwnsReply,
    turnOwner: params.turnOwner,
    awayReplyWillSend: params.awayReplyWillSend,
  });
  logAiAuto({
    evaluate: gate.evaluateAi,
    reason: gate.reason,
    chatbotOwns: params.chatbotOwnsReply,
    awayConfigured: params.awayConfigured,
    awayWillSend: params.awayReplyWillSend,
    turnOwner: params.turnOwner || null,
  });
  if (!gate.evaluateAi) {
    return { evaluated: false, reason: gate.reason, decision: null, sent: false };
  }

  const runAi: WebchatInboundAiRun =
    deps.runAi || (await import("./webchatAiAutoReply")).maybeRunWebchatServerAi;
  const ai = await runAi(
    {
      userId: params.userId,
      contact: params.contact,
      conversation: params.conversation,
      inboundMessageId: params.inboundMessageId,
      inboundText: params.inboundText,
      chatbotWillFire: params.chatbotOwnsReply,
      bookingOwnsReply: params.turnOwner === "booking",
      crmFallbackOwnsReply: params.awayReplyWillSend,
      awayConfigured: params.awayConfigured,
      widgetSettings: params.widgetSettings,
    },
    deps,
  );
  logAiAuto({
    evaluated: true,
    reason: gate.reason,
    decision: ai.decision,
    sent: ai.sent,
    chatbotOwns: params.chatbotOwnsReply,
    awayConfigured: params.awayConfigured,
    awayWillSend: params.awayReplyWillSend,
  });
  return {
    evaluated: true,
    reason: gate.reason,
    decision: ai.decision,
    sent: ai.sent,
  };
}
