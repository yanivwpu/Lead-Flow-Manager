/**
 * In-memory traceId lifecycle — ties async extraction, inventory refresh, and suggest-reply
 * to the originating inbound message when messageId is known.
 */
const TTL_MS = 30 * 60 * 1000;

type TraceEntry = {
  traceId: string;
  messageId: string | null;
  conversationId: string | null;
  updatedAt: number;
};

const byContact = new Map<string, TraceEntry>();

export function buildBuyerMatchingTraceId(
  contactId: string,
  messageId?: string | null,
  refreshAt?: number,
): string {
  const id = contactId.trim();
  if (!id) return `unknown:refresh:${refreshAt ?? Date.now()}`;
  if (messageId?.trim()) return `${id}:${messageId.trim()}`;
  return `${id}:refresh:${refreshAt ?? Date.now()}`;
}

export function bindBuyerMatchingTrace(params: {
  contactId: string;
  messageId?: string | null;
  conversationId?: string | null;
  refreshAt?: number;
}): string {
  const traceId = buildBuyerMatchingTraceId(
    params.contactId,
    params.messageId,
    params.refreshAt,
  );
  byContact.set(params.contactId, {
    traceId,
    messageId: params.messageId?.trim() || null,
    conversationId: params.conversationId?.trim() || null,
    updatedAt: Date.now(),
  });
  return traceId;
}

export function getBoundBuyerMatchingTraceId(contactId: string): string | null {
  const entry = byContact.get(contactId);
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > TTL_MS) {
    byContact.delete(contactId);
    return null;
  }
  return entry.traceId;
}

/** Reuse bound trace when messageId absent; bind refresh trace only when none exists. */
export function resolveBuyerMatchingTraceId(
  contactId: string,
  messageId?: string | null,
  conversationId?: string | null,
): string {
  if (messageId?.trim()) {
    return bindBuyerMatchingTrace({ contactId, messageId, conversationId });
  }
  const existing = getBoundBuyerMatchingTraceId(contactId);
  if (existing) return existing;
  return bindBuyerMatchingTrace({ contactId, conversationId, refreshAt: Date.now() });
}

/** Test helper */
export function resetBuyerMatchingTraceRegistryForTests(): void {
  byContact.clear();
}
