export type LoginErrorKind = "invalid" | "rate_limited" | "server" | "network";

export type LoginAttemptResult = {
  ok: boolean;
  pendingVerification?: boolean;
  status?: number;
  retryAfterSec?: number | null;
  errorKind?: LoginErrorKind;
};

/** Parse Retry-After as delta-seconds or HTTP-date. */
export function parseRetryAfterHeader(header: string | null | undefined, now = Date.now()): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    return Math.max(1, parseInt(trimmed, 10));
  }
  const when = Date.parse(trimmed);
  if (Number.isNaN(when)) return null;
  return Math.max(1, Math.ceil((when - now) / 1000));
}

export function minutesFromRetryAfterSec(sec: number): number {
  return Math.max(1, Math.ceil(sec / 60));
}

export function formatLoginUserMessage(result: LoginAttemptResult): string {
  if (result.errorKind === "rate_limited") {
    const minutes = minutesFromRetryAfterSec(result.retryAfterSec || 900);
    return `Too many login attempts. Please wait ${minutes} minute${minutes === 1 ? "" : "s"} and try again.`;
  }
  if (result.errorKind === "server") {
    return "The server is temporarily unavailable. Please try again in a few minutes.";
  }
  if (result.errorKind === "network") {
    return "Connection problem. Check your network and try again.";
  }
  return "Invalid email or password";
}

export function classifyLoginHttpStatus(status: number): LoginErrorKind {
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server";
  return "invalid";
}
