import { useQuery } from "@tanstack/react-query";
import type { BuyerPreferenceProfile } from "@shared/buyerPreferenceSchema";
import type { BuyerPreferenceChip } from "@shared/buyerPreferenceDisplay";
import { normalizeBuyerPreferenceProfile } from "@shared/buyerPreferenceSchema";

export type BuyerPreferencesApiResponse = {
  eligible: boolean;
  reason?: string;
  profile: BuyerPreferenceProfile;
  rawProfile?: unknown;
  chips: BuyerPreferenceChip[];
};

export function buyerPreferencesQueryKey(contactId: string) {
  return [`/api/contacts/${contactId}/buyer-preferences`] as const;
}

async function fetchBuyerPreferences(contactId: string): Promise<BuyerPreferencesApiResponse> {
  const res = await fetch(`/api/contacts/${contactId}/buyer-preferences`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to load buyer preferences");
  return res.json() as Promise<BuyerPreferencesApiResponse>;
}

/**
 * Canonical persisted buyer profile for Copilot UI — same endpoint as BuyerPreferencesPanel.
 */
export function usePersistedBuyerPreferences(contactId: string | null | undefined) {
  const { data, isLoading, isFetched, refetch } = useQuery({
    queryKey: contactId ? buyerPreferencesQueryKey(contactId) : ["buyer-preferences", "none"],
    queryFn: () => fetchBuyerPreferences(contactId!),
    enabled: !!contactId,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  const profile = normalizeBuyerPreferenceProfile(
    data?.profile ?? data?.rawProfile ?? null,
  );

  return {
    data,
    profile,
    chips: data?.chips ?? [],
    eligible: data?.eligible ?? false,
    isLoading,
    isFetched,
    refetch,
  };
}
