import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { InventoryMatchResult } from "@shared/inventory/inventoryMatchTypes";
import type { BuyerPreferenceProfile } from "@shared/buyerPreferenceSchema";
import { fetchInventoryStatus } from "@/lib/inventoryApi";
import { InventoryHealthDiagnosticsPanel } from "@/components/inventory/InventoryHealthDiagnosticsPanel";
import { InventoryMatchRecommendationCard } from "@/components/inventory/InventoryMatchRecommendationCard";
import type { CopilotComposerInsert } from "@/lib/copilotComposerInsert";
import { shouldShowInventoryHealthDiagnostics } from "@/lib/copilotRgeVisibility";
import { INVENTORY_MATCH_PAGE_SIZE } from "@/lib/inventoryMatchUi";
import {
  fetchInventoryMatches,
  INVENTORY_MATCHES_STALE_MS,
  inventoryMatchesHasDisplayableResults,
  inventoryMatchesPlaceholderData,
  inventoryMatchesQueryKey,
  inventoryMatchesRetryDelay,
  isRateLimitedInventoryMatchesError,
  shouldRetryInventoryMatches,
} from "@/lib/inventoryMatchesQuery";
import {
  logBuyerMatchingTraceClient,
  summarizeListingsForTrace,
} from "@/lib/buyerMatchingTraceClient";
import { resolveClientBuyerMatchingTraceId } from "@/lib/buyerMatchingTraceStore";

interface MatchingListingsPanelProps {
  contactId: string;
  contactFirstName?: string;
  compact?: boolean;
  isWorkspaceAdmin?: boolean;
  isWorkspaceOwner?: boolean;
  isPlatformAdmin?: boolean;
  buyerProfile?: BuyerPreferenceProfile | null;
  /** When false, hide the entire panel (non-inventory contact). */
  inventoryRelevant?: boolean;
  onInsertComposerDraft?: (draft: CopilotComposerInsert) => boolean;
}

export function MatchingListingsPanel({
  contactId,
  contactFirstName,
  compact = true,
  isWorkspaceAdmin = false,
  isWorkspaceOwner = false,
  isPlatformAdmin = false,
  buyerProfile = null,
  inventoryRelevant = true,
  onInsertComposerDraft,
}: MatchingListingsPanelProps) {
  const [matchOffset, setMatchOffset] = useState(0);
  const [lastClientFetchAt, setLastClientFetchAt] = useState<string | null>(null);

  const showHealthDiagnostics = shouldShowInventoryHealthDiagnostics({
    isDev: import.meta.env.DEV,
    isWorkspaceAdmin,
    isWorkspaceOwner,
    isPlatformAdmin,
  });

  const fetchOptions = useMemo(
    () => ({
      offset: matchOffset,
      limit: INVENTORY_MATCH_PAGE_SIZE,
      includeDiagnostics: showHealthDiagnostics,
    }),
    [matchOffset, showHealthDiagnostics],
  );

  const { data: inventoryStatus } = useQuery({
    queryKey: ["/api/inventory/status"],
    queryFn: fetchInventoryStatus,
    staleTime: 60_000,
  });

  const enabled = inventoryRelevant && !!contactId && !!inventoryStatus?.canUse;

  const { data, isLoading, isFetched, isError, error, isFetching, refetch, isPlaceholderData } =
    useQuery({
      queryKey: inventoryMatchesQueryKey(contactId, fetchOptions),
      queryFn: () => fetchInventoryMatches(contactId, fetchOptions),
      enabled,
      staleTime: INVENTORY_MATCHES_STALE_MS,
      placeholderData: (previousData, previousQuery) =>
        inventoryMatchesPlaceholderData(contactId, previousData, previousQuery),
      retry: shouldRetryInventoryMatches,
      retryDelay: inventoryMatchesRetryDelay,
    });

  useEffect(() => {
    setMatchOffset(0);
    setLastClientFetchAt(null);
  }, [contactId]);

  useEffect(() => {
    if (!isFetched && !isError) return;
    if (!isError && !isPlaceholderData) {
      setLastClientFetchAt(new Date().toISOString());
    }
  }, [isFetched, isError, isPlaceholderData, contactId, data?.matchCount]);

  useEffect(() => {
    if (!contactId || !data || isPlaceholderData) return;
    if (!isFetched || isError) return;
    logBuyerMatchingTraceClient({
      step: "displayed_cards",
      traceId:
        data.buyerMatchingTraceId ?? resolveClientBuyerMatchingTraceId(contactId),
      contactId,
      source: "MatchingListingsPanel",
      layer: "ui",
      inventoryFilters: showHealthDiagnostics ? data.diagnostics?.activeFilterSummary ?? null : null,
      matchCount: data.matchCount ?? data.matches?.length ?? 0,
      returnedListings: summarizeListingsForTrace(data.matches ?? []),
      displayedCardCount: (data.matches ?? []).length,
    });
  }, [contactId, data, isFetched, isError, isPlaceholderData, showHealthDiagnostics]);

  if (!inventoryRelevant) return null;
  if (!inventoryStatus) return null;
  if (!inventoryStatus.canUse) return null;
  if (!contactId) return null;

  const matches = data?.matches ?? [];
  const totalFound = data?.matchCount ?? matches.length;
  const showingCount = matches.length;
  const savedListingIds = data?.savedListingIds ?? [];
  const savedSet = new Set(savedListingIds);
  const hasCachedMatches = inventoryMatchesHasDisplayableResults(data);
  const isRateLimited = isError && isRateLimitedInventoryMatchesError(error);
  const clientErrorMessage =
    isError && error instanceof Error ? error.message : null;

  const canViewMore = totalFound > matchOffset + showingCount;

  const showEmpty =
    isFetched &&
    !isError &&
    data?.eligible &&
    matches.length === 0 &&
    (data.reason === "no_matches" ||
      data.reason === "no_buyer_preferences" ||
      data.reason === "no_active_inventory");

  const showBlockingFetchError =
    isError && !hasCachedMatches && !isLoading;

  const showListingFetchFailed =
    !isError &&
    isFetched &&
    data?.reason === "listing_fetch_failed" &&
    !hasCachedMatches;

  if (!enabled && !isLoading) return null;
  if (isFetched && !isError && data && !data.eligible && data.reason === "feature_disabled") {
    return null;
  }

  const handleViewMore = () => {
    setMatchOffset((prev) => prev + INVENTORY_MATCH_PAGE_SIZE);
  };

  return (
    <div
      className={cn(compact ? "mt-2 min-w-0" : "mt-3")}
      data-testid="matching-listings-panel"
    >
      <div className={cn(compact ? "mb-2" : "mb-2.5")}>
        <div className="flex items-start gap-1.5 min-w-0">
          <Sparkles className="h-3.5 w-3.5 text-violet-500 shrink-0 mt-0.5" aria-hidden />
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "font-semibold text-gray-800",
                compact ? "text-[11px]" : "text-xs",
              )}
            >
              Inventory matches
              {isFetching && hasCachedMatches && (
                <Loader2 className="inline-block ml-1.5 h-3 w-3 animate-spin text-gray-400" aria-hidden />
              )}
            </p>
            {totalFound > 0 && (
              <p className="text-[10px] text-gray-500 leading-snug mt-0.5">
                <span className="font-medium text-gray-700">{totalFound} found</span>
                {showingCount > 0 && (
                  <>
                    <span className="text-gray-300 mx-1">·</span>
                    <span>Showing {showingCount}</span>
                  </>
                )}
              </p>
            )}
          </div>
        </div>
      </div>

      {isLoading && !hasCachedMatches && (
        <div className="flex items-center gap-1.5 py-2 text-[11px] text-gray-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          Finding matches…
        </div>
      )}

      {(showBlockingFetchError || showListingFetchFailed) && (
        <p
          className="text-[11px] text-amber-700 leading-snug py-1"
          data-testid="matching-listings-fetch-error"
        >
          Unable to load matching listings right now.
          {isRateLimited ? " Please wait a moment and try again." : ""}
        </p>
      )}

      {showHealthDiagnostics && (isFetched || isError) && (
        <InventoryHealthDiagnosticsPanel
          diagnostics={data?.diagnostics}
          clientError={clientErrorMessage ?? data?.error ?? null}
          lastClientFetchAt={lastClientFetchAt}
          reason={data?.reason}
          compact={compact}
          rateLimitWarning={isRateLimited}
        />
      )}

      {showEmpty && (
        <p className="text-[11px] text-gray-500 leading-snug py-1">
          {data?.reason === "no_buyer_preferences" || data?.reason === "no_active_inventory"
            ? "Matches will appear once buyer preferences and inventory are available."
            : showHealthDiagnostics && data?.diagnostics?.noMatchSummary?.trim()
              ? data.diagnostics.noMatchSummary.trim()
              : "No strong matches in active inventory yet."}
        </p>
      )}

      {matches.length > 0 && (
        <div
          className="min-w-0"
          data-testid="matching-listings-cards"
          data-match-count={totalFound}
          data-rendered-count={showingCount}
        >
          <div className="space-y-1.5">
            {matches.map((match: InventoryMatchResult) => (
              <InventoryMatchRecommendationCard
                key={match.listingId}
                contactId={contactId}
                contactFirstName={contactFirstName}
                match={match}
                saved={savedSet.has(match.listingId)}
                onSavedChange={() => void refetch()}
                onInsertComposerDraft={onInsertComposerDraft}
                layout="sidebar"
              />
            ))}
          </div>

          <div
            className="mt-3 flex flex-wrap gap-1.5"
            data-testid="inventory-match-controls"
          >
            {canViewMore && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[10px] px-2.5"
                onClick={handleViewMore}
                disabled={isFetching}
                data-testid="button-view-more-matches"
              >
                View more
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
