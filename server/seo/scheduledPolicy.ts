export const SEO_SCHEDULED_MAX_ATTEMPTS = 3;
export const SEO_SCHEDULED_LEASE_MINUTES = 30;
export const SEO_SCHEDULED_HEARTBEAT_MINUTES = 10;
export const SEO_SCHEDULED_WINDOW_START_MINUTE_UTC = 4 * 60 + 20;
export const SEO_SCHEDULED_WINDOW_END_MINUTE_UTC = 6 * 60 + 30;
export type SeoScheduledDisposition = "complete" | "retryable" | "non_retryable";

const TERMINAL_PARTIAL_CODES = new Set(["DAILY_ROW_CAP_TRUNCATED", "OVERALL_AND_DAILY_ROW_CAP_TRUNCATED"]);
const NON_RETRYABLE_FAILURE_CODES = new Set(["MISSING_CONFIGURATION", "AUTHENTICATION_FAILED", "PERMISSION_DENIED", "VALIDATION_ERROR"]);

export function seoScheduledRetryDisposition(status: "success" | "partial" | "failed", errorCode?: string | null): SeoScheduledDisposition {
  if (status === "success" || (status === "partial" && TERMINAL_PARTIAL_CODES.has(errorCode ?? ""))) return "complete";
  if (status === "failed" && NON_RETRYABLE_FAILURE_CODES.has(errorCode ?? "")) return "non_retryable";
  return "retryable";
}

export function isWithinScheduledSeoRecoveryWindow(now: Date): boolean {
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  return minute >= SEO_SCHEDULED_WINDOW_START_MINUTE_UTC && minute <= SEO_SCHEDULED_WINDOW_END_MINUTE_UTC;
}

export function scheduledClaimKey(propertyId: string, reportingDay: string): string {
  return `${propertyId}\0${reportingDay}`;
}

export function scheduledClaimCanRetry(claim: { status: string; attempts: number; leaseExpiresAt: Date }, now: Date): boolean {
  if (claim.attempts >= SEO_SCHEDULED_MAX_ATTEMPTS || claim.status === "success") return false;
  return claim.status === "failed" || claim.status === "partial" || (claim.status === "running" && claim.leaseExpiresAt <= now);
}
