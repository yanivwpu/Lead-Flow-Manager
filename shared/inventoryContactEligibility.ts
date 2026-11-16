import { resolveAiDomainEligibility, type AiDomainEligibilityInput } from "./aiDomainEligibility";
import { normalizeBuyerPreferenceProfile } from "./buyerPreferenceSchema";

/** Inferred values, leadType and workspace installation are never enrollment proof. */
export function hasConfirmedBuyerEnrollment(raw: unknown): boolean {
  const profile = normalizeBuyerPreferenceProfile(raw);
  return Boolean(profile.agentConfirmedAt);
}

export function inventoryContactEligibility(input: AiDomainEligibilityInput & { buyerPreferenceProfile?: unknown }) {
  return resolveAiDomainEligibility({
    ...input,
    buyerIntentVerified: hasConfirmedBuyerEnrollment(input.buyerPreferenceProfile),
  }).injectInventoryContext;
}

/** Reject cached eligibility from the older workspace-only API contract. */
export function hasVerifiedContactEligibilityResponse(data?: { eligible?: boolean; eligibilityVersion?: number } | null): boolean {
  return data?.eligibilityVersion === 2 && data.eligible === true;
}
