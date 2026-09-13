/**
 * Web Chat inbound responders are independent:
 * chatbot ownership, optional away/static reply, and AI Brain Manual/Suggest/Auto.
 * "No away reply configured" never means "skip AI."
 */

export type WebchatInboundAiEvaluation = {
  evaluateAi: boolean;
  reason: string;
};

export function decideWebchatInboundAiEvaluation(input: {
  channel?: string | null;
  contentType?: string | null;
  chatbotOwnsReply: boolean;
  turnOwner?: string | null;
  awayReplyWillSend: boolean;
}): WebchatInboundAiEvaluation {
  if (input.channel !== "webchat") {
    return { evaluateAi: false, reason: "not_webchat" };
  }
  const contentType = (input.contentType || "text").trim().toLowerCase();
  if (contentType !== "text") {
    return { evaluateAi: false, reason: "non_text_inbound" };
  }
  if (input.chatbotOwnsReply) {
    return { evaluateAi: false, reason: "chatbot_owns" };
  }
  if (input.turnOwner === "booking") {
    return { evaluateAi: false, reason: "booking_owns" };
  }
  if (input.awayReplyWillSend) {
    return { evaluateAi: false, reason: "away_reply_owns" };
  }
  return { evaluateAi: true, reason: "ai_eligible" };
}
