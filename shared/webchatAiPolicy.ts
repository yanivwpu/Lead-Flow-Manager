/**
 * Server-side webchat AI Brain auto-reply policy.
 * Auto is never inferred merely because AI Brain is available.
 */

function normalizeBusinessAiMode(raw: string | undefined | null): "off" | "suggest" | "auto" {
  const v = (raw || "").toLowerCase().trim();
  if (v === "full_auto" || v === "auto") return "auto";
  if (v === "suggest_only" || v === "suggest") return "suggest";
  return "off";
}

export function webchatAutoSendIdempotencyKey(userId: string, inboundMessageId: string): string {
  return `webchat_ai:${userId}:${inboundMessageId}`;
}

export type WebchatAiDecision =
  | "send_auto"
  | "suggest_only"
  | "skip_manual"
  | "skip_no_access"
  | "skip_flag_off"
  | "skip_widget_disabled"
  | "skip_chatbot_owns"
  | "skip_booking"
  | "skip_crm_fallback"
  | "skip_handoff"
  | "skip_ai_paused"
  | "skip_automations_paused"
  | "skip_opt_out"
  | "skip_rate_limit"
  | "skip_incomplete_safe"
  | "skip_lease_invalid"
  | "skip_generation_timeout";

export type WebchatAiPolicyInput = {
  rolloutEnabled: boolean;
  allowlisted: boolean;
  widgetEnabled: boolean;
  hasAiBrainAccess: boolean;
  planIsProOrTrial: boolean;
  aiModeRaw: string | null | undefined;
  chatbotOwnsReply: boolean;
  bookingOwnsReply?: boolean;
  crmFallbackOwnsReply?: boolean;
  handoffActive: boolean;
  aiPaused: boolean;
  automationsPaused: boolean;
  optedOut: boolean;
  rateLimited: boolean;
};

export function decideWebchatAiReply(input: WebchatAiPolicyInput): WebchatAiDecision {
  if (!input.rolloutEnabled && !input.allowlisted) return "skip_flag_off";
  if (!input.widgetEnabled) return "skip_widget_disabled";
  if (!input.hasAiBrainAccess || !input.planIsProOrTrial) return "skip_no_access";
  if (input.bookingOwnsReply) return "skip_booking";
  if (input.crmFallbackOwnsReply) return "skip_crm_fallback";
  if (input.chatbotOwnsReply) return "skip_chatbot_owns";
  if (input.handoffActive) return "skip_handoff";
  if (input.aiPaused) return "skip_ai_paused";
  if (input.automationsPaused) return "skip_automations_paused";
  if (input.optedOut) return "skip_opt_out";
  if (input.rateLimited) return "skip_rate_limit";
  const mode = normalizeBusinessAiMode(input.aiModeRaw);
  if (mode === "off") return "skip_manual";
  if (mode === "suggest") return "suggest_only";
  return "send_auto";
}

export type WebchatGenerationLease = {
  leaseId: string;
  epoch: number;
  inboundMessageId: string;
  startedAt: string;
  status: "pending" | "cancelled" | "completed";
};

export type ConversationAiControl = {
  paused: boolean;
  reason?: string;
  pausedAt?: string | null;
  pausedByUserId?: string | null;
  pausedByActor?: "visitor" | "system" | "user";
  generationEpoch: number;
  generationLease: WebchatGenerationLease | null;
  lastTurnOwner?: string;
  /** Durable chatbot Ask Question / consent wait. Must survive pause/resume spreads. */
  chatbotPendingInput?: unknown;
};

function readLease(raw: unknown): WebchatGenerationLease | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.leaseId !== "string" || !o.leaseId) return null;
  const status = o.status === "cancelled" || o.status === "completed" ? o.status : "pending";
  return {
    leaseId: o.leaseId,
    epoch: typeof o.epoch === "number" ? o.epoch : 0,
    inboundMessageId: typeof o.inboundMessageId === "string" ? o.inboundMessageId : "",
    startedAt: typeof o.startedAt === "string" ? o.startedAt : "",
    status,
  };
}

export function readConversationAiControl(raw: unknown): ConversationAiControl {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    paused: o.paused === true,
    reason: typeof o.reason === "string" ? o.reason : undefined,
    pausedAt: typeof o.pausedAt === "string" ? o.pausedAt : null,
    pausedByUserId: typeof o.pausedByUserId === "string" ? o.pausedByUserId : null,
    pausedByActor:
      o.pausedByActor === "visitor" || o.pausedByActor === "system" || o.pausedByActor === "user"
        ? o.pausedByActor
        : undefined,
    generationEpoch: typeof o.generationEpoch === "number" ? o.generationEpoch : 0,
    generationLease: readLease(o.generationLease),
    lastTurnOwner: typeof o.lastTurnOwner === "string" ? o.lastTurnOwner : undefined,
    chatbotPendingInput: o.chatbotPendingInput,
  };
}

function bumpEpoch(current: ConversationAiControl): number {
  return (current.generationEpoch || 0) + 1;
}

function cancelLease(lease: WebchatGenerationLease | null, epoch: number): WebchatGenerationLease | null {
  if (!lease) return null;
  return { ...lease, epoch, status: "cancelled" };
}

export function pauseAiControl(
  input: {
    reason: string;
    actor: ConversationAiControl["pausedByActor"];
    userId?: string | null;
    at?: string;
  },
  previous?: unknown,
): ConversationAiControl {
  const current = readConversationAiControl(previous);
  const epoch = bumpEpoch(current);
  return {
    paused: true,
    reason: input.reason,
    pausedAt: input.at || new Date().toISOString(),
    pausedByUserId: input.userId || null,
    pausedByActor: input.actor,
    generationEpoch: epoch,
    generationLease: cancelLease(current.generationLease, epoch),
    lastTurnOwner: current.lastTurnOwner,
    chatbotPendingInput: current.chatbotPendingInput,
  };
}

export function resumeAiControl(previous?: unknown): ConversationAiControl {
  const current = readConversationAiControl(previous);
  const epoch = bumpEpoch(current);
  return {
    paused: false,
    reason: undefined,
    pausedAt: null,
    pausedByUserId: null,
    pausedByActor: undefined,
    generationEpoch: epoch,
    generationLease: cancelLease(current.generationLease, epoch),
    lastTurnOwner: current.lastTurnOwner,
    chatbotPendingInput: current.chatbotPendingInput,
  };
}

export function acquireWebchatGenerationLease(input: {
  previous: unknown;
  leaseId: string;
  inboundMessageId: string;
  at?: string;
}): { ok: true; control: ConversationAiControl } | { ok: false; reason: "paused" } {
  const current = readConversationAiControl(input.previous);
  if (current.paused) return { ok: false, reason: "paused" };
  const epoch = bumpEpoch(current);
  return {
    ok: true,
    control: {
      ...current,
      generationEpoch: epoch,
      generationLease: {
        leaseId: input.leaseId,
        epoch,
        inboundMessageId: input.inboundMessageId,
        startedAt: input.at || new Date().toISOString(),
        status: "pending",
      },
    },
  };
}

export function completeWebchatGenerationLease(
  previous: unknown,
  leaseId: string,
): ConversationAiControl {
  const current = readConversationAiControl(previous);
  const lease = current.generationLease;
  if (!lease || lease.leaseId !== leaseId) return current;
  return {
    ...current,
    generationLease: { ...lease, status: "completed" },
  };
}

export function generationLeaseAllowsCommit(control: ConversationAiControl, leaseId: string): boolean {
  if (control.paused) return false;
  const lease = control.generationLease;
  if (!lease) return false;
  return (
    lease.leaseId === leaseId &&
    lease.status === "pending" &&
    lease.epoch === control.generationEpoch
  );
}

export const WEBCHAT_AI_GENERATION_TIMEOUT_MS = 20_000;
