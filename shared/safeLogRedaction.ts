/**
 * Safe logging helpers for Google Workspace / Gmail Limited Use compliance.
 * Never put email bodies, subjects, thread text, AI prompts, or AI responses in logs.
 */

export function isEmailMessagingChannel(channel: string | null | undefined): boolean {
  return String(channel || "")
    .trim()
    .toLowerCase() === "email";
}

/** Length-only metadata for any user/message text that must not appear in logs. */
export function safeTextLogMeta(text: string | null | undefined): {
  textLen: number;
  textRedacted: true;
} {
  return {
    textLen: String(text || "").length,
    textRedacted: true,
  };
}

/** Strip known content-bearing fields from a log payload (Gmail / AI safety). */
export function redactContentFieldsFromLogPayload<T extends Record<string, unknown>>(
  payload: T,
  extraKeys: string[] = [],
): T {
  const keys = new Set([
    "message",
    "latestMessage",
    "inboundText",
    "preview",
    "subject",
    "subjectPrefix",
    "snippet",
    "body",
    "htmlBody",
    "textBody",
    "transcript",
    "rawPreview",
    "aiSuggestionPreview",
    "prompt",
    "suggestion",
    "content",
    ...extraKeys,
  ]);
  const out: Record<string, unknown> = { ...payload };
  for (const key of keys) {
    if (!(key in out)) continue;
    const value = out[key];
    if (typeof value === "string") {
      out[key] = undefined;
      out[`${key}Len`] = value.length;
      out[`${key}Redacted`] = true;
    } else if (value != null) {
      out[key] = undefined;
      out[`${key}Redacted`] = true;
    }
  }
  return out as T;
}
