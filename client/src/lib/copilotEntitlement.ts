/**
 * Copilot plan gating — loading/unknown must never render the upgrade card.
 *
 * Server-authoritative `canUseCopilotIntelligence` is required to lock.
 * Falsy/undefined during fetch is not "not entitled".
 */

export type CopilotEntitlementStatus = "loading" | "entitled" | "locked";

export type CopilotEntitlementInput = {
  canUseCopilotIntelligence?: boolean;
  isLoading?: boolean;
} | null | undefined;

export function resolveCopilotEntitlementStatus(
  capabilities: CopilotEntitlementInput,
): CopilotEntitlementStatus {
  if (!capabilities) return "loading";
  if (capabilities.isLoading) return "loading";
  if (capabilities.canUseCopilotIntelligence === true) return "entitled";
  if (capabilities.canUseCopilotIntelligence === false) return "locked";
  return "loading";
}

export function shouldShowCopilotUpgradeCard(
  capabilities: CopilotEntitlementInput,
): boolean {
  return resolveCopilotEntitlementStatus(capabilities) === "locked";
}

export function shouldShowCopilotIntelligence(
  capabilities: CopilotEntitlementInput,
): boolean {
  return resolveCopilotEntitlementStatus(capabilities) === "entitled";
}
