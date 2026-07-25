/**
 * Conversation-scoped Unified Inbox hygiene for Prospect AI cold outreach.
 * Hide outbound-only cold threads until the first real inbound reply.
 * Prefer prospect_intelligence linkage — no schema migration.
 */

export type ColdOutreachHideSignal = {
  outreachConversationId?: string | null;
  outreachStatus?: string | null;
  repliedAt?: Date | string | null;
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

/** Build the set of conversation ids that should be omitted from Unified Inbox. */
export function collectHiddenColdOutreachConversationIds(
  signals: readonly ColdOutreachHideSignal[],
): Set<string> {
  const out = new Set<string>();
  for (const signal of signals) {
    if (!isColdProspectOutreachAwaitingReply(signal)) continue;
    out.add(String(signal.outreachConversationId).trim());
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
