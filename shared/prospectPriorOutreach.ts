/**
 * Pure helpers: detect prior Prospect Intelligence outreach evidence.
 * Used so stuck review_status=approved / outreach_status=not_sent cannot hide
 * an already-sent manual PI email conversation.
 */

import { normalizeOutreachStatus } from "./prospectOutreachLifecycle";

const IDEA_FOR_SUBJECT_RE = /^idea for\b/i;

export type PriorProspectOutreachEvidenceInput = {
  outreachStatus?: string | null;
  outreachConversationId?: string | null;
  outreachMessageId?: string | null;
  outreachSentAt?: string | Date | null;
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
 */
export function detectPriorProspectOutreach(
  input: PriorProspectOutreachEvidenceInput,
): PriorProspectOutreachEvidenceResult {
  if (input.forceResend) {
    return { alreadyContacted: false, reason: "ok" };
  }

  const outreach = normalizeOutreachStatus(input.outreachStatus, {
    outreachSentAt: input.outreachSentAt,
    repliedAt: null,
  });
  if (outreach === "replied") {
    return {
      alreadyContacted: true,
      reason: "already_replied",
      conversationId: input.outreachConversationId,
    };
  }
  if (outreach === "outreach_sent") {
    return {
      alreadyContacted: true,
      reason: "already_outreach_sent",
      conversationId: input.outreachConversationId,
    };
  }

  if (input.outreachConversationId) {
    return {
      alreadyContacted: true,
      reason: "outreach_conversation_linked",
      conversationId: input.outreachConversationId,
    };
  }
  if (input.outreachMessageId || input.outreachSentAt) {
    return {
      alreadyContacted: true,
      reason: "already_outreach_sent",
      conversationId: input.outreachConversationId,
    };
  }

  if (input.hasSuccessfulQueueSend) {
    return { alreadyContacted: true, reason: "queue_already_sent" };
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

  return { alreadyContacted: false, reason: "ok" };
}

export function isProspectIntelligenceOutreachSubject(subject?: string | null): boolean {
  return IDEA_FOR_SUBJECT_RE.test(String(subject || "").trim());
}
