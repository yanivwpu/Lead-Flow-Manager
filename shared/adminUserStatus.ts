/**
 * Sales Admin Users table — display-only account status.
 * Does not change auth, trial start, Stripe, or users.subscription_status.
 */

export type AdminUserStatus = "awaiting_verification" | "trial" | "active" | "expired";
export type AdminUserStatusFilter = "all" | AdminUserStatus;

export type AdminUserStatusFields = {
  emailVerificationStatus?: "verified" | "awaiting_verification" | null;
  emailVerifiedAt?: string | Date | null;
  isInTrial?: boolean;
  subscriptionStatus?: string | null;
  billingPlan?: string | null;
};

export function isAdminUserAwaitingVerification(user: AdminUserStatusFields): boolean {
  if (user.emailVerificationStatus === "awaiting_verification") return true;
  return user.emailVerifiedAt == null;
}

/**
 * Priority: awaiting verification → trial → active → expired.
 */
export function deriveAdminUserStatus(user: AdminUserStatusFields): AdminUserStatus {
  if (isAdminUserAwaitingVerification(user)) return "awaiting_verification";
  if (user.isInTrial) return "trial";

  const st = (user.subscriptionStatus || "").toLowerCase();
  if (st === "active" || st === "trialing") return "active";
  if (st === "canceled" || st === "cancelled" || st === "past_due" || st === "unpaid") {
    return "expired";
  }
  if ((user.billingPlan || "").toLowerCase() !== "free") return "active";
  return "expired";
}

export function adminUserStatusLabel(status: AdminUserStatus): string {
  if (status === "awaiting_verification") return "Awaiting verification";
  if (status === "trial") return "Trial";
  if (status === "active") return "Active";
  return "Expired";
}

export function adminUserMatchesStatusFilter(
  user: AdminUserStatusFields,
  filter: AdminUserStatusFilter,
): boolean {
  if (filter === "all") return true;
  return deriveAdminUserStatus(user) === filter;
}
