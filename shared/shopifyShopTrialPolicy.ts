/**
 * Pure Shopify lifetime-trial policy (no DB).
 * One 14-day Pro + AI Brain trial per canonical shop, regardless of user identity.
 *
 * Retention: the shop-identifying ledger is kept through ordinary uninstall and
 * through deletion of the WhachatCRM user (original_user_id SET NULL) so a
 * reinstall cannot restart a trial. On a valid Shopify shop/redact webhook the
 * ledger row is deleted with the store's identifying data. A later reinstall
 * after completed redaction may qualify as a new shop trial because WhachatCRM
 * no longer retains identifying history. There is no approved legal basis to
 * keep the canonical domain, Shopify shop id, reversible identifier, or a
 * reusable stable hash after redaction.
 *
 * Ambiguous historical shops are recorded as blocked rows. Any ledger row,
 * including blocked rows, prevents an automatic trial grant. OAuth must never
 * resolve blocked_conflict / blocked_unknown_history by granting a trial;
 * those require explicit Admin/manual resolution.
 */
import { normalizeShopifyShopDomain } from "./shopifyBilling";
import { hasActivePaidPlan, type PaidSourceOptions } from "./trialEntitlements";
import type { User } from "./schema";

export const SHOPIFY_SHOP_TRIAL_DAYS = 14;
export const SHOPIFY_SHOP_TRIAL_PLAN = "pro_ai";

export const SHOPIFY_SHOP_TRIAL_LEDGER_STATUSES = [
  "granted",
  "backfilled",
  "blocked_conflict",
  "blocked_unknown_history",
] as const;

export type ShopifyShopTrialLedgerStatus = (typeof SHOPIFY_SHOP_TRIAL_LEDGER_STATUSES)[number];

export const SHOPIFY_SHOP_TRIAL_REDACT_POLICY =
  "On valid shop/redact the shop-identifying ledger row is deleted. A later reinstall may qualify as a new shop trial because WhachatCRM no longer retains identifying history. Ordinary uninstall does not delete the ledger. User deletion does not delete the ledger while the shop has not been redacted.";

export type ShopifyTrialBackfillCandidate = {
  canonicalShop: string | null | undefined;
  userId: string;
  trialStartedAt: Date | string | null;
  trialEndsAt: Date | string | null;
  trialPlan: string | null;
};

export type ShopifyTrialBackfillInsert = {
  canonicalShop: string;
  status: "backfilled";
  blockReason: null;
  trialStartedAt: Date;
  trialEndsAt: Date;
  trialPlan: string;
  trialConsumedAt: Date;
  originalUserId: string;
};

export type ShopifyTrialBackfillBlock = {
  canonicalShop: string;
  status: "blocked_conflict" | "blocked_unknown_history";
  blockReason: string;
  trialStartedAt: null;
  trialEndsAt: null;
  trialPlan: string;
  trialConsumedAt: Date;
  originalUserId: null;
};

/**
 * Historical names `skip_conflict` / `skip_no_trial` now insert durable blocked
 * rows instead of leaving the shop eligible for a later grant (fail-open).
 */
export type ShopifyTrialBackfillDecision =
  | { action: "insert"; row: ShopifyTrialBackfillInsert }
  | { action: "block_conflict"; row: ShopifyTrialBackfillBlock; skip_conflict: true }
  | { action: "block_unknown_history"; row: ShopifyTrialBackfillBlock; skip_no_trial: true }
  | { action: "skip_invalid_shop"; reason: string };

export type ShopifyShopTrialClaimDecision = {
  insert: boolean;
  grantUserTrial: boolean;
  reason:
    | "ledger_not_ready"
    | "ledger_exists"
    | "user_ineligible"
    | "grant"
    | "invalid_shop";
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function tupleKey(started: Date, ends: Date, plan: string): string {
  return `${started.toISOString()}|${ends.toISOString()}|${plan}`;
}

export function addShopifyTrialDays(start: Date, days = SHOPIFY_SHOP_TRIAL_DAYS): Date {
  const ends = new Date(start);
  ends.setDate(ends.getDate() + days);
  return ends;
}

export function shopifyInstallShouldGrantUserTrial(
  user: Pick<
    User,
    | "trialEndsAt"
    | "trialStartedAt"
    | "trialStatus"
    | "planOverrideEnabled"
    | "planOverride"
    | "billingPlan"
    | "subscriptionStatus"
    | "shopifyShop"
    | "shopifySubscriptionStatus"
  >,
  now: Date = new Date(),
  opts?: PaidSourceOptions,
): boolean {
  if (hasActivePaidPlan(user, now, opts)) return false;
  if (user.trialStatus === "expired") return false;
  if (user.trialEndsAt != null) return false;
  if (user.trialStartedAt != null) return false;
  return true;
}

/** Any persisted ledger row, including blocked historical records, blocks auto-grant. */
export function shopifyLedgerPreventsAutomaticGrant(
  ledgerRow: { status?: string | null } | null | undefined,
): boolean {
  return ledgerRow != null;
}

export function isBlockedShopifyShopTrialStatus(
  status: string | null | undefined,
): boolean {
  return status === "blocked_conflict" || status === "blocked_unknown_history";
}

/**
 * OAuth claim planner. Never grants when a ledger row already exists
 * (granted, backfilled, or blocked). Never grants while the startup backfill
 * is incomplete. Never resolves blocked rows by granting.
 */
export function decideShopifyShopTrialClaim(input: {
  canonicalShop?: string | null;
  ledgerReady: boolean;
  existingLedger: { status?: string | null } | null;
  userEligible: boolean;
}): ShopifyShopTrialClaimDecision {
  if (!normalizeShopifyShopDomain(input.canonicalShop ?? null)) {
    return { insert: false, grantUserTrial: false, reason: "invalid_shop" };
  }
  if (!input.ledgerReady) {
    return { insert: false, grantUserTrial: false, reason: "ledger_not_ready" };
  }
  if (shopifyLedgerPreventsAutomaticGrant(input.existingLedger)) {
    return { insert: false, grantUserTrial: false, reason: "ledger_exists" };
  }
  if (!input.userEligible) {
    return { insert: true, grantUserTrial: false, reason: "user_ineligible" };
  }
  return { insert: true, grantUserTrial: true, reason: "grant" };
}

/**
 * Group candidate user rows by canonical shop.
 * Unambiguous original dates → backfilled row (idempotent insert).
 * Conflicting dates → blocked_conflict (durable; OAuth cannot grant).
 * Canonical shop with no original trial dates → blocked_unknown_history.
 * Invalid shops cannot be recorded and cannot be granted via OAuth.
 */
export function decideShopifyShopTrialBackfill(
  candidates: ShopifyTrialBackfillCandidate[],
  now: Date = new Date(),
): ShopifyTrialBackfillDecision[] {
  const byShop = new Map<string, ShopifyTrialBackfillCandidate[]>();
  const decisions: ShopifyTrialBackfillDecision[] = [];

  for (const candidate of candidates) {
    const shop = normalizeShopifyShopDomain(candidate.canonicalShop);
    if (!shop) {
      decisions.push({ action: "skip_invalid_shop", reason: "invalid_or_missing_shop" });
      continue;
    }
    const list = byShop.get(shop) ?? [];
    list.push({ ...candidate, canonicalShop: shop });
    byShop.set(shop, list);
  }

  for (const [shop, rows] of byShop) {
    const dated = rows
      .map((row) => {
        const trialStartedAt = toDate(row.trialStartedAt);
        const trialEndsAt = toDate(row.trialEndsAt);
        if (!trialStartedAt || !trialEndsAt) return null;
        const trialPlan = (row.trialPlan || SHOPIFY_SHOP_TRIAL_PLAN).trim() || SHOPIFY_SHOP_TRIAL_PLAN;
        return { row, trialStartedAt, trialEndsAt, trialPlan };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);

    if (dated.length === 0) {
      decisions.push({
        action: "block_unknown_history",
        skip_no_trial: true,
        row: {
          canonicalShop: shop,
          status: "blocked_unknown_history",
          blockReason: "no_original_trial_dates",
          trialStartedAt: null,
          trialEndsAt: null,
          trialPlan: SHOPIFY_SHOP_TRIAL_PLAN,
          trialConsumedAt: now,
          originalUserId: null,
        },
      });
      continue;
    }

    const keys = new Set(dated.map((d) => tupleKey(d.trialStartedAt, d.trialEndsAt, d.trialPlan)));
    if (keys.size > 1) {
      decisions.push({
        action: "block_conflict",
        skip_conflict: true,
        row: {
          canonicalShop: shop,
          status: "blocked_conflict",
          blockReason: "conflicting_trial_dates",
          trialStartedAt: null,
          trialEndsAt: null,
          trialPlan: SHOPIFY_SHOP_TRIAL_PLAN,
          trialConsumedAt: now,
          originalUserId: null,
        },
      });
      continue;
    }

    dated.sort((a, b) => a.trialStartedAt.getTime() - b.trialStartedAt.getTime());
    const chosen = dated[0];
    decisions.push({
      action: "insert",
      row: {
        canonicalShop: shop,
        status: "backfilled",
        blockReason: null,
        trialStartedAt: chosen.trialStartedAt,
        trialEndsAt: chosen.trialEndsAt,
        trialPlan: chosen.trialPlan,
        trialConsumedAt: chosen.trialStartedAt,
        originalUserId: chosen.row.userId,
      },
    });
  }

  return decisions;
}
