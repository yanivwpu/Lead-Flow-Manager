import type { User } from "@shared/schema";
import { storage } from "./storage";
import { hasActivePaidPlan, isProAiTrialActive } from "@shared/trialEntitlements";
import { trialExpiryConversationUsageReset } from "@shared/conversationUsagePeriod";
import { userHasActiveGhlMarketplacePro } from "./ghlMarketplaceGrant";

export type { TrialStatus } from "@shared/trialEntitlements";
export {
  hasActivePaidPlan,
  computeTrialStatus,
  isProAiTrialActive,
  getEffectivePlanForUser,
  hadProAiBrainTrial,
} from "@shared/trialEntitlements";
export type { PaidSourceOptions } from "@shared/trialEntitlements";

/** Persist trial_status = expired once trial window passes (idempotent). */
export async function syncTrialExpiryIfNeeded(user: User): Promise<User> {
  const now = new Date();
  if (!user.trialEndsAt) return user;
  if (new Date(user.trialEndsAt) > now) return user;
  if (user.trialStatus === "expired") return user;

  const ghlMarketplaceProActive = await userHasActiveGhlMarketplacePro(user.id);
  const usageReset = hasActivePaidPlan(user, now, { ghlMarketplaceProActive })
    ? null
    : trialExpiryConversationUsageReset(now);
  const updated = await storage.updateUser(user.id, {
    trialStatus: "expired",
    ...(usageReset
      ? {
          monthlyConversations: usageReset.monthlyConversations,
          conversationUsagePeriodStart: usageReset.conversationUsagePeriodStart,
        }
      : {}),
  });
  return updated ?? {
    ...user,
    trialStatus: "expired",
    ...(usageReset
      ? {
          monthlyConversations: usageReset.monthlyConversations,
          conversationUsagePeriodStart: usageReset.conversationUsagePeriodStart,
        }
      : {}),
  };
}

export function trialHoursRemaining(user: User, now: Date): number | null {
  if (!user.trialEndsAt || !isProAiTrialActive(user, now)) return null;
  const ms = new Date(user.trialEndsAt).getTime() - now.getTime();
  return Math.max(0, ms / (1000 * 60 * 60));
}
