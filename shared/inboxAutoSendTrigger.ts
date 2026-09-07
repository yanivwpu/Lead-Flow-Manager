/**
 * Inbox Auto may dispatch only for an inbound ID that arrives after the composer
 * has finished hydrating that conversation. Refresh, remount, conversation
 * switch, and polling of the same inbound ID must not send.
 */

export const INBOX_AUTO_LIVE_SKEW_MS = 2_000;

export type InboxAutoSendTriggerReason =
  | "live_inbound"
  | "not_auto"
  | "last_turn_not_inbound"
  | "historical_inbound"
  | "hydration_pending"
  | "hydration_baseline"
  | "thread_not_ready"
  | "missing_inbound_id"
  | "missing_inbound_timestamp"
  | "already_handled"
  | "inbound_timestamp_invalid";

export function shouldTriggerInboxAutoSend(input: {
  aiModeIsAuto: boolean;
  lastTurnIsInbound: boolean;
  lastInboundId?: string | null;
  lastInboundCreatedAt?: string | null;
  composerOpenedAtMs: number;
  alreadyHandledKey?: string | null;
  hydratedInboundId?: string | null;
  hydrationCaptured?: boolean;
  threadReady?: boolean;
  nowMs?: number;
}): { trigger: boolean; reason: InboxAutoSendTriggerReason; handleKey: string } {
  const handleKey = String(input.lastInboundId || "").trim();
  if (!input.aiModeIsAuto) {
    return { trigger: false, reason: "not_auto", handleKey };
  }
  if (input.threadReady === false) {
    return { trigger: false, reason: "thread_not_ready", handleKey };
  }
  if (input.hydrationCaptured !== true) {
    return { trigger: false, reason: "hydration_pending", handleKey };
  }
  if (!input.lastTurnIsInbound) {
    return { trigger: false, reason: "last_turn_not_inbound", handleKey };
  }
  if (!handleKey) {
    return { trigger: false, reason: "missing_inbound_id", handleKey };
  }
  if (input.alreadyHandledKey === handleKey) {
    return { trigger: false, reason: "already_handled", handleKey };
  }
  if (handleKey === String(input.hydratedInboundId || "").trim()) {
    return { trigger: false, reason: "hydration_baseline", handleKey };
  }
  const created = input.lastInboundCreatedAt ? Date.parse(input.lastInboundCreatedAt) : NaN;
  if (!Number.isFinite(created)) {
    return { trigger: false, reason: "missing_inbound_timestamp", handleKey };
  }
  const now = input.nowMs ?? Date.now();
  if (created > now + 60_000) {
    return { trigger: false, reason: "inbound_timestamp_invalid", handleKey };
  }
  if (created < input.composerOpenedAtMs - INBOX_AUTO_LIVE_SKEW_MS) {
    return { trigger: false, reason: "historical_inbound", handleKey };
  }
  return { trigger: true, reason: "live_inbound", handleKey };
}

export function isAutomatedInboxSendSource(source: unknown): boolean {
  return String(source || "").trim() === "ai_auto";
}
