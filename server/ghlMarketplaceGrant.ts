/**
 * Load whether a WhachatCRM user currently has an active GHL Marketplace Pro grant.
 */

import { eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { ghlMarketplaceInstalls } from "@shared/schema";
import { isActiveGhlMarketplaceProGrant } from "@shared/ghlMarketplaceBilling";
import { ghlMarketplacePlanConfigFromEnv } from "@shared/ghlMarketplacePlanIds";

export async function userHasActiveGhlMarketplacePro(userId: string): Promise<boolean> {
  if (!userId) return false;
  const config = ghlMarketplacePlanConfigFromEnv();
  if (!config.configured) return false;

  const rows = await db
    .select({
      marketplacePlanId: ghlMarketplaceInstalls.marketplacePlanId,
      paymentStatus: ghlMarketplaceInstalls.paymentStatus,
      installationStatus: ghlMarketplaceInstalls.installationStatus,
      uninstallDate: ghlMarketplaceInstalls.uninstallDate,
      whachatUserId: ghlMarketplaceInstalls.whachatUserId,
    })
    .from(ghlMarketplaceInstalls)
    .where(eq(ghlMarketplaceInstalls.whachatUserId, userId));

  return rows.some((row) => isActiveGhlMarketplaceProGrant(row, config));
}

export async function paidSourceOptionsForUser(userId: string): Promise<{ ghlMarketplaceProActive: boolean }> {
  return { ghlMarketplaceProActive: await userHasActiveGhlMarketplacePro(userId) };
}
