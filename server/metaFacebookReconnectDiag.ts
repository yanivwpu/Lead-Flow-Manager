/**
 * Production-safe Facebook reconnect diagnostics.
 * Emits JSON lines to stdout for Railway — never logs raw tokens or token-bearing URLs.
 */

import { createHash, randomBytes } from "crypto";

export const FB_RECONNECT_DIAG_TAG = "[FB_RECONNECT_DIAG]";

export type MetaErrorSanitized = {
  httpStatus: number | null;
  code: number | string | null;
  errorSubcode: number | string | null;
  type: string | null;
  fbtraceId: string | null;
  message: string | null;
};

/** Short one-way fingerprint — never reversible to the token. */
export function facebookTokenFingerprint(token: unknown): string | null {
  const t = typeof token === "string" ? token.trim() : "";
  if (!t) return null;
  return createHash("sha256").update(t).digest("hex").slice(0, 12);
}

export function newFacebookReconnectCorrelationId(): string {
  return `fbrec_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

/** Strip token-like query values if a URL is ever passed by mistake. */
export function sanitizeMetaUrlForLog(url: string): string {
  try {
    const u = new URL(url);
    for (const key of ["access_token", "input_token", "fb_exchange_token", "client_secret"]) {
      if (u.searchParams.has(key)) u.searchParams.set(key, "[REDACTED]");
    }
    return `${u.origin}${u.pathname}${u.search}`;
  } catch {
    return String(url || "")
      .replace(/access_token=[^&]+/gi, "access_token=[REDACTED]")
      .replace(/input_token=[^&]+/gi, "input_token=[REDACTED]")
      .slice(0, 240);
  }
}

function redactTokenFragments(value: string): string {
  return value
    .replace(/access_token=[^\s&"]+/gi, "access_token=[REDACTED]")
    .replace(/input_token=[^\s&"]+/gi, "input_token=[REDACTED]");
}

/**
 * Extract Meta Graph error fields from a response body, a bare error object,
 * or a truncated errorText string (legacy health-fetch path).
 */
export function sanitizeMetaError(
  httpStatus: number | null | undefined,
  body: unknown,
  errorTextFallback?: string | null,
): MetaErrorSanitized {
  let err: Record<string, unknown> | null = null;
  if (body && typeof body === "object") {
    if ("error" in (body as object) && (body as { error?: unknown }).error && typeof (body as { error?: unknown }).error === "object") {
      err = (body as { error: Record<string, unknown> }).error;
    } else if ("code" in (body as object) || "message" in (body as object) || "fbtrace_id" in (body as object)) {
      err = body as Record<string, unknown>;
    }
  }
  if (!err && typeof errorTextFallback === "string" && errorTextFallback.trim()) {
    try {
      const parsed = JSON.parse(errorTextFallback) as unknown;
      if (parsed && typeof parsed === "object") {
        err = parsed as Record<string, unknown>;
      }
    } catch {
      // errorText may be truncated JSON or a plain http_400 marker — keep message fallback below
    }
  }
  const rawMessage =
    typeof err?.message === "string"
      ? err.message
      : !err && typeof errorTextFallback === "string" && errorTextFallback.trim() && !errorTextFallback.startsWith("http_")
        ? errorTextFallback
        : null;
  const message = rawMessage ? redactTokenFragments(rawMessage).slice(0, 220) : null;
  return {
    httpStatus: typeof httpStatus === "number" ? httpStatus : null,
    code: (err?.code as number | string | null | undefined) ?? null,
    errorSubcode: (err?.error_subcode as number | string | null | undefined) ?? null,
    type: typeof err?.type === "string" ? err.type : null,
    fbtraceId: typeof err?.fbtrace_id === "string" ? err.fbtrace_id : null,
    message,
  };
}

/** Compact Graph error object for Railway — same fields Meta returns, token-safe. */
export function graphErrorForDiag(
  httpStatus: number | null | undefined,
  body: unknown,
  errorTextFallback?: string | null,
): {
  httpStatus: number | null;
  code: number | string | null;
  error_subcode: number | string | null;
  type: string | null;
  message: string | null;
  fbtrace_id: string | null;
} | null {
  if (
    (typeof httpStatus !== "number" || httpStatus < 400) &&
    !body &&
    !errorTextFallback
  ) {
    return null;
  }
  const s = sanitizeMetaError(httpStatus, body, errorTextFallback);
  if (
    s.code == null &&
    s.errorSubcode == null &&
    s.type == null &&
    s.message == null &&
    s.fbtraceId == null &&
    (typeof httpStatus !== "number" || httpStatus < 400)
  ) {
    return null;
  }
  return {
    httpStatus: s.httpStatus,
    code: s.code,
    error_subcode: s.errorSubcode,
    type: s.type,
    message: s.message,
    fbtrace_id: s.fbtraceId,
  };
}

/**
 * Structured diagnostic line for Railway logs.
 * Never pass raw tokens or full OAuth pending sessions.
 */
export function logFacebookReconnectDiag(
  event: string,
  data: Record<string, unknown>,
): void {
  const payload = {
    tag: FB_RECONNECT_DIAG_TAG,
    event,
    ...data,
    ts: new Date().toISOString(),
  };
  console.log(`${FB_RECONNECT_DIAG_TAG} ${JSON.stringify(payload)}`);
}
