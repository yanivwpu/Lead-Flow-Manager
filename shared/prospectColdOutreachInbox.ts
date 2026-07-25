/**
 * Conversation-scoped Unified Inbox hygiene for Prospect AI cold outreach.
 * Hide outbound-only cold threads until the first real inbound reply.
 * Prefer prospect_intelligence linkage; queue conversationId is a fallback
 * when PI.outreachConversationId was not persisted (Max Zuz–style leak).
 */

export type ColdOutreachHideSignal = {
  outreachConversationId?: string | null;
  outreachStatus?: string | null;
  repliedAt?: Date | string | null;
};

/**
 * Queue-sent Prospect AI outreach — conversation may be hideable even when
 * PI.outreachConversationId is missing/stale.
 */
export type ColdOutreachQueueSentSignal = {
  conversationId?: string | null;
  contactId?: string | null;
  /** Matching PI row for this contact (optional). */
  repliedAt?: Date | string | null;
  outreachStatus?: string | null;
};

/**
 * True when PI links an outreach conversation that was sent and has not yet
 * received a real inbound reply (repliedAt unset, status outreach_sent).
 */
export function isColdProspectOutreachAwaitingReply(
  signal: ColdOutreachHideSignal | null | undefined,
): boolean {
  if (!signal) return false;
  const conversationId = String(signal.outreachConversationId || "").trim();
  if (!conversationId) return false;
  if (signal.repliedAt) return false;
  const status = String(signal.outreachStatus || "")
    .trim()
    .toLowerCase();
  return status === "outreach_sent";
}

/**
 * Queue-sent cold outreach awaiting reply.
 * Hides the queue's conversationId when PI has not recorded a reply —
 * covers missing/stale PI.outreachConversationId after a successful campaign send.
 */
export function isQueueSentColdOutreachAwaitingReply(
  signal: ColdOutreachQueueSentSignal | null | undefined,
): boolean {
  if (!signal) return false;
  const conversationId = String(signal.conversationId || "").trim();
  if (!conversationId) return false;
  if (signal.repliedAt) return false;
  const status = String(signal.outreachStatus || "")
    .trim()
    .toLowerCase();
  // Already replied on PI — never hide from queue alone.
  if (status === "replied") return false;
  // Successful campaign/manual queue send is Prospect AI cold outreach.
  // Accept outreach_sent or stuck not_sent (mark-sent linkage race).
  return status === "outreach_sent" || status === "not_sent" || !status;
}

/** Build the set of conversation ids that should be omitted from Unified Inbox. */
export function collectHiddenColdOutreachConversationIds(
  signals: readonly ColdOutreachHideSignal[],
  queueSentSignals?: readonly ColdOutreachQueueSentSignal[] | null,
): Set<string> {
  const out = new Set<string>();
  for (const signal of signals) {
    if (!isColdProspectOutreachAwaitingReply(signal)) continue;
    out.add(String(signal.outreachConversationId).trim());
  }
  for (const signal of queueSentSignals || []) {
    if (!isQueueSentColdOutreachAwaitingReply(signal)) continue;
    out.add(String(signal.conversationId).trim());
  }
  return out;
}

export function toHiddenConversationIdSet(
  ids: ReadonlySet<string> | readonly string[] | null | undefined,
): Set<string> {
  if (!ids) return new Set();
  if (ids instanceof Set) return ids;
  return new Set(ids.map((id) => String(id || "").trim()).filter(Boolean));
}

/**
 * Apply hide set to an email conversation row.
 * If the thread already has an inbound last message, keep it visible even if
 * the hide set is stale (reply must surface immediately).
 */
export function shouldHideColdOutreachEmailConversation(params: {
  channel?: string | null;
  conversationId?: string | null;
  lastMessageDirection?: string | null;
  hiddenIds: ReadonlySet<string>;
}): boolean {
  if (String(params.channel || "").toLowerCase() !== "email") return false;
  const id = String(params.conversationId || "").trim();
  if (!id || !params.hiddenIds.has(id)) return false;
  if (String(params.lastMessageDirection || "").toLowerCase() === "inbound") {
    return false;
  }
  return true;
}
