/** Owner / QA accounts that should not receive automated activation emails. */
const EXCLUDED_EMAILS = new Set([
  "yanivharamaty@gmail.com",
  "yahabegood@gmail.com",
]);

export type ActivationEmailUserDates = {
  createdAt?: Date | string | null;
  trialStartedAt?: Date | string | null;
  shopifyInstalledAt?: Date | string | null;
};

/** When Shopify is installed/reinstalled, onboarding emails anchor to that moment. */
export function activationStartAt(user: ActivationEmailUserDates): Date | null {
  if (user.shopifyInstalledAt) return new Date(user.shopifyInstalledAt);
  if (user.trialStartedAt) return new Date(user.trialStartedAt);
  if (user.createdAt) return new Date(user.createdAt);
  return null;
}

/** Full UTC calendar days elapsed since activation start (day 0 = start date). */
export function fullCalendarDaysSince(start: Date, now: Date): number {
  const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((nowUtc - startUtc) / (1000 * 60 * 60 * 24));
}

export function daysSinceActivationStart(
  user: ActivationEmailUserDates,
  now: Date,
): number {
  const start = activationStartAt(user);
  if (!start || Number.isNaN(start.getTime())) return 0;
  return fullCalendarDaysSince(start, now);
}

export function isExcludedFromActivationEmails(email: string | null | undefined): boolean {
  if (!email) return true;
  const lower = email.trim().toLowerCase();
  if (EXCLUDED_EMAILS.has(lower)) return true;
  if (lower.endsWith("@shopify.whachatcrm.com")) return true;
  if (lower.endsWith("@test.com")) return true;
  return false;
}
