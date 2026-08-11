/**
 * In-memory sanitized metrics + structured logs for Embedded Signup v4 rollout.
 * Process-local only (resets on deploy). Never stores tokens, codes, PINs, or full customer IDs.
 */

import {
  sanitizeEmbeddedSignupObservabilityPayload,
  idTail,
  type EmbeddedSignupObservabilityPayload,
} from "@shared/whatsappEmbeddedSignupObservability";
import type { EmbeddedSignupFailureCategory } from "@shared/whatsappEmbeddedSignupFailures";
import type { WhatsappEmbeddedSignupArchitecture } from "@shared/whatsappEmbeddedSignupVersion";
import {
  buildSanitizedV4RolloutConfigSummary,
  type WhatsappEmbeddedSignupV4RolloutMode,
} from "@shared/whatsappEmbeddedSignupRollout";

type ArchCounts = { v2: number; v4: number };

const attempts: ArchCounts = { v2: 0, v4: 0 };
const successes: ArchCounts = { v2: 0, v4: 0 };
const failuresByCategory: Record<string, number> = {};
let phoneRegistrationRequired = 0;
let phoneRegistrationCompleted = 0;
let duplicateCompletionBlocked = 0;
let rolloutDecisions = 0;

const COMPLETION_LOCK_TTL_MS = 120_000;
/** Hard cap so spam/crash paths cannot grow an unbounded Map. */
const MAX_COMPLETION_LOCKS = 256;
const completionLocks = new Map<string, number>();

function pruneCompletionLocks(now: number): void {
  for (const [k, started] of completionLocks) {
    if (now - started > COMPLETION_LOCK_TTL_MS) completionLocks.delete(k);
  }
  while (completionLocks.size > MAX_COMPLETION_LOCKS) {
    const oldest = completionLocks.keys().next().value;
    if (oldest == null) break;
    completionLocks.delete(oldest);
  }
}

export function logWhatsappEmbeddedSignupEvent(
  payload: EmbeddedSignupObservabilityPayload,
): void {
  const safe = sanitizeEmbeddedSignupObservabilityPayload(payload);
  console.log(`[WhatsAppEmbeddedSignupEvent] ${JSON.stringify(safe)}`);
}

export function recordEmbeddedSignupRolloutDecision(params: {
  architecture: WhatsappEmbeddedSignupArchitecture;
  reason: string;
  rolloutMode: WhatsappEmbeddedSignupV4RolloutMode;
  rolloutPercent: number;
  rolloutBucket: number | null;
  userId: string;
}): void {
  rolloutDecisions += 1;
  logWhatsappEmbeddedSignupEvent({
    event: "rollout_decision",
    architecture: params.architecture,
    reason: params.reason,
    rolloutMode: params.rolloutMode,
    rolloutPercent: params.rolloutPercent,
    rolloutBucket: params.rolloutBucket,
    userIdTail: idTail(params.userId),
    flow: "embedded",
  });
  logWhatsappEmbeddedSignupEvent({
    event: "architecture_selected",
    architecture: params.architecture,
    reason: params.reason,
    userIdTail: idTail(params.userId),
    flow: "embedded",
  });
}

export function recordEmbeddedSignupAttempt(
  architecture: WhatsappEmbeddedSignupArchitecture,
): void {
  if (architecture === "v4") attempts.v4 += 1;
  else attempts.v2 += 1;
}

export function recordEmbeddedSignupSuccess(
  architecture: WhatsappEmbeddedSignupArchitecture,
  opts?: { needsPhoneRegistration?: boolean },
): void {
  if (architecture === "v4") successes.v4 += 1;
  else successes.v2 += 1;
  if (opts?.needsPhoneRegistration) phoneRegistrationRequired += 1;
  logWhatsappEmbeddedSignupEvent({
    event: "signup_complete",
    architecture,
    ok: true,
    detail: opts?.needsPhoneRegistration ? "needs_phone_registration" : "ready",
  });
}

export function recordEmbeddedSignupFailure(
  architecture: WhatsappEmbeddedSignupArchitecture | null | undefined,
  category: EmbeddedSignupFailureCategory,
): void {
  failuresByCategory[category] = (failuresByCategory[category] || 0) + 1;
  logWhatsappEmbeddedSignupEvent({
    event: "signup_complete",
    architecture: architecture || null,
    ok: false,
    failureCategory: category,
  });
}

export function recordPhoneRegistrationCompleted(): void {
  phoneRegistrationCompleted += 1;
  logWhatsappEmbeddedSignupEvent({
    event: "phone_registration",
    ok: true,
    detail: "completed",
  });
}

/** Claim one in-flight completion per oauth state token. */
export function tryClaimEmbeddedSignupCompletion(stateToken: string): boolean {
  const now = Date.now();
  pruneCompletionLocks(now);
  if (completionLocks.size >= MAX_COMPLETION_LOCKS && !completionLocks.has(stateToken)) {
    duplicateCompletionBlocked += 1;
    logWhatsappEmbeddedSignupEvent({
      event: "completion_duplicate_blocked",
      ok: false,
      failureCategory: "completion_in_progress",
      detail: "lock_capacity",
    });
    return false;
  }
  if (completionLocks.has(stateToken)) {
    duplicateCompletionBlocked += 1;
    logWhatsappEmbeddedSignupEvent({
      event: "completion_duplicate_blocked",
      ok: false,
      failureCategory: "completion_in_progress",
      detail: "in_flight",
    });
    return false;
  }
  completionLocks.set(stateToken, now);
  return true;
}

export function releaseEmbeddedSignupCompletion(stateToken: string): void {
  completionLocks.delete(stateToken);
}

/** Test helper — reset process-local counters/locks. */
export function resetEmbeddedSignupRolloutMetricsForTests(): void {
  attempts.v2 = 0;
  attempts.v4 = 0;
  successes.v2 = 0;
  successes.v4 = 0;
  for (const k of Object.keys(failuresByCategory)) delete failuresByCategory[k];
  phoneRegistrationRequired = 0;
  phoneRegistrationCompleted = 0;
  duplicateCompletionBlocked = 0;
  rolloutDecisions = 0;
  completionLocks.clear();
}

export function getEmbeddedSignupV4RolloutAdminSummary(options?: {
  oauthStatesSchemaAvailable?: boolean | null;
  env?: NodeJS.ProcessEnv;
}): Record<string, unknown> {
  const config = buildSanitizedV4RolloutConfigSummary(options?.env, {
    oauthStatesSchemaAvailable: options?.oauthStatesSchemaAvailable,
  });
  return {
    ...config,
    metrics: {
      rolloutDecisions,
      attemptsByArchitecture: { ...attempts },
      successesByArchitecture: { ...successes },
      failuresByCategory: { ...failuresByCategory },
      phoneRegistrationRequired,
      phoneRegistrationCompleted,
      duplicateCompletionBlocked,
    },
    notes: [
      "Metrics are process-local and reset on deploy/restart.",
      "No customer tokens, phone numbers, WABA IDs, authorization codes, PINs, or secrets are included.",
      "Coexistence remains unavailable for public Embedded Signup.",
    ],
  };
}
