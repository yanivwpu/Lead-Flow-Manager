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

export function sanitizeMetaError(
  httpStatus: number | null | undefined,
  body: unknown,
): MetaErrorSanitized {
  const err =
    body && typeof body === "object" && "error" in (body as object)
      ? ((body as { error?: Record<string, unknown> }).error || null)
      : body && typeof body === "object" && ("code" in (body as object) || "message" in (body as object))
        ? (body as Record<string, unknown>)
        : null;
  const message =
    typeof err?.message === "string"
      ? err.message.replace(/access_token=[^\s&]+/gi, "access_token=[REDACTED]").slice(0, 220)
      : null;
  return {
    httpStatus: typeof httpStatus === "number" ? httpStatus : null,
    code: (err?.code as number | string | null | undefined) ?? null,
    errorSubcode: (err?.error_subcode as number | string | null | undefined) ?? null,
    type: typeof err?.type === "string" ? err.type : null,
    fbtraceId: typeof err?.fbtrace_id === "string" ? err.fbtrace_id : null,
    message,
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
