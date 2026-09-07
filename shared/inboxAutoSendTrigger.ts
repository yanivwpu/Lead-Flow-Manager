/**
 * Inbox Auto dispatches only for inbound IDs that appear after a conversation
 * has been snapshotted once. Polling, refetch, and composer remounts must not
 * recapture that baseline or replay historical turns.
 */

export type InboxAutoSendTriggerReason =
  | "live_inbound"
  | "not_auto"
  | "last_turn_not_inbound"
  | "historical_inbound"
  | "hydration_pending"
  | "hydration_baseline"
  | "thread_not_ready"
  | "missing_inbound_id"
  | "already_handled"
  | "in_flight";

export type InboxAutoSession = {
  scopeKey: string;
  captured: boolean;
  baselineIds: string[];
  handledIds: string[];
  inFlightId: string | null;
};

export type InboxAutoDecision = {
  session: InboxAutoSession;
  trigger: boolean;
  reason: InboxAutoSendTriggerReason;
  handleKey: string;
  supersedeInFlight: boolean;
};

const sessions = new Map<string, InboxAutoSession>();

export function inboxAutoScopeKey(
  conversationId: string | null | undefined,
  contactId: string | null | undefined,
): string {
  return `${String(contactId || "").trim()}::${String(conversationId || "").trim()}`;
}

export function isUsableInboxAutoScopeKey(scopeKey: string): boolean {
  const [, conversationId] = scopeKey.split("::");
  return Boolean(conversationId);
}

function cloneSession(session: InboxAutoSession): InboxAutoSession {
  return {
    scopeKey: session.scopeKey,
    captured: session.captured,
    baselineIds: [...session.baselineIds],
    handledIds: [...session.handledIds],
    inFlightId: session.inFlightId,
  };
}

function emptySession(scopeKey: string): InboxAutoSession {
  return {
    scopeKey,
    captured: false,
    baselineIds: [],
    handledIds: [],
    inFlightId: null,
  };
}

export function loadInboxAutoSession(scopeKey: string): InboxAutoSession {
  if (!isUsableInboxAutoScopeKey(scopeKey)) return emptySession(scopeKey);
  const existing = sessions.get(scopeKey);
  return existing ? cloneSession(existing) : emptySession(scopeKey);
}

export function saveInboxAutoSession(session: InboxAutoSession): void {
  if (!isUsableInboxAutoScopeKey(session.scopeKey)) return;
  sessions.set(session.scopeKey, cloneSession(session));
}

export function resetInboxAutoSessionsForTests(): void {
  sessions.clear();
}

/** Short non-identifying fingerprint for client diagnostics. Never log raw IDs. */
export function fingerprintInboxAutoKey(raw: string): string {
  const value = String(raw || "");
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const key = String(id || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function reduceInboxAutoSession(
  session: InboxAutoSession,
  event:
    | { type: "thread_ready"; inboundIds: Array<string | null | undefined> }
    | {
        type: "poll";
        lastInboundId?: string | null;
        lastTurnIsInbound: boolean;
        aiModeIsAuto: boolean;
        threadReady: boolean;
      }
    | { type: "started"; inboundId: string }
    | { type: "finished"; inboundId: string },
): InboxAutoDecision {
  const next = cloneSession(session);
  const noTrigger = (reason: InboxAutoSendTriggerReason, handleKey = ""): InboxAutoDecision => ({
    session: next,
    trigger: false,
    reason,
    handleKey,
    supersedeInFlight: false,
  });

  if (event.type === "thread_ready") {
    if (next.captured) {
      return noTrigger("hydration_baseline");
    }
    next.captured = true;
    next.baselineIds = uniqueIds(event.inboundIds);
    return noTrigger("hydration_pending");
  }

  if (event.type === "started") {
    const handleKey = String(event.inboundId || "").trim();
    next.inFlightId = handleKey || next.inFlightId;
    if (handleKey && !next.handledIds.includes(handleKey)) next.handledIds.push(handleKey);
    return noTrigger("in_flight", handleKey);
  }

  if (event.type === "finished") {
    const handleKey = String(event.inboundId || "").trim();
    if (next.inFlightId === handleKey) next.inFlightId = null;
    if (handleKey && !next.handledIds.includes(handleKey)) next.handledIds.push(handleKey);
    return noTrigger("already_handled", handleKey);
  }

  const handleKey = String(event.lastInboundId || "").trim();
  if (!event.aiModeIsAuto) return noTrigger("not_auto", handleKey);
  if (event.threadReady === false) return noTrigger("thread_not_ready", handleKey);
  if (!next.captured) return noTrigger("hydration_pending", handleKey);
  if (!event.lastTurnIsInbound) return noTrigger("last_turn_not_inbound", handleKey);
  if (!handleKey) return noTrigger("missing_inbound_id", handleKey);
  if (next.handledIds.includes(handleKey) || next.inFlightId === handleKey) {
    return noTrigger("already_handled", handleKey);
  }
  if (next.baselineIds.includes(handleKey)) {
    return noTrigger("hydration_baseline", handleKey);
  }

  const supersedeInFlight = Boolean(next.inFlightId && next.inFlightId !== handleKey);
  if (supersedeInFlight && next.inFlightId && !next.handledIds.includes(next.inFlightId)) {
    next.handledIds.push(next.inFlightId);
  }
  return {
    session: next,
    trigger: true,
    reason: "live_inbound",
    handleKey,
    supersedeInFlight,
  };
}

/**
 * Compatibility helper for unit tests. Conversation sessions should use
 * reduceInboxAutoSession so polling cannot recapture the baseline.
 */
export function shouldTriggerInboxAutoSend(input: {
  aiModeIsAuto: boolean;
  lastTurnIsInbound: boolean;
  lastInboundId?: string | null;
  lastInboundCreatedAt?: string | null;
  composerOpenedAtMs?: number;
  alreadyHandledKey?: string | null;
  hydratedInboundId?: string | null;
  baselineInboundIds?: string[] | null;
  hydrationCaptured?: boolean;
  threadReady?: boolean;
  nowMs?: number;
}): { trigger: boolean; reason: InboxAutoSendTriggerReason; handleKey: string } {
  const baselineIds =
    input.baselineInboundIds ??
    (input.hydratedInboundId != null ? uniqueIds([input.hydratedInboundId]) : []);
  const handledIds = input.alreadyHandledKey ? uniqueIds([input.alreadyHandledKey]) : [];
  const session: InboxAutoSession = {
    scopeKey: "compat",
    captured: input.hydrationCaptured === true,
    baselineIds,
    handledIds,
    inFlightId: null,
  };
  const decision = reduceInboxAutoSession(session, {
    type: "poll",
    lastInboundId: input.lastInboundId,
    lastTurnIsInbound: input.lastTurnIsInbound,
    aiModeIsAuto: input.aiModeIsAuto,
    threadReady: input.threadReady !== false,
  });
  return {
    trigger: decision.trigger,
    reason: decision.reason,
    handleKey: decision.handleKey,
  };
}

export function isAutomatedInboxSendSource(source: unknown): boolean {
  return String(source || "").trim() === "ai_auto";
}
