/** Owner / QA accounts that should not receive automated activation emails. */
const EXCLUDED_EMAILS = new Set([
  "yanivharamaty@gmail.com",
  "yahabegood@gmail.com",
]);

export type ActivationEmailUserDates = {
  createdAt?: Date | string | null;
  trialStartedAt?: Date | string | null;
  shopifyInstalledAt?: Date | string | null;
  emailVerifiedAt?: Date | string | null;
};

/**
 * When Shopify is installed/reinstalled, onboarding emails anchor to that moment.
 * Public signup anchors to trial start (set at email verification), not account creation.
 */
export function activationStartAt(user: ActivationEmailUserDates): Date | null {
  if (user.shopifyInstalledAt) return new Date(user.shopifyInstalledAt);
  if (user.trialStartedAt) return new Date(user.trialStartedAt);
  // Do not fall back to createdAt for unverified pending public signups
  if (user.emailVerifiedAt) return new Date(user.emailVerifiedAt);
  return null;
}

/** Pending public-signup accounts must not receive activation / onboarding sequences. */
export function isEligibleForActivationEmails(user: {
  email?: string | null;
  emailVerifiedAt?: Date | string | null;
  shopifyInstalledAt?: Date | string | null;
  trialStartedAt?: Date | string | null;
}): boolean {
  if (isExcludedFromActivationEmails(user.email)) return false;
  if (user.shopifyInstalledAt) return true;
  if (!user.emailVerifiedAt) return false;
  if (!user.trialStartedAt && !user.emailVerifiedAt) return false;
  return true;
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
