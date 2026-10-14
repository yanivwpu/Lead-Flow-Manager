import { eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { shopifyShopTrials, type User } from "@shared/schema";
import { normalizeShopifyShopDomain } from "@shared/shopifyBilling";
import { shopifyInstallShouldGrantUserTrial } from "@shared/shopifyShopTrialPolicy";
import { resolveShopifyOnboardingState } from "@shared/shopifyOnboarding";
import { isShopifyShopTrialLedgerReady } from "./shopifyShopTrialLedgerReady";
import { userHasActiveGhlMarketplacePro } from "./ghlMarketplaceGrant";

export async function getShopifyOnboardingSnapshot(user: User) {
  const ledgerReady = isShopifyShopTrialLedgerReady();
  const shop = normalizeShopifyShopDomain(user.shopifyShop);
  const [ledger] = ledgerReady && shop
    ? await db.select({ status: shopifyShopTrials.status }).from(shopifyShopTrials)
        .where(eq(shopifyShopTrials.canonicalShop, shop)).limit(1)
    : [];
  const ghlMarketplaceProActive = await userHasActiveGhlMarketplacePro(user.id);
  // Preserve marketplace-paid access as well as Shopify/Stripe/override access.
  return resolveShopifyOnboardingState(
    ghlMarketplaceProActive ? { ...user, billingPlan: "pro", subscriptionStatus: "active" } : user,
    { ledgerReady, ledgerStatus: ledger?.status ?? null,
      userEligible: shopifyInstallShouldGrantUserTrial(user, new Date(), { ghlMarketplaceProActive }) },
  );
}
