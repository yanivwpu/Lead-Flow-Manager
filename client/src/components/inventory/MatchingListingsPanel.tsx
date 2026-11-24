import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, Loader2, Sparkles } from "lucide-react";
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
import { nextMatchPageOffset, uniqueInventoryMatchPages } from "@/lib/inventoryMatchPagination";
import { SavedInventoryMatches } from "@/components/inventory/SavedInventoryMatches";
import {
  fetchInventoryMatches,
  INVENTORY_MATCHES_STALE_MS,
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
  const { t: inboxText } = useTranslation();
  const [showSaved, setShowSaved] = useState(false);
  const queryClient = useQueryClient();
  const cardsContainerRef = useRef<HTMLDivElement | null>(null);
  const firstNewCardIndexRef = useRef<number | null>(null);
  const [lastClientFetchAt, setLastClientFetchAt] = useState<string | null>(null);

  const showHealthDiagnostics = shouldShowInventoryHealthDiagnostics({
    isDev: import.meta.env.DEV,
    isWorkspaceAdmin,
    isWorkspaceOwner,
    isPlatformAdmin,
  });

  const fetchOptions = useMemo(
    () => ({
      limit: INVENTORY_MATCH_PAGE_SIZE,
      includeDiagnostics: showHealthDiagnostics,
    }),
    [showHealthDiagnostics],
  );

  const { data: inventoryStatus } = useQuery({
    queryKey: ["/api/inventory/status"],
    queryFn: fetchInventoryStatus,
    staleTime: 60_000,
  });

  const enabled = inventoryRelevant && !!contactId && !!inventoryStatus?.canUse;

  const {
    data, isLoading, isFetched, isError, error, isFetching, isPlaceholderData,
    fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: inventoryMatchesQueryKey(contactId, fetchOptions),
    queryFn: ({ pageParam, signal }) =>
      fetchInventoryMatches(contactId, { ...fetchOptions, offset: pageParam }, signal),
    initialPageParam: 0,
    getNextPageParam: (_latest, pages) => nextMatchPageOffset(pages),
    enabled,
    staleTime: INVENTORY_MATCHES_STALE_MS,
    // Do not reuse results from a different contact while switching Inbox threads.
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey?.[0] === inventoryMatchesQueryKey(contactId, fetchOptions)[0]
        ? previousData : undefined,
    retry: shouldRetryInventoryMatches,
    retryDelay: inventoryMatchesRetryDelay,
  });
  const firstPage = data?.pages[0];
  const matches = useMemo(() => uniqueInventoryMatchPages(data?.pages ?? []), [data?.pages]);
  useEffect(() => {
    const index = firstNewCardIndexRef.current;
    if (index == null || isFetchingNextPage) return;
    const nextCard = cardsContainerRef.current?.children.item(index);
    if (nextCard instanceof HTMLElement) {
      // Reveal the first appended listing, rather than leaving the user at the
      // bottom button or jumping back up to the first ten matches.
      nextCard.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
    }
    firstNewCardIndexRef.current = null;
  }, [matches.length, isFetchingNextPage]);


  useEffect(() => {
    setShowSaved(false);
    setLastClientFetchAt(null);
    firstNewCardIndexRef.current = null;
  }, [contactId]);

  useEffect(() => {
    if (!isFetched && !isError) return;
    if (!isError && !isPlaceholderData) {
      setLastClientFetchAt(new Date().toISOString());
    }
  }, [isFetched, isError, isPlaceholderData, contactId, firstPage?.matchCount]);

  useEffect(() => {
    if (!contactId || !data || isPlaceholderData) return;
    if (!isFetched || isError) return;
    logBuyerMatchingTraceClient({
      step: "displayed_cards",
      traceId:
        firstPage?.buyerMatchingTraceId ?? resolveClientBuyerMatchingTraceId(contactId),
      contactId,
      source: "MatchingListingsPanel",
      layer: "ui",
      inventoryFilters: showHealthDiagnostics ? firstPage?.diagnostics?.activeFilterSummary ?? null : null,
      matchCount: firstPage?.matchCount ?? matches.length,
      returnedListings: summarizeListingsForTrace(matches),
      displayedCardCount: matches.length,
    });
  }, [contactId, data, firstPage, matches, isFetched, isError, isPlaceholderData, showHealthDiagnostics]);

  if (!inventoryRelevant) return null;
  if (!inventoryStatus) return null;
  if (!inventoryStatus.canUse) return null;
  if (!contactId) return null;

  const totalFound = firstPage?.matchCount ?? matches.length;
  const showingCount = matches.length;
  const savedListingIds = firstPage?.savedListingIds ?? [];
  const savedSet = new Set(savedListingIds);
  const hasCachedMatches = matches.length > 0;
  const refreshSavedState = () => {
    // The card already schedules the match refetch; avoid a duplicate burst.
    void queryClient.invalidateQueries({
      queryKey: ["/api/contacts", contactId, "inventory-matches/saved"],
    });
  };
  const isRateLimited = isError && isRateLimitedInventoryMatchesError(error);
  const clientErrorMessage =
    isError && error instanceof Error ? error.message : null;

  const canViewMore = Boolean(hasNextPage);

  const showEmpty =
    isFetched &&
    !isError &&
    firstPage?.eligible &&
    matches.length === 0 &&
    (firstPage.reason === "no_matches" ||
      firstPage.reason === "no_buyer_preferences" ||
      firstPage.reason === "no_active_inventory");

  const showBlockingFetchError =
    isError && !hasCachedMatches && !isLoading;

  const showListingFetchFailed =
    !isError &&
    isFetched &&
    firstPage?.reason === "listing_fetch_failed" &&
    !hasCachedMatches;

  if (!enabled && !isLoading) return null;
  if (isFetched && !isError && firstPage && !firstPage.eligible && firstPage.reason === "feature_disabled") {
    return null;
  }

  const handleViewMore = () => {
    if (!isFetchingNextPage && canViewMore) {
      firstNewCardIndexRef.current = matches.length;
      void fetchNextPage();
    }
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
              {inboxText("inboxUi.inventoryMatches")}
              {isFetching && hasCachedMatches && (
                <Loader2 className="inline-block ml-1.5 h-3 w-3 animate-spin text-gray-400" aria-hidden />
              )}
            </p>
            {totalFound > 0 && (
              <p className="text-[10px] text-gray-500 leading-snug mt-0.5">
                <span className="font-medium text-gray-700">{inboxText("inboxUi.matchesFound", { count: totalFound })}</span>
                {showingCount > 0 && (
                  <>
                    <span className="text-gray-300 mx-1">·</span>
                    <span>{inboxText("inboxUi.showingMatches", { count: showingCount })}</span>
                  </>
                )}
              </p>
            )}
          </div>
          <button
            type="button"
            className={cn(
              "shrink-0 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold",
              showSaved ? "bg-rose-50 border-rose-200 text-rose-700" : "border-gray-200 text-gray-600 hover:bg-gray-50",
            )}
            onClick={() => setShowSaved((v) => !v)}
            aria-pressed={showSaved}
            data-testid="button-saved-property-shortlist"
          >
            <Heart className="h-3 w-3" aria-hidden="true" />
            {showSaved ? inboxText("inboxUi.backToMatches") : inboxText("inboxUi.shortlistCount", { count: savedListingIds.length })}
          </button>
        </div>
      </div>

      {showSaved ? (
        <SavedInventoryMatches
          contactId={contactId}
          contactFirstName={contactFirstName}
          onInsertComposerDraft={onInsertComposerDraft}
          onSavedChange={refreshSavedState}
        />
      ) : (
      <>
      {isLoading && !hasCachedMatches && (
        <div className="flex items-center gap-1.5 py-2 text-[11px] text-gray-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          {inboxText("inboxUi.findingMatches")}
        </div>
      )}

      {(showBlockingFetchError || showListingFetchFailed) && (
        <p
          className="text-[11px] text-amber-700 leading-snug py-1"
          data-testid="matching-listings-fetch-error"
        >
          {inboxText("inboxUi.unableToLoadMatchingListingsRightNow")}
          {isRateLimited ? inboxText("inboxUi.pleaseWaitAMomentAndTryAgain") : ""}
        </p>
      )}

      {showHealthDiagnostics && (isFetched || isError) && (
        <InventoryHealthDiagnosticsPanel
          diagnostics={firstPage?.diagnostics}
          clientError={clientErrorMessage ?? firstPage?.error ?? null}
          lastClientFetchAt={lastClientFetchAt}
          reason={firstPage?.reason}
          compact={compact}
          rateLimitWarning={isRateLimited}
        />
      )}

      {showEmpty && (
        <p className="text-[11px] text-gray-500 leading-snug py-1">
          {firstPage?.reason === "no_buyer_preferences" || firstPage?.reason === "no_active_inventory"
            ? inboxText("inboxUi.matchesWillAppearOnceBuyerPreferencesAndInventory")
            : showHealthDiagnostics && firstPage?.diagnostics?.noMatchSummary?.trim()
              ? firstPage.diagnostics.noMatchSummary.trim()
              : inboxText("inboxUi.noStrongMatchesInActiveInventoryYet")}
        </p>
      )}

      {matches.length > 0 && (
        <div
          className="min-w-0"
          data-testid="matching-listings-cards"
          data-match-count={totalFound}
          data-rendered-count={showingCount}
        >
          <div className="space-y-1.5" ref={cardsContainerRef}>
            {matches.map((match: InventoryMatchResult, index) => (
              <InventoryMatchRecommendationCard
                key={match.listingId}
                contactId={contactId}
                contactFirstName={contactFirstName}
                match={match}
                imagePriority={index < 2}
                saved={savedSet.has(match.listingId)}
                onSavedChange={refreshSavedState}
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
                disabled={isFetchingNextPage}
                data-testid="button-view-more-matches"
              >
                {isFetchingNextPage ? inboxText("inboxUi.loadingMore") : inboxText("inboxUi.viewMore")}
              </Button>
            )}
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
