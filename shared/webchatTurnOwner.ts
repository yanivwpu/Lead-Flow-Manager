/**
 * Single response-owner for a webchat inbound turn.
 * Used so chatbot, booking, and AI cannot all reply to the same visitor message.
 */

export type WebchatTurnOwner = "chatbot" | "booking" | "ai_eligible" | "none";

export type ChatbotVisitorOutcome = {
  triggered: boolean;
  /** True when the flow sends, waits for input, hands off, or schedules a delayed visitor message. */
  visitorFacing: boolean;
  reason: string;
};

export function decideWebchatTurnOwner(input: {
  bookingIntent: boolean;
  chatbot: ChatbotVisitorOutcome;
}): { owner: WebchatTurnOwner; chatbotOwnsReply: boolean } {
  if (input.bookingIntent) {
    return { owner: "booking", chatbotOwnsReply: false };
  }
  if (input.chatbot.visitorFacing) {
    return { owner: "chatbot", chatbotOwnsReply: true };
  }
  if (input.chatbot.triggered && !input.chatbot.visitorFacing) {
    return { owner: "ai_eligible", chatbotOwnsReply: false };
  }
  return { owner: "ai_eligible", chatbotOwnsReply: false };
}

export type ChatbotNodeLike = {
  id: string;
  type?: string;
  data?: {
    content?: string;
    mediaUrl?: string;
    messageType?: string;
    buttons?: unknown[];
    delayMinutes?: number;
    actionType?: string;
    action?: { type?: string };
  };
};

export type ChatbotEdgeLike = { source?: string; target?: string };

/**
 * Walk from start until a visitor-facing, delay, wait, or handoff node.
 * Action-only nodes do not own the turn.
 */
export function flowWouldOwnVisitorTurn(
  nodes: ChatbotNodeLike[],
  edges: ChatbotEdgeLike[],
): { visitorFacing: boolean; reason: string } {
  if (!nodes.length) return { visitorFacing: false, reason: "empty_flow" };
  const next = new Map<string, string>();
  for (const e of edges) {
    if (e.source && e.target && !next.has(e.source)) next.set(e.source, e.target);
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let current: ChatbotNodeLike | undefined = byId.get("start") || nodes[0];
  const visited = new Set<string>();
  while (current) {
    if (visited.has(current.id)) break;
    visited.add(current.id);
    const type = String(current.type || "");
    const data = current.data || {};
    if (type === "delay") {
      return { visitorFacing: true, reason: "delay_scheduled" };
    }
    const actionType = data.action?.type || data.actionType || "";
    if (type === "handoff" || actionType === "handoff" || actionType === "assign" || actionType === "assign_agent") {
      return { visitorFacing: true, reason: "handoff" };
    }
    if (type === "message" || type === "question") {
      const msgType = data.messageType || "text";
      if (msgType === "buttons" || (Array.isArray(data.buttons) && data.buttons.length > 0)) {
        return { visitorFacing: true, reason: "wait_for_input" };
      }
      if ((data.content || "").trim() || (data.mediaUrl || "").trim()) {
        return { visitorFacing: true, reason: "scripted_reply" };
      }
    }
    if (type === "action") {
      const nextId = next.get(current.id);
      current = nextId ? byId.get(nextId) : undefined;
      continue;
    }
    const nextId = next.get(current.id);
    current = nextId ? byId.get(nextId) : undefined;
  }
  return { visitorFacing: false, reason: "action_only_or_empty" };
}
