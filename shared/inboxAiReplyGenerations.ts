/**
 * INTERNAL meter: inbox AI reply generations.
 *
 * Scope: successful model generations via POST /api/ai/suggest-reply
 * (Inbox Suggest / Auto, and any Rewrite that uses the same service).
 *
 * Persisted on ai_usage.replies_suggested. Not a general "AI Assist credits" pool —
 * Prospect AI, Workflow AI, summaries, memory, lead extract, etc. are out of scope.
 *
 * Do not expose numeric ceilings or this meter name in customer-facing UI.
 */

import type { SubscriptionPlan } from "./schema";

/** Hidden monthly ceilings for inbox AI reply generations (abuse backstop). */
export const INBOX_AI_REPLY_GENERATIONS_MONTHLY = {
  free: 0,
  starter: 2_000,
  pro: 10_000,
} as const satisfies Record<SubscriptionPlan, number>;

/**
 * INTERNAL fair-use pause threshold (generations/month) above plan ceilings.
 * Soft-pauses with deliverability messaging — never shown as a numeric quota.
 */
export const INBOX_AI_REPLY_FAIR_USE_MONTHLY_THRESHOLD = 50_000;

/**
 * @deprecated Legacy name — use INBOX_AI_REPLY_GENERATIONS_MONTHLY.
 * Kept so existing imports/tests keep resolving during the rename.
 */
export const AI_ASSIST_MONTHLY_CREDITS = INBOX_AI_REPLY_GENERATIONS_MONTHLY;

/**
 * @deprecated Legacy name — use INBOX_AI_REPLY_FAIR_USE_MONTHLY_THRESHOLD.
 */
export const AI_ASSIST_FAIR_USE_MONTHLY_THRESHOLD = INBOX_AI_REPLY_FAIR_USE_MONTHLY_THRESHOLD;

/**
 * Active quota formula: replies_suggested only.
 *
 * `messages_generated` is a legacy DB column that is never incremented in this
 * codebase. It is intentionally excluded from the active meter so dead/historical
 * zeros cannot affect enforcement. Column retained — no migration/data delete.
 */
export function countInboxAiReplyGenerations(usage: {
  repliesSuggested?: number | null;
  /** @deprecated Never incremented; ignored by active quota formula. */
  messagesGenerated?: number | null;
} | null | undefined): number {
  return Math.max(0, usage?.repliesSuggested ?? 0);
}

/** True when the final user-facing reply has non-empty usable text. */
export function hasUsableInboxAiReplyText(text: string | null | undefined): boolean {
  return typeof text === "string" && text.trim().length > 0;
}

/**
 * Record exactly one unit when:
 * - the model was actually invoked
 * - the request completed successfully
 * - the final user-facing generated reply has non-empty usable text
 *
 * Empty / whitespace-only completions must not consume a generation
 * (log as empty_completion diagnostic at the call site).
 */
export function shouldRecordInboxAiReplyGeneration(opts: {
  modelWasInvoked: boolean;
  modelGenerationSucceeded: boolean;
  /** Final user-facing reply after post-processing (scheduling strip, etc.). */
  finalReplyText?: string | null;
}): boolean {
  return (
    opts.modelWasInvoked === true &&
    opts.modelGenerationSucceeded === true &&
    hasUsableInboxAiReplyText(opts.finalReplyText)
  );
}
