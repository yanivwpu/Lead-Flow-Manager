/** Logged when human handoff is cleared (customer continued, agent replied, or user unsnoozed). */
export const AI_HANDOFF_RESOLVED_EVENT = "ai_handoff_resolved";

export type HandoffTimelineEvent = {
  eventType: string;
  conversationId: string | null | undefined;
};

/**
 * Activity events are expected newest-first (e.g. storage.getActivityEvents).
 * Handoff is active when the latest relevant event for this conversation is ai_handoff.
 * Legacy events may omit conversationId — those apply contact-wide until resolved.
 */
export function isConversationHandoffActive(
  events: HandoffTimelineEvent[],
  conversationId: string | undefined
): boolean {
  if (!conversationId) return false;
  for (const e of events) {
    const cid = e.conversationId ?? null;
    if (cid !== null && cid !== conversationId) continue;
    if (e.eventType === "ai_handoff") return true;
    if (e.eventType === AI_HANDOFF_RESOLVED_EVENT) return false;
  }
  return false;
}
