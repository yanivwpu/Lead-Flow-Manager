/**
 * Shopify-specific Day 0 / Day 5 / Day 10 onboarding emails.
 * Independent of the public-web activation sequence.
 *
 * Recipient is users.shopifyOwnerEmail (Shopify Admin shop.email).
 * Never send to synthetic users.email (*@shopify.whachatcrm.com).
 */
import {
  isExcludedFromActivationEmails,
  isShopifyLinkedAccount,
} from "./activationEmailEligibility";
import {
  isShopifySyntheticMerchantEmail,
  sanitizeShopifyOwnerEmail,
} from "./shopifyBilling";

export { isShopifyLinkedAccount };

export const SHOPIFY_ONBOARDING_DAY5_THRESHOLD = 5;
export const SHOPIFY_ONBOARDING_DAY10_THRESHOLD = 10;

export type ShopifyOnboardingUser = {
  email?: string | null;
  shopifyShop?: string | null;
  shopifyInstalledAt?: Date | string | null;
  shopifySubscriptionStatus?: string | null;
  shopifyOwnerEmail?: string | null;
  shopifyWelcomeEmailSentAt?: Date | string | null;
  shopifyActivationEmailDay5SentAt?: Date | string | null;
  shopifyActivationEmailDay10SentAt?: Date | string | null;
  deletionRequestedAt?: Date | string | null;
};

export function shopifyOnboardingStatus(user: {
  shopifySubscriptionStatus?: string | null;
}): string {
  return (user.shopifySubscriptionStatus || "").trim().toLowerCase();
}

/** Installed (pending/active/cancelled billing) — not uninstalled or GDPR-redacted. */
export function isShopifyInstallActiveForOnboarding(user: {
  shopifyShop?: string | null;
  shopifySubscriptionStatus?: string | null;
}): boolean {
  if (!user.shopifyShop) return false;
  const status = shopifyOnboardingStatus(user);
  if (status === "uninstalled" || status === "redacted") return false;
  return true;
}

export function usableShopifyOwnerEmail(
  ownerEmail: string | null | undefined,
): string | null {
  const sanitized = sanitizeShopifyOwnerEmail(ownerEmail);
  if (!sanitized) return null;
  if (isShopifySyntheticMerchantEmail(sanitized)) return null;
  if (isExcludedFromActivationEmails(sanitized)) return null;
  return sanitized;
}

/**
 * Clock for Shopify Day 5 / Day 10. Original shopifyInstalledAt only.
 * Reinstall must not pass a new date (callers keep shopifyInstalledAt via ??).
 */
export function shopifyOnboardingStartAt(user: {
  shopifyInstalledAt?: Date | string | null;
}): Date | null {
  if (!user.shopifyInstalledAt) return null;
  const start = new Date(user.shopifyInstalledAt);
  return Number.isNaN(start.getTime()) ? null : start;
}

export type ShopifyOnboardingSequenceAction =
  | { action: "welcome" }
  | { action: "day5" }
  | { action: "day10"; alsoCompleteDay5: boolean }
  | { action: "mark_complete" }
  | { action: "none" };

/**
 * One Shopify onboarding email per cron run.
 * Day 0 retry wins so a failed install send is not skipped for Day 5/10 in the same pass.
 */
export function chooseShopifyOnboardingSequenceAction(opts: {
  welcomeSent: boolean;
  day5Sent: boolean;
  day10Sent: boolean;
  daysSinceInstall: number;
  hasQualifyingChannel: boolean;
  hasUsableOwnerEmail: boolean;
}): ShopifyOnboardingSequenceAction {
  if (!opts.welcomeSent && opts.hasUsableOwnerEmail) {
    return { action: "welcome" };
  }
  if (opts.hasQualifyingChannel) {
    return opts.day5Sent && opts.day10Sent ? { action: "none" } : { action: "mark_complete" };
  }
  if (!opts.hasUsableOwnerEmail) return { action: "none" };
  if (opts.daysSinceInstall >= SHOPIFY_ONBOARDING_DAY10_THRESHOLD && !opts.day10Sent) {
    return { action: "day10", alsoCompleteDay5: !opts.day5Sent };
  }
  if (opts.daysSinceInstall >= SHOPIFY_ONBOARDING_DAY5_THRESHOLD && !opts.day5Sent) {
    return { action: "day5" };
  }
  return { action: "none" };
}

export function shouldProcessShopifyOnboardingUser(user: ShopifyOnboardingUser): boolean {
  if (user.deletionRequestedAt) return false;
  return isShopifyInstallActiveForOnboarding(user);
}
