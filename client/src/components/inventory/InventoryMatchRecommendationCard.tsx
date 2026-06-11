import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, Heart, Home, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InventoryMatchResult } from "@shared/inventory/inventoryMatchTypes";
import { apiRequest } from "@/lib/queryClient";
import { ListingDetailDialog } from "@/components/inventory/ListingDetailDialog";
import {
  RecommendationCard,
  type RecommendationCardLayout,
} from "@/components/recommendations/RecommendationCard";
import {
  mapInventoryMatchToRecommendation,
  shortInventoryMatchReason,
} from "@/components/inventory/inventoryMatchRecommendation";
import type { CopilotComposerInsert } from "@/lib/copilotComposerInsert";

interface InventoryMatchRecommendationCardProps {
  contactId: string;
  contactFirstName?: string;
  match: InventoryMatchResult;
  saved: boolean;
  onSavedChange: () => void;
  onInsertComposerDraft?: (draft: CopilotComposerInsert) => boolean;
  layout?: RecommendationCardLayout;
}

export function InventoryMatchRecommendationCard({
  contactId,
  contactFirstName,
  match,
  saved,
  onSavedChange,
  onInsertComposerDraft,
  layout = "modal",
}: InventoryMatchRecommendationCardProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const queryClient = useQueryClient();
  const recommendation = mapInventoryMatchToRecommendation(match);
  const isSidebar = layout === "sidebar";

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (saved) {
        await apiRequest(
          "DELETE",
          `/api/contacts/${contactId}/inventory-matches/saved/${match.listingId}`,
        );
        return { saved: false };
      }
      await apiRequest("POST", `/api/contacts/${contactId}/inventory-matches/saved`, {
        listingId: match.listingId,
        score: match.score,
        reasons: match.reasons,
      });
      return { saved: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/contacts/${contactId}/inventory-matches`] });
      onSavedChange();
    },
  });

  const viewListing = useCallback(() => {
    setDetailOpen(true);
  }, []);

  return (
    <>
      <RecommendationCard
        layout={layout}
        testId={`inventory-match-${match.listingId}`}
        image={{
          src: recommendation.imageSrc,
          onClick: viewListing,
          ariaLabel: "View listing",
          fallback: (
            <Home
              className={cn("text-gray-300", isSidebar ? "h-8 w-8" : "h-6 w-6")}
              aria-hidden
            />
          ),
        }}
        title={recommendation.title}
        subtitle={layout === "modal" ? recommendation.subtitle : null}
        primaryValue={recommendation.primaryValue}
        attributes={recommendation.attributes}
        score={recommendation.score}
        matchReasons={recommendation.matchReasons}
        formatMatchReason={shortInventoryMatchReason}
        actions={[
          {
            id: "view",
            icon: <Eye className="h-3.5 w-3.5" />,
            label: "View listing",
            onClick: viewListing,
            testId: `button-view-listing-${match.listingId}`,
          },
          {
            id: "save",
            icon: saveMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Heart className={cn("h-3.5 w-3.5", saved && "fill-rose-500 text-rose-500")} />
            ),
            label: "Save to buyer shortlist",
            onClick: () => saveMutation.mutate(),
            disabled: saveMutation.isPending,
            active: saved,
            testId: `button-save-match-${match.listingId}`,
          },
        ]}
      />

      <ListingDetailDialog
        contactId={contactId}
        listingId={match.listingId}
        fallback={match.listing}
        matchReasons={match.reasons}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onInsertComposerDraft={onInsertComposerDraft}
        contactFirstName={contactFirstName}
      />
    </>
  );
}
