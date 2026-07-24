/**
 * Traceable Prospect AI outreach — presentation + eligibility.
 *
 * CORE INVARIANT: never claim "outreach was sent" / Already contacted from
 * outreachStatus / outreachSentAt alone. Require a corroborating artifact:
 * - queue row with status sent (Campaigns transfer), or
 * - linked outreachMessageId (native Inbox send), or
 * - server-confirmed outbound / priorOutreachDetected (Idea for… threads), or
 * - hasOutboundMessage on a known thread
 */

export type ProspectTraceableOutreachInput = {
  queueStatus?: string | null;
  outreachStatus?: string | null;
  outreachSentAt?: string | Date | null;
  outreachMessageId?: string | null;
  outreachConversationId?: string | null;
  repliedAt?: string | Date | null;
  /** Server-confirmed: outbound message exists on a linked/known thread. */
  hasOutboundMessage?: boolean | null;
  /**
   * Server-derived from the same detectPriorProspectOutreach path as Send preview.
   * True when a real prior outbound / queue send / linked message exists.
   */
  priorOutreachDetected?: boolean | null;
  /** Existing Unified Inbox thread known from list payload. */
  hasInboxThread?: boolean | null;
};

/** True when there is a real, findable send/history artifact. */
export function hasTraceableProspectOutreachSend(
  input: ProspectTraceableOutreachInput,
): boolean {
  const queue = String(input.queueStatus || "").toLowerCase();
  if (queue === "sent") return true;

  if (String(input.outreachMessageId || "").trim()) return true;

  if (input.hasOutboundMessage === true) return true;

  if (input.priorOutreachDetected === true) return true;

  return false;
}

/**
 * Active Inbox journey: real conversation/thread, not legacy outreach_sent alone.
 */
export function hasTraceableProspectInboxThread(
  input: ProspectTraceableOutreachInput,
): boolean {
  if (input.hasInboxThread === true) return true;
  if (String(input.outreachConversationId || "").trim() && hasTraceableProspectOutreachSend(input)) {
    return true;
  }
  // Reply timestamp alone is not enough without a linked thread id
  if (input.repliedAt && String(input.outreachConversationId || "").trim()) {
    return true;
  }
  return false;
}

/**
 * Campaign progress / leave-Review enrollment:
 * queue enrollment OR a traceable historical send (pre-queue Inbox outreach).
 */
export function hasTraceableProspectCampaignHistory(
  input: ProspectTraceableOutreachInput,
): boolean {
  const queue = String(input.queueStatus || "").toLowerCase();
  if (
    queue === "queued" ||
    queue === "sending" ||
    queue === "paused" ||
    queue === "sent" ||
    queue === "failed" ||
    queue === "skipped" ||
    queue === "cancelled"
  ) {
    return true;
  }
  return hasTraceableProspectOutreachSend(input);
}

/** Legacy PI flags that claim sent without corroborating artifacts. */
export function hasStaleProspectOutreachLifecycleFlags(
  input: ProspectTraceableOutreachInput,
): boolean {
  const outreach = String(input.outreachStatus || "").toLowerCase();
  const claimsSent =
    outreach === "outreach_sent" ||
    outreach === "replied" ||
    Boolean(input.outreachSentAt) ||
    Boolean(input.repliedAt);
  if (!claimsSent) return false;
  return !hasTraceableProspectOutreachSend(input) && !hasTraceableProspectInboxThread(input);
}
