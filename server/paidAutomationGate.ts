import { subscriptionService } from "./subscriptionService";
import {
  chatbotExecutionAllowedFromLimits,
  followUpsAllowedFromLimits,
  paidAutomationAllowedFromLimits,
  type PaidAutomationFeature,
} from "@shared/paidAutomationEntitlements";

export function logEntitlementSkip(params: {
  feature: PaidAutomationFeature;
  userId: string;
  jobId?: string;
  extra?: Record<string, unknown>;
}): void {
  console.log(
    JSON.stringify({
      tag: "[EntitlementSkip]",
      feature: params.feature,
      userId: params.userId,
      jobId: params.jobId ?? null,
      reason: "plan_does_not_allow",
      preserved: true,
      ...(params.extra || {}),
    }),
  );
}

export async function resolveExecutionEntitlement(userId: string): Promise<{
  paidAutomationAllowed: boolean;
  chatbotAllowed: boolean;
  followUpsAllowed: boolean;
  maxWhatsappNumbers: number;
  plan: string;
}> {
  const limits = await subscriptionService.getUserLimits(userId);
  return {
    paidAutomationAllowed: paidAutomationAllowedFromLimits(limits),
    chatbotAllowed: chatbotExecutionAllowedFromLimits(limits),
    followUpsAllowed: followUpsAllowedFromLimits(limits),
    maxWhatsappNumbers: limits?.maxWhatsappNumbers ?? 1,
    plan: limits?.plan ?? "free",
  };
}
