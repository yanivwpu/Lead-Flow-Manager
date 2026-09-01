import type { User } from "@shared/schema";
import { storage } from "./storage";
import { canStartInternalProAiTrial, hasActivePaidPlan, isProAiTrialActive } from "@shared/trialEntitlements";
import { trialExpiryConversationUsageReset } from "@shared/conversationUsagePeriod";
import { userHasActiveGhlMarketplacePro } from "./ghlMarketplaceGrant";
import { TRIAL_DAYS } from "./emailVerification";

export type { TrialStatus } from "@shared/trialEntitlements";
export {
  hasActivePaidPlan,
  computeTrialStatus,
  isProAiTrialActive,
  getEffectivePlanForUser,
  hadProAiBrainTrial,
  canStartInternalProAiTrial,
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

export type StartInternalTrialResult =
  | { ok: true; trialEndsAt: Date }
  | { ok: false; reason: "not_found" | "not_eligible" | "already_active" };

/**
 * One-time WhachatCRM 14-day Pro trial. Never restarts an expired or used trial.
 */
export async function startInternalProAiTrialForUser(userId: string): Promise<StartInternalTrialResult> {
  let user = await storage.getUserForSession(userId);
  if (!user) return { ok: false, reason: "not_found" };

  user = await syncTrialExpiryIfNeeded(user);
  const now = new Date();
  const ghlMarketplaceProActive = await userHasActiveGhlMarketplacePro(user.id);
  const paidSources = { ghlMarketplaceProActive };

  if (isProAiTrialActive(user, now, paidSources)) {
    return { ok: false, reason: "already_active" };
  }
  if (!canStartInternalProAiTrial(user, now, paidSources)) {
    return { ok: false, reason: "not_eligible" };
  }

  const trialEndsAt = new Date(now);
  trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);
  const updated = await storage.updateUser(userId, {
    trialStartedAt: now,
    trialEndsAt,
    trialStatus: "active",
    trialPlan: "pro_ai",
  });
  if (!updated) return { ok: false, reason: "not_found" };
  return { ok: true, trialEndsAt };
}
