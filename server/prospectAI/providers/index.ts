import { createGooglePlacesProvider } from "./googlePlacesProvider";
import type { ProspectDiscoveryProvider } from "./types";
import type { ProspectAiProviderId } from "@shared/prospectAI";
import { PROSPECT_AI_DEFAULT_PROVIDER } from "@shared/prospectAI";

const registry: Record<ProspectAiProviderId, () => ProspectDiscoveryProvider> = {
  google_places: () => createGooglePlacesProvider(),
};

export function getProspectDiscoveryProvider(
  providerId: ProspectAiProviderId = PROSPECT_AI_DEFAULT_PROVIDER,
): ProspectDiscoveryProvider {
  const factory = registry[providerId];
  if (!factory) {
    throw new Error(`Unknown Prospect AI provider: ${providerId}`);
  }
  return factory();
}

export type { ProspectDiscoveryProvider, ProspectDiscoveryQuery } from "./types";
