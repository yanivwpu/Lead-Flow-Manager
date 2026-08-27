import { eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { appFeatureRollouts } from "@shared/schema";
import { VERIFICATION_REMINDER_ROLLOUT_FEATURE_KEY } from "@shared/verificationReminderEligibility";

/**
 * Durable verification-reminder rollout boundary from app_feature_rollouts.
 * Missing table, missing row, or invalid timestamp → null (fail-closed).
 * Does not use this process's startup time as the boundary.
 */
export async function loadVerificationReminderRolloutActiveAfter(): Promise<Date | null> {
  try {
    const rows = await db
      .select({ activeAfter: appFeatureRollouts.activeAfter })
      .from(appFeatureRollouts)
      .where(eq(appFeatureRollouts.featureKey, VERIFICATION_REMINDER_ROLLOUT_FEATURE_KEY))
      .limit(1);
    const value = rows[0]?.activeAfter;
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  } catch (err) {
    console.error(
      "[Cron] Verification reminder rollout boundary unavailable:",
      (err as Error)?.message,
    );
    return null;
  }
}
