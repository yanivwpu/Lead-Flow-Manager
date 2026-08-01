/**
 * Lightweight conversation text signals shared by Copilot domain + seller intent.
 */

/** Greeting-only inbound — not enough evidence for high-intent Copilot actions. */
const GREETING_ONLY_RE =
  /^(?:hi+|hello+|hey+|howdy|hola+|yo+|sup)(?:\s+(?:there|all|folks|team))?[!?.\s]*$/i;
const GREETING_TIME_RE =
  /^(?:good\s+(?:morning|afternoon|evening))(?:\s+(?:there|all|folks|team))?[!?.\s]*$/i;

export function looksLikeGreetingOnly(text: string | null | undefined): boolean {
  const t = String(text || "").trim();
  if (!t || t.length > 48) return false;
  return GREETING_ONLY_RE.test(t) || GREETING_TIME_RE.test(t);
}
