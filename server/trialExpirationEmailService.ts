import { db } from "../drizzle/db";
import { users } from "@shared/schema";
import { and, isNull, isNotNull, lte, eq } from "drizzle-orm";
import { shouldSendTrialExpirationEmail } from "@shared/trialExpirationEmailEligibility";
import { sendTrialExpirationEmail } from "./email";
import { getGhlMarketplacePaidUserIds } from "./ghlMarketplaceService";

function firstName(name: string | null | undefined): string {
  return (name || "there").split(" ")[0] || "there";
}

/**
 * Send-once Pro + AI Brain trial-expiration email.
 * Runs after hourly trial_status expiry sync (existing cron — not a new scheduler).
 * trialExpirationEmailSentAt is written only after a successful Resend send.
 */
export async function runTrialExpirationEmails(): Promise<{
  sent: number;
  skipped: number;
  errors: number;
}> {
  console.log("[Cron] Starting trial-expiration email job...");

  const now = new Date();
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const candidates = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        deletionRequestedAt: users.deletionRequestedAt,
        shopifyShop: users.shopifyShop,
        trialEndsAt: users.trialEndsAt,
        trialStatus: users.trialStatus,
        trialPlan: users.trialPlan,
        trialExpirationEmailSentAt: users.trialExpirationEmailSentAt,
        planOverrideEnabled: users.planOverrideEnabled,
        planOverride: users.planOverride,
        billingPlan: users.billingPlan,
        subscriptionStatus: users.subscriptionStatus,
        shopifySubscriptionStatus: users.shopifySubscriptionStatus,
        aiBrainEntitlementOverrideEnabled: users.aiBrainEntitlementOverrideEnabled,
        aiBrainEntitlementOverrideGrant: users.aiBrainEntitlementOverrideGrant,
      })
      .from(users)
      .where(
        and(
          isNull(users.trialExpirationEmailSentAt),
          isNotNull(users.trialEndsAt),
          lte(users.trialEndsAt, now),
        ),
      );

    const ghlPaidUserIds = await getGhlMarketplacePaidUserIds();

    console.log(`[Cron] Checking ${candidates.length} user(s) for trial-expiration email`);

    for (const user of candidates) {
      const decision = shouldSendTrialExpirationEmail(user, now, {
        ghlMarketplaceProActive: ghlPaidUserIds.has(user.id),
      });
      if (!decision.send) {
        skipped++;
        continue;
      }
      if (!user.email) {
        skipped++;
        continue;
      }

      try {
        const ok = await sendTrialExpirationEmail(firstName(user.name), user.email);
        if (ok) {
          await db
            .update(users)
            .set({ trialExpirationEmailSentAt: new Date() })
            .where(eq(users.id, user.id));
          sent++;
          console.log(`[Cron] Sent trial-expiration email to ${user.email}`);
        } else {
          errors++;
          console.warn(
            `[Cron] Trial-expiration email not sent for ${user.email}; will retry on the next expiry-sync cron`,
          );
        }
      } catch (err) {
        errors++;
        console.error(`[Cron] Trial-expiration email error for ${user.email}:`, err);
      }
    }

    console.log(
      `[Cron] Trial-expiration emails complete: sent=${sent}, skipped=${skipped}, errors=${errors}`,
    );
    return { sent, skipped, errors };
  } catch (error) {
    console.error("[Cron] Error in trial-expiration email job:", error);
    throw error;
  }
}
