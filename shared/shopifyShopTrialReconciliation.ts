/**
 * Read-only detection of Shopify installs that have no shopify_shop_trials row.
 * Used after deploying the ledger to find mixed-version OAuth/installs.
 * Never grants, restarts, or rewrites trial fields.
 */
import {
  normalizeShopifyShopDomain,
  shopDomainFromShopifySyntheticEmail,
} from "./shopifyBilling";

export type ShopifyInstallForReconciliation = {
  userId: string;
  shopifyShop?: string | null;
  email?: string | null;
  shopifyInstalledAt?: Date | string | null;
  createdAt?: Date | string | null;
  trialStartedAt?: Date | string | null;
  trialEndsAt?: Date | string | null;
};

export type ShopifyLedgerShop = {
  canonicalShop: string;
  status?: string | null;
};

export type MissingShopifyLedgerInstall = {
  canonicalShop: string;
  userId: string;
  source: "shopify_shop" | "synthetic_email";
  installedAtIso: string | null;
  createdAtIso: string | null;
  hasUserTrialDates: boolean;
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function iso(value: Date | string | null | undefined): string | null {
  const d = toDate(value);
  return d ? d.toISOString() : null;
}

export function canonicalShopFromInstall(
  user: Pick<ShopifyInstallForReconciliation, "shopifyShop" | "email">,
): { shop: string; source: "shopify_shop" | "synthetic_email" } | null {
  const fromShop = normalizeShopifyShopDomain(user.shopifyShop);
  if (fromShop) return { shop: fromShop, source: "shopify_shop" };
  const fromEmail = shopDomainFromShopifySyntheticEmail(user.email);
  if (fromEmail) return { shop: fromEmail, source: "synthetic_email" };
  return null;
}

export function shopifyInstallAnchorAt(
  user: Pick<ShopifyInstallForReconciliation, "shopifyInstalledAt" | "createdAt">,
): Date | null {
  return toDate(user.shopifyInstalledAt) ?? toDate(user.createdAt);
}

export function findShopifyInstallsMissingLedger(
  installs: ShopifyInstallForReconciliation[],
  ledger: ShopifyLedgerShop[],
  options?: { since?: Date | string | null },
): MissingShopifyLedgerInstall[] {
  const ledgerShops = new Set(
    ledger
      .map((row) => normalizeShopifyShopDomain(row.canonicalShop))
      .filter((shop): shop is string => Boolean(shop)),
  );
  const since = toDate(options?.since ?? null);
  const missing: MissingShopifyLedgerInstall[] = [];

  for (const user of installs) {
    const identified = canonicalShopFromInstall(user);
    if (!identified) continue;
    if (ledgerShops.has(identified.shop)) continue;
    const anchor = shopifyInstallAnchorAt(user);
    if (since && (!anchor || anchor.getTime() < since.getTime())) continue;
    missing.push({
      canonicalShop: identified.shop,
      userId: user.userId,
      source: identified.source,
      installedAtIso: iso(user.shopifyInstalledAt),
      createdAtIso: iso(user.createdAt),
      hasUserTrialDates: Boolean(toDate(user.trialStartedAt) && toDate(user.trialEndsAt)),
    });
  }

  return missing;
}

export function sanitizeMissingLedgerInstall(
  row: MissingShopifyLedgerInstall,
  shopHash: string,
): {
  shopHash: string;
  userId: string;
  userIdTail: string;
  source: MissingShopifyLedgerInstall["source"];
  installedAtIso: string | null;
  createdAtIso: string | null;
  hasUserTrialDates: boolean;
} {
  return {
    shopHash,
    userId: row.userId,
    userIdTail: row.userId.slice(-8).toLowerCase(),
    source: row.source,
    installedAtIso: row.installedAtIso,
    createdAtIso: row.createdAtIso,
    hasUserTrialDates: row.hasUserTrialDates,
  };
}
