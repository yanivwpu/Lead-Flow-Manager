/**
 * Retired built-in CRM Demo Agent identity.
 * Product login/signup must not recreate or accept this email.
 * Cleanup of the leftover workspace is a separate guarded script.
 */
export const RETIRED_CRM_DEMO_EMAIL = "demo@whachat.com";

export function normalizeRetiredCrmDemoEmail(email: string | null | undefined): string {
  return String(email || "").trim().toLowerCase();
}

export function isRetiredCrmDemoEmail(email: string | null | undefined): boolean {
  return normalizeRetiredCrmDemoEmail(email) === RETIRED_CRM_DEMO_EMAIL;
}
