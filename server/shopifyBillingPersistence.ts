import { and, eq, isNull, sql } from "drizzle-orm";
import { users, type User } from "@shared/schema";
import { db } from "../drizzle/db";

/** Atomic installation fence: no trial, override or provider subscription mutations. */
export async function persistVerifiedShopifyBilling(
  input: {
    userId: string;
    shop: string;
    accessToken: string;
    patch: Pick<
      User,
      | "shopifySubscriptionStatus"
      | "shopifyChargeId"
      | "subscriptionPlan"
      | "billingPlan"
      | "subscriptionStatus"
    > &
      Partial<Pick<User, "shopifyAIBrainEnabled">>;
  },
  database = db,
) {
  const rows = await database
    .update(users)
    .set(input.patch)
    .where(
      and(
        eq(users.id, input.userId),
        sql`lower(trim(${users.shopifyShop})) = ${input.shop.trim().toLowerCase()}`,
        eq(users.shopifyAccessToken, input.accessToken),
        isNull(users.deletionRequestedAt),
        sql`COALESCE(lower(${users.shopifySubscriptionStatus}), '') NOT IN ('uninstalled','redacted')`,
      ),
    )
    .returning({ id: users.id });
  return rows.length === 1;
}
