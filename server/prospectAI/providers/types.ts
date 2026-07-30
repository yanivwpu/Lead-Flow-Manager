import type { ProspectAiNormalizedProspect, ProspectAiProviderId } from "@shared/prospectAI";

export type ProspectDiscoveryQuery = {
  businessType: string;
  location: string;
  radiusKm?: number;
  /** Desired unique usable prospects before qualification. */
  targetCount?: number;
  locationExpansion?: "exact" | "nearby" | "metro";
  /** Cap saves by remaining monthly quota. */
  quotaRemaining?: number;
};

export type ProspectDiscoveryProviderResult = {
  prospects: ProspectAiNormalizedProspect[];
  /** Sanitized provider diagnostics (never include API keys). */
  meta?: Record<string, unknown>;
};

export interface ProspectDiscoveryProvider {
  readonly id: ProspectAiProviderId;
  discover(query: ProspectDiscoveryQuery): Promise<ProspectDiscoveryProviderResult>;
}

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;
