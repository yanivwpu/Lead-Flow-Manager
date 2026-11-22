import { useQuery } from "@tanstack/react-query";
import { Heart, Loader2 } from "lucide-react";
import type { InventoryMatchResult } from "@shared/inventory/inventoryMatchTypes";
import type { CopilotComposerInsert } from "@/lib/copilotComposerInsert";
import { InventoryMatchRecommendationCard } from "./InventoryMatchRecommendationCard";

type SavedResponse = {
  matches: InventoryMatchResult[];
  totalSaved: number;
  unavailable: number;
};

export function SavedInventoryMatches({
  contactId, contactFirstName, onInsertComposerDraft, onSavedChange,
}: {
  contactId: string;
  contactFirstName?: string;
  onInsertComposerDraft?: (draft: CopilotComposerInsert) => boolean;
  onSavedChange: () => void;
}) {
  const { data, isLoading, isError } = useQuery<SavedResponse>({
    queryKey: ["/api/contacts", contactId, "inventory-matches/saved"],
    enabled: !!contactId,
    staleTime: 20_000,
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/contacts/${contactId}/inventory-matches/saved`, {
        signal, credentials: "include", cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load saved properties");
      return res.json() as Promise<SavedResponse>;
    },
  });

  if (isLoading) {
    return <div className="flex items-center gap-2 py-4 text-xs text-gray-500">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading saved properties…
    </div>;
  }
  if (isError) {
    return <p role="alert" className="text-xs text-amber-700 py-3">
      Saved properties could not be loaded. Try reopening this shortlist.
    </p>;
  }

  return <section data-testid="saved-inventory-matches" aria-label="Saved buyer properties">
    {data?.totalSaved === 0 && (
      <div className="py-4 text-center text-xs text-gray-500">
        <Heart className="mx-auto mb-2 h-4 w-4" aria-hidden="true" />
        No saved properties for this contact yet. Tap the heart on any match to save it here.
      </div>
    )}
    {(data?.unavailable ?? 0) > 0 && (
      <p className="text-[11px] text-amber-700 mb-2" role="status">
        {data!.unavailable} saved {data!.unavailable === 1 ? "property is" : "properties are"} unavailable or not eligible for MLS display.
      </p>
    )}
    <div className="space-y-1.5">
      {(data?.matches ?? []).map((match, index) => (
        <InventoryMatchRecommendationCard
          key={match.listingId}
          contactId={contactId}
          contactFirstName={contactFirstName}
          match={match}
          imagePriority={index === 0}
          saved
          onSavedChange={onSavedChange}
          onInsertComposerDraft={onInsertComposerDraft}
          layout="sidebar"
        />
      ))}
    </div>
  </section>;
}
