export type SessionProbeReason = "mount" | "focus" | "manual";

export function shouldSkipSessionProbe(params: {
  now: number;
  holdUntil: number;
  hasLocalUser: boolean;
  reason: SessionProbeReason;
}): boolean {
  if (params.now < params.holdUntil) return true;
  if (params.reason === "focus" && !params.hasLocalUser) return true;
  return false;
}

export function holdUntilAfterSessionStatus(
  status: number,
  retryAfterSec: number | null,
  now: number,
): number {
  if (status === 401) return now + 6 * 60 * 60 * 1000;
  if (status === 429) return now + Math.max(1, retryAfterSec ?? 900) * 1000;
  if (status === 0) return now + 8_000;
  return 0;
}
