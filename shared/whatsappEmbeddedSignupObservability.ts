/**
 * Sanitized structured observability for WhatsApp Embedded Signup.
 * Never log tokens, authorization codes, PINs, OAuth state, app secret, or webhook verify token.
 */

import type { WhatsappEmbeddedSignupArchitecture } from "./whatsappEmbeddedSignupVersion";
import type { WhatsappEmbeddedSignupV4RolloutMode } from "./whatsappEmbeddedSignupRollout";
import type { EmbeddedSignupFailureCategory } from "./whatsappEmbeddedSignupFailures";

export const EMBEDDED_SIGNUP_OBSERVABILITY_EVENTS = [
  "rollout_decision",
  "architecture_selected",
  "signup_started",
  "meta_session_event",
  "oauth_code_received",
  "code_exchange",
  "asset_validation",
  "webhook_subscription",
  "phone_registration",
  "signup_complete",
  "completion_duplicate_blocked",
] as const;

export type EmbeddedSignupObservabilityEvent =
  (typeof EMBEDDED_SIGNUP_OBSERVABILITY_EVENTS)[number];

export type EmbeddedSignupObservabilityPayload = {
  event: EmbeddedSignupObservabilityEvent;
  architecture?: WhatsappEmbeddedSignupArchitecture | null;
  flow?: "embedded" | "coexistence" | null;
  reason?: string | null;
  rolloutMode?: WhatsappEmbeddedSignupV4RolloutMode | null;
  rolloutPercent?: number | null;
  rolloutBucket?: number | null;
  ok?: boolean;
  failureCategory?: EmbeddedSignupFailureCategory | null;
  phaseMs?: number | null;
  /** Last 8 of opaque ids only — never full WABA/phone/user ids in logs if avoidable. */
  userIdTail?: string | null;
  detail?: string | null;
};

const SENSITIVE_KEY =
  /(token|secret|password|pin|authorization|code|state|verify|access_token|app_secret|waba|phone|email|redirect_uri)/i;

export function redactEmbeddedSignupLogValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY.test(key)) return "[redacted]";
  if (typeof value === "string") {
    // Never emit long opaque secrets / codes even under safe key names.
    if (value.length > 64 && /[A-Za-z0-9_-]{40,}/.test(value)) {
      return `[redacted_len_${value.length}]`;
    }
    // Heuristic: email-shaped values.
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "[redacted_email]";
  }
  return value;
}

export function sanitizeEmbeddedSignupObservabilityPayload(
  payload: EmbeddedSignupObservabilityPayload,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v === undefined) continue;
    out[k] = redactEmbeddedSignupLogValue(k, v);
  }
  return out;
}

export function idTail(value: string | null | undefined, n = 8): string | null {
  const s = String(value || "").trim();
  if (!s) return null;
  return s.length <= n ? s : s.slice(-n);
}
