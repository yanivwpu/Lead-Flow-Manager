/**
 * Source-aware GHL Marketplace grant evaluation.
 * Does not write users.billingPlan — the entitlement resolver consults this grant.
 */

import {
  classifyGhlMarketplacePlanId,
  type GhlMarketplacePlanConfig,
} from "./ghlMarketplacePlanIds";

/** Official APP_PAYMENT_STATUS.newStatus values. Do not invent extra names. */
export const GHL_MARKETPLACE_PAYMENT_STATUSES = ["COMPLETE", "FAILED", "PENDING"] as const;
export type GhlMarketplacePaymentStatus = (typeof GHL_MARKETPLACE_PAYMENT_STATUSES)[number];

export type GhlMarketplaceGrantSnapshot = {
  marketplacePlanId: string | null;
  paymentStatus: string | null;
  installationStatus: string | null;
  uninstallDate?: Date | string | null;
  whachatUserId?: string | null;
};

export function normalizeGhlMarketplacePaymentStatus(
  value: string | null | undefined,
): GhlMarketplacePaymentStatus | "unknown" | null {
  if (value == null || String(value).trim() === "") return null;
  const upper = String(value).trim().toUpperCase();
  if (upper === "COMPLETE" || upper === "FAILED" || upper === "PENDING") return upper;
  return "unknown";
}

function isUninstalledStatus(status: string | null | undefined): boolean {
  const normalized = String(status || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  return normalized === "uninstalled" || normalized === "uninstalledstatus";
}

/**
 * Active GHL Pro grant for this install row.
 * Fail closed: missing config, unknown plan ID, uninstall, FAILED, or unknown payment status.
 * PENDING (dunning) keeps access when the plan is the configured Pro ID.
 */
export function isActiveGhlMarketplaceProGrant(
  snapshot: GhlMarketplaceGrantSnapshot,
  config: GhlMarketplacePlanConfig,
): boolean {
  if (!config.configured) return false;
  if (snapshot.uninstallDate) return false;
  if (isUninstalledStatus(snapshot.installationStatus)) return false;

  const kind = classifyGhlMarketplacePlanId(snapshot.marketplacePlanId, config);
  if (kind !== "pro") return false;

  const payment = normalizeGhlMarketplacePaymentStatus(snapshot.paymentStatus);
  if (payment === "FAILED" || payment === "unknown") return false;
  return true;
}

export function userHasActiveGhlMarketplaceProGrant(
  userId: string,
  installs: GhlMarketplaceGrantSnapshot[],
  config: GhlMarketplacePlanConfig,
): boolean {
  if (!userId) return false;
  return installs.some(
    (row) => row.whachatUserId === userId && isActiveGhlMarketplaceProGrant(row, config),
  );
}

export function ghlUninstallIntegrationCredentialPatch(): {
  isActive: false;
  accessToken: null;
  refreshToken: null;
} {
  return { isActive: false, accessToken: null, refreshToken: null };
}
