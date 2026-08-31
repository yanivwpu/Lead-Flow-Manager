/**
 * Atomic Shopify shop-lifetime trial claim.
 * One 14-day Pro + AI Brain trial per canonical shop, independent of user row identity.
 * Any existing ledger row (granted, backfilled, or blocked) prevents a grant.
 */
import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { shopifyShopTrials, users, type User } from "@shared/schema";
import { normalizeShopifyShopDomain } from "@shared/shopifyBilling";
import {
  addShopifyTrialDays,
  shopifyInstallShouldGrantUserTrial,
  SHOPIFY_SHOP_TRIAL_PLAN,
} from "@shared/shopifyShopTrialPolicy";
import { db } from "../drizzle/db";
import { isShopifyShopTrialLedgerReady } from "./shopifyShopTrialLedgerReady";
import { userHasActiveGhlMarketplacePro } from "./ghlMarketplaceGrant";

export type ShopifyShopTrialClaimResult = {
  claimed: boolean;
  granted: boolean;
  status: string | null;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  reason: string;
};

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Truncated SHA-256 of the canonical shop. For logs only — not stored, not retained after redact. */
export function hashShopifyShopForLogs(shop: string | null | undefined): string {
  const n = normalizeShopifyShopDomain(shop) || String(shop || "").trim().toLowerCase();
  if (!n) return "(none)";
  const h = crypto.createHash("sha256").update(n).digest("hex").slice(0, 12);
  return `shop_${h}`;
}

/**
 * Insert the shop ledger row if missing; grant the user trial only on first claim
 * when the user is still eligible. Existing ledger dates and blocked rows are
 * never overwritten. OAuth never resolves blocked rows by granting.
 */
export async function claimShopifyShopTrialForInstall(input: {
  canonicalShop: string;
  user: User;
  now?: Date;
}): Promise<ShopifyShopTrialClaimResult> {
  const shop = normalizeShopifyShopDomain(input.canonicalShop);
  const shopHash = hashShopifyShopForLogs(input.canonicalShop);
  if (!shop) {
    return {
      claimed: false,
      granted: false,
      status: null,
      trialStartedAt: null,
      trialEndsAt: null,
      reason: "invalid_shop",
    };
  }

  const now = input.now ?? new Date();
  if (!isShopifyShopTrialLedgerReady()) {
    console.error("[ShopifyShopTrial] Refusing grant; ledger backfill is not ready", {
      shopHash,
      userId: input.user.id,
    });
    return {
      claimed: false,
      granted: false,
      status: null,
      trialStartedAt: null,
      trialEndsAt: null,
      reason: "ledger_not_ready",
    };
  }

  const grantEnds = addShopifyTrialDays(now);

  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(shopifyShopTrials)
      .values({
        canonicalShop: shop,
        status: "granted",
        blockReason: null,
        trialStartedAt: now,
        trialEndsAt: grantEnds,
        trialPlan: SHOPIFY_SHOP_TRIAL_PLAN,
        trialConsumedAt: now,
        originalUserId: input.user.id,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: shopifyShopTrials.canonicalShop })
      .returning();

    const created = inserted[0];
    if (!created) {
      const existing = await tx
        .select()
        .from(shopifyShopTrials)
        .where(eq(shopifyShopTrials.canonicalShop, shop))
        .limit(1);
      const row = existing[0];
      console.log("[ShopifyShopTrial] Existing ledger prevents grant", {
        shopHash,
        userId: input.user.id,
        status: row?.status ?? null,
      });
      return {
        claimed: false,
        granted: false,
        status: row?.status ?? null,
        trialStartedAt: asDate(row?.trialStartedAt),
        trialEndsAt: asDate(row?.trialEndsAt),
        reason: "ledger_exists",
      };
    }

    if (shopifyInstallShouldGrantUserTrial(input.user, now, {
      ghlMarketplaceProActive: await userHasActiveGhlMarketplacePro(input.user.id),
    })) {
      await tx
        .update(users)
        .set({
          trialStartedAt: now,
          trialEndsAt: grantEnds,
          trialStatus: "active",
          trialPlan: SHOPIFY_SHOP_TRIAL_PLAN,
        })
        .where(eq(users.id, input.user.id));
      console.log("[ShopifyShopTrial] Claimed ledger and granted first shop trial", {
        shopHash,
        userId: input.user.id,
      });
      return {
        claimed: true,
        granted: true,
        status: "granted",
        trialStartedAt: now,
        trialEndsAt: grantEnds,
        reason: "grant",
      };
    }

    const existingStart = asDate(input.user.trialStartedAt);
    const existingEnd = asDate(input.user.trialEndsAt);
    if (existingStart && existingEnd) {
      await tx
        .update(shopifyShopTrials)
        .set({
          trialStartedAt: existingStart,
          trialEndsAt: existingEnd,
          trialPlan: input.user.trialPlan || SHOPIFY_SHOP_TRIAL_PLAN,
          updatedAt: now,
        })
        .where(eq(shopifyShopTrials.id, created.id));
      console.log("[ShopifyShopTrial] Claimed ledger without user grant (existing user trial)", {
        shopHash,
        userId: input.user.id,
      });
      return {
        claimed: true,
        granted: false,
        status: "granted",
        trialStartedAt: existingStart,
        trialEndsAt: existingEnd,
        reason: "user_ineligible",
      };
    }

    console.log("[ShopifyShopTrial] Claimed ledger without user grant", {
      shopHash,
      userId: input.user.id,
    });
    return {
      claimed: true,
      granted: false,
      status: "granted",
      trialStartedAt: now,
      trialEndsAt: grantEnds,
      reason: "user_ineligible",
    };
  });
}

/** Delete the shop-identifying ledger row. Used only from a valid shop/redact webhook. */
export async function deleteShopifyShopTrialLedgerForCanonicalShop(
  canonicalShop: string,
): Promise<{ deleted: boolean }> {
  const shop = normalizeShopifyShopDomain(canonicalShop);
  const shopHash = hashShopifyShopForLogs(canonicalShop);
  if (!shop) {
    return { deleted: false };
  }
  const removed = await db
    .delete(shopifyShopTrials)
    .where(eq(shopifyShopTrials.canonicalShop, shop))
    .returning({ id: shopifyShopTrials.id });
  console.log("[ShopifyShopTrial] Ledger deleted after shop/redact", {
    shopHash,
    deleted: removed.length > 0,
  });
  return { deleted: removed.length > 0 };
}

export async function logShopifyShopTrialLedgerCounts(): Promise<void> {
  try {
    const result = await db.execute(sql`
      SELECT status, count(*)::int AS n
      FROM shopify_shop_trials
      GROUP BY status
      ORDER BY status
    `);
    const rows = (result as { rows?: Array<{ status?: string; n?: number }> }).rows ?? [];
    const counts: Record<string, number> = {};
    for (const row of rows) {
      if (row.status) counts[row.status] = Number(row.n ?? 0);
    }
    console.log("[ShopifyShopTrial] Ledger backfill counts", counts);
  } catch (err) {
    console.error("[ShopifyShopTrial] Failed to log ledger counts", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Live-install uniqueness. Never silently skipped: if duplicates exist, log a
 * sanitized diagnostic (hashes + counts only) and leave the index uncreated.
 */
export async function ensureUsersShopifyShopUniqueIndex(): Promise<boolean> {
  try {
    const result = await db.execute(sql`
      SELECT lower(trim(shopify_shop)) AS shop, count(*)::int AS n
      FROM users
      WHERE shopify_shop IS NOT NULL
      GROUP BY lower(trim(shopify_shop))
      HAVING count(*) > 1
    `);
    const rows = (result as { rows?: Array<{ shop?: string; n?: number }> }).rows ?? [];
    if (rows.length > 0) {
      console.error(
        "[StartupSchema] users_shopify_shop_uidx NOT created: duplicate shopify_shop values prevent a unique index",
        {
          duplicateGroupCount: rows.length,
          shops: rows.map((row) => ({
            shopHash: hashShopifyShopForLogs(row.shop),
            count: Number(row.n ?? 0),
          })),
        },
      );
      return false;
    }

    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS users_shopify_shop_uidx
        ON users (shopify_shop)
        WHERE shopify_shop IS NOT NULL
    `);
    console.log("[StartupSchema] users_shopify_shop_uidx ready");
    return true;
  } catch (err) {
    console.error("[StartupSchema] users_shopify_shop_uidx failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
