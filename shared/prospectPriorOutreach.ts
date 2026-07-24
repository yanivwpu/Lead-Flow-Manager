/**
 * Pure helpers: detect prior Prospect Intelligence outreach evidence.
 * Used so stuck review_status / outreach_status cannot hide an already-sent
 * manual PI email conversation — and so stale flags alone do not block Send.
 *
 * Already contacted requires a real artifact:
 * - successful queue send, or
 * - linked outreachMessageId, or
 * - "Idea for …" email thread with outbound, or
 * - linked conversation that has outbound evidence
 *
 * outreachStatus / outreachSentAt alone are NOT sufficient.
 */

const IDEA_FOR_SUBJECT_RE = /^idea for\b/i;

export type PriorProspectOutreachEvidenceInput = {
  outreachStatus?: string | null;
  outreachConversationId?: string | null;
  outreachMessageId?: string | null;
  outreachSentAt?: string | Date | null;
  repliedAt?: string | Date | null;
  /**
   * Existing email conversations for the contact.
   * hasOutbound=true means at least one outbound message on the thread.
   */
  emailConversations?: Array<{
    id?: string | null;
    subject?: string | null;
    hasOutbound?: boolean;
  }>;
  /** Existing successful queue sends for this contact. */
  hasSuccessfulQueueSend?: boolean;
  /** Explicit user-requested resend bypass (future). */
  forceResend?: boolean;
};

export type PriorProspectOutreachEvidenceResult = {
  alreadyContacted: boolean;
  reason:
    | "ok"
    | "already_outreach_sent"
    | "already_replied"
    | "outreach_conversation_linked"
    | "manual_outreach_conversation"
    | "queue_already_sent";
  conversationId?: string | null;
};

/**
 * Block bulk queue when the prospect already received PI outreach,
 * even if outreach_status was stuck on not_sent (lifecycle bug / missed mark).
 * Do not block on stale outreach_sent / outreachSentAt alone.
 */
export function detectPriorProspectOutreach(
  input: PriorProspectOutreachEvidenceInput,
): PriorProspectOutreachEvidenceResult {
  if (input.forceResend) {
    return { alreadyContacted: false, reason: "ok" };
  }

  if (input.hasSuccessfulQueueSend) {
    return { alreadyContacted: true, reason: "queue_already_sent" };
  }

  if (String(input.outreachMessageId || "").trim()) {
    const outreach = String(input.outreachStatus || "").toLowerCase();
    return {
      alreadyContacted: true,
      reason: outreach === "replied" || input.repliedAt ? "already_replied" : "already_outreach_sent",
      conversationId: input.outreachConversationId || null,
    };
  }

  for (const conv of input.emailConversations || []) {
    const subject = String(conv.subject || "").trim();
    if (!subject || !IDEA_FOR_SUBJECT_RE.test(subject)) continue;
    if (conv.hasOutbound === true) {
      return {
        alreadyContacted: true,
        reason: "manual_outreach_conversation",
        conversationId: conv.id || null,
      };
    }
  }

  const linked = String(input.outreachConversationId || "").trim();
  if (linked) {
    const match = (input.emailConversations || []).find(
      (c) => String(c.id || "") === linked && c.hasOutbound === true,
    );
    if (match) {
      const outreach = String(input.outreachStatus || "").toLowerCase();
      return {
        alreadyContacted: true,
        reason:
          outreach === "replied" || input.repliedAt
            ? "already_replied"
            : "outreach_conversation_linked",
        conversationId: linked,
      };
    }
  }

  // Stale PI flags alone — not already contacted
  return { alreadyContacted: false, reason: "ok" };
}

export function isProspectIntelligenceOutreachSubject(subject?: string | null): boolean {
  return IDEA_FOR_SUBJECT_RE.test(String(subject || "").trim());
}
