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

/**
 * Central HTTP / auth logging policy.
 * Recursively redacts credentials, tokens, PII, and public ingress identifiers.
 * Never used as a reason to log full response bodies — omit bodies entirely.
 */
const SENSITIVE_KEY_RE =
  /password|passwd|pwd|secret|token|authorization|cookie|session|email|phone|whatsapp|telegram|tiktok|widgetpublic|widget_public|shopify|access_token|refresh_token|apikey|api_key|privatekey|private_key|credential|hash|otp|webhook|encryption|clientsecret|client_secret|instagramid|facebookid|bearer|set-cookie|csrf|ssn|public_id|publicid|botsecret|verifytoken/i;

export function isSensitiveLogKey(key: string): boolean {
  const compact = String(key || "").replace(/[-_]/g, "");
  return SENSITIVE_KEY_RE.test(String(key || "")) || SENSITIVE_KEY_RE.test(compact);
}

export function redactSensitiveForLog(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (value == null) return value;
  if (typeof value === "string") {
    if (value.length > 240) return `[redacted:${value.length}chars]`;
    return value;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redactSensitiveForLog(item, depth + 1));
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const keys = Object.keys(obj).slice(0, 60);
  for (const key of keys) {
    if (isSensitiveLogKey(key)) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = redactSensitiveForLog(obj[key], depth + 1);
  }
  return out;
}

export type HttpAccessLogFields = {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  requestId?: string | null;
  limiter?: string | null;
};

/** Safe API access line: route metadata only — never request/response bodies. */
export function formatHttpAccessLog(fields: HttpAccessLogFields): string {
  const payload: Record<string, unknown> = {
    tag: "[HTTP]",
    method: fields.method,
    path: fields.path,
    status: fields.status,
    durationMs: fields.durationMs,
  };
  if (fields.requestId) payload.requestId = fields.requestId;
  if (fields.limiter) payload.limiter = fields.limiter;
  return JSON.stringify(payload);
}

/** True when a serialized log line appears to contain raw secrets or PII values. */
export function logLineLooksUnsafe(line: string): boolean {
  const text = String(line || "");
  if (/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{20,}/.test(text)) return true;
  if (/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\./.test(text)) return true;
  if (/\b(?:wgt|tgk|ttk)_[A-Za-z0-9]{8,}\b/.test(text)) return true;
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) return true;
  return false;
}
