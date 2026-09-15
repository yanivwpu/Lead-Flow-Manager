/**
 * Visitor-facing recovery when Web Chat generation fails or returns empty.
 * Must not claim prices, availability, URLs, or product facts.
 */

import { normalizeWidgetStaticLocale, type WidgetStaticLocale } from "./webchatWidgetLocale";

export const WEBCHAT_GENERATION_RECOVERY_REASON = "ok_generation_recovery" as const;

const RECOVERY: Record<WidgetStaticLocale, string> = {
  en: "Sorry—I couldn't complete that response. Could you try asking that another way?",
  es: "Perdón, no pude completar esa respuesta. ¿Puedes preguntarlo de otra forma?",
  he: "סליחה, לא הצלחתי להשלים את התשובה. אפשר לנסות לנסח את זה אחרת?",
};

export function webchatGenerationRecoveryMessage(locale?: string | null): string {
  return RECOVERY[normalizeWidgetStaticLocale(locale)];
}

export function isWebchatGenerationRecovery(text: unknown): boolean {
  const t = String(text || "").trim();
  if (!t) return false;
  return Object.values(RECOVERY).some((line) => line === t);
}

export type WebchatGenerationFailureClass =
  | "provider_error"
  | "timeout"
  | "aborted"
  | "empty"
  | "malformed"
  | "evidence"
  | "formatter"
  | "none";

export function classifyWebchatGenerationFailure(err: unknown, empty: boolean): WebchatGenerationFailureClass {
  if (empty) return "empty";
  const name = err instanceof Error ? err.name : "";
  const message = err instanceof Error ? err.message : "";
  if (name === "AbortError" && message !== "generation_timeout") return "aborted";
  if (name === "TimeoutError" || message === "generation_timeout") return "timeout";
  if (/json|parse|malformed|unexpected token|syntaxerror/i.test(name + message)) return "malformed";
  if (/evidence/i.test(message)) return "evidence";
  if (/formatter/i.test(message)) return "formatter";
  if (err) return "provider_error";
  return "none";
}

/** Conversation-safe code for logs. Never the raw error message. */
export function safeGenerationErrorCode(err: unknown, empty: boolean): string {
  const cls = classifyWebchatGenerationFailure(err, empty);
  return cls === "none" ? "unknown" : cls;
}
