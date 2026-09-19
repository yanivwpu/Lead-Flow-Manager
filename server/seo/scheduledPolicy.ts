export const SEO_SCHEDULED_MAX_ATTEMPTS = 3;
export const SEO_SCHEDULED_LEASE_MINUTES = 30;

export function scheduledClaimCanRetry(claim: { status: string; attempts: number; leaseExpiresAt: Date }, now: Date): boolean {
  if (claim.attempts >= SEO_SCHEDULED_MAX_ATTEMPTS || claim.status === "success") return false;
  return claim.status === "failed" || claim.status === "partial" || (claim.status === "running" && claim.leaseExpiresAt <= now);
}
