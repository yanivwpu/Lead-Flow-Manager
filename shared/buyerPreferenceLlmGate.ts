/**
 * Google Workspace Limited Use — do not auto-send Gmail thread text to OpenAI
 * via background buyer-preference LLM extraction.
 */

/** True when automatic buyer-preference LLM must be skipped for this conversation channel. */
export function shouldSkipAutomaticBuyerPreferenceLlmForChannel(
  channel: string | null | undefined,
): boolean {
  return String(channel || "")
    .trim()
    .toLowerCase() === "email";
}
