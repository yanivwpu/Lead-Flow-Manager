import { and, eq, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { users, shopifyMerchantContacts, integrations } from "@shared/schema";
import { normalizeShopifyShopDomain, sanitizeShopifyOwnerEmail } from "@shared/shopifyBilling";
import { isShopifyContactInstallationActive, type ShopifyEmailCaptureResult,
  type ShopifyContactSnapshot, type ShopifySupportContactAction } from "@shared/shopifyContactPrivacy";

export async function persistShopifyOwnerEmailCapture(input: {
  userId: string; shop: string; accessToken: string;
}, result: ShopifyEmailCaptureResult, at: Date): Promise<boolean> {
  return db.transaction(async tx => {
    const [user] = await tx.select().from(users).where(eq(users.id, input.userId)).for("update").limit(1);
    if (!user || !isShopifyContactInstallationActive(user) ||
        normalizeShopifyShopDomain(user.shopifyShop) !== input.shop || user.shopifyAccessToken !== input.accessToken) return false;
    if (result.status === "success" && result.email) {
      await tx.update(users).set({ shopifyOwnerEmail: result.email }).where(eq(users.id, user.id));
    }
    const [previous] = await tx.select().from(shopifyMerchantContacts).where(eq(shopifyMerchantContacts.userId, user.id));
    const patch = {
      canonicalShop: input.shop, captureStatus: result.status, captureSource: "shop.email", captureAt: at,
      ...(previous && previous.canonicalShop !== input.shop ? {
        supportEmail: null, supportSource: null, supportConfirmedAt: null, supportDismissedAt: null,
      } : {}),
    };
    await tx.insert(shopifyMerchantContacts).values({ userId: user.id, ...patch })
      .onConflictDoUpdate({ target: shopifyMerchantContacts.userId, set: patch });
    return true;
  });
}

export async function readShopifySupportContact(userId: string): Promise<ShopifyContactSnapshot> {
  const [user] = await db.select({
    shopifyShop: users.shopifyShop, shopifyAccessToken: users.shopifyAccessToken,
    shopifySubscriptionStatus: users.shopifySubscriptionStatus, deletionRequestedAt: users.deletionRequestedAt,
    shopifyOwnerEmail: users.shopifyOwnerEmail,
  }).from(users).where(eq(users.id, userId));
  if (!user || !isShopifyContactInstallationActive(user)) return {
    available: false, suggestedEmail: null, confirmed: false, dismissed: false,
  };
  const [row] = await db.select().from(shopifyMerchantContacts).where(and(
    eq(shopifyMerchantContacts.userId, userId), eq(shopifyMerchantContacts.canonicalShop, user.shopifyShop!)));
  return {
    available: true, suggestedEmail: sanitizeShopifyOwnerEmail(row?.supportEmail || user.shopifyOwnerEmail),
    confirmed: !!row?.supportConfirmedAt, dismissed: !!row?.supportDismissedAt,
  };
}

export async function saveShopifySupportContact(userId: string, action: ShopifySupportContactAction): Promise<boolean> {
  return db.transaction(async tx => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for("update").limit(1);
    const shop = normalizeShopifyShopDomain(user?.shopifyShop);
    if (!user || !shop || !isShopifyContactInstallationActive(user)) return false;
    const patch = action.action === "confirm" ? {
      supportEmail: action.email,
      supportSource: action.email === sanitizeShopifyOwnerEmail(user.shopifyOwnerEmail) ? "shop.email_confirmed" : "merchant_input",
      supportConfirmedAt: new Date(), supportDismissedAt: null,
    } : {
      supportEmail: null, supportSource: null, supportConfirmedAt: null, supportDismissedAt: new Date(),
    };
    await tx.insert(shopifyMerchantContacts).values({ userId, canonicalShop: shop, ...patch })
      .onConflictDoUpdate({ target: shopifyMerchantContacts.userId, set: { canonicalShop: shop, ...patch } });
    return true;
  });
}

/** Serialize ingestion against uninstall/redaction; do not repopulate a revoked installation. */
export async function withShopifyPrivacyMutation<T>(shop: string, process: () => Promise<T>): Promise<T> {
  const canonical = normalizeShopifyShopDomain(shop);
  if (!canonical) throw new Error("Invalid Shopify domain");
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${canonical}, 0))`);
    return process();
  });
}
export async function withShopifyPrivacyFence(shop: string, process: () => Promise<void>): Promise<void> {
  const canonical = normalizeShopifyShopDomain(shop);
  if (!canonical) return;
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${canonical}, 0))`);
    const [user] = await tx.select().from(users).where(eq(users.shopifyShop, canonical)).limit(1);
    if (!user || !isShopifyContactInstallationActive(user)) return;
    const [integration] = await tx.select({ id: integrations.id }).from(integrations)
      .where(and(eq(integrations.userId, user.id), eq(integrations.type, "shopify"), eq(integrations.isActive, true))).limit(1);
    if (!integration) return;
    await process();
  });
}

/** Same uninstall entitlement changes as the existing handler; retain eligibility/contact history until redact. */
export async function uninstallShopifyStore(rawShop: string): Promise<void> {
  const shop = normalizeShopifyShopDomain(rawShop);
  if (!shop) throw new Error("Invalid Shopify domain");
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${shop}, 0))`);
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.shopifyShop, shop)).for("update").limit(1);
    if (!user) return;
    await tx.update(users).set({
      shopifyAccessToken: null, shopifyChargeId: null, shopifySubscriptionStatus: "uninstalled",
      shopifyAIBrainEnabled: false, billingPlan: "free", subscriptionPlan: "free", subscriptionStatus: "canceled",
    }).where(eq(users.id, user.id));
    await tx.update(integrations).set({ isActive: false, accessToken: null, refreshToken: null, tokenExpiresAt: null })
      .where(and(eq(integrations.userId, user.id), eq(integrations.type, "shopify")));
  });
}
