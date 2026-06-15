import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { InventoryMatchResult, InventoryMatchesResponse } from "@shared/inventory/inventoryMatchTypes";
import { fetchInventoryStatus } from "@/lib/inventoryApi";
import { InventoryHealthDiagnosticsPanel } from "@/components/inventory/InventoryHealthDiagnosticsPanel";
import { InventoryMatchRecommendationCard } from "@/components/inventory/InventoryMatchRecommendationCard";
import type { CopilotComposerInsert } from "@/lib/copilotComposerInsert";
import { shouldShowInventoryHealthDiagnostics } from "@/lib/copilotRgeVisibility";
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

const SIDEBAR_PREVIEW_LIMIT = 5;

function AllMatchesDialog({
  contactId,
  contactFirstName,
  matches,
  savedListingIds,
  open,
  onOpenChange,
  onSavedChange,
  onInsertComposerDraft,
}: {
  contactId: string;
  contactFirstName?: string;
  matches: InventoryMatchResult[];
  savedListingIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSavedChange: () => void;
  onInsertComposerDraft?: (draft: CopilotComposerInsert) => boolean;
}) {
  const savedSet = new Set(savedListingIds);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2 text-left space-y-1">
          <DialogTitle className="text-base flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-violet-500" aria-hidden />
            Matching Listings ({matches.length})
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-500">
            These matches are for your review only. Ranked by buyer preference fit.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[min(70vh,560px)] px-4 pb-4">
          <div className="space-y-2 pr-3">
            {matches.map((match) => (
              <InventoryMatchRecommendationCard
                key={match.listingId}
                contactId={contactId}
                contactFirstName={contactFirstName}
                match={match}
                saved={savedSet.has(match.listingId)}
                onSavedChange={onSavedChange}
                onInsertComposerDraft={onInsertComposerDraft}
                layout="modal"
              />
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

interface MatchingListingsPanelProps {
  contactId: string;
  contactFirstName?: string;
  compact?: boolean;
  isWorkspaceAdmin?: boolean;
  /** When false, hide the entire panel (non-inventory contact). */
  inventoryRelevant?: boolean;
  /** When false, hide inventory health diagnostics (non-inventory contact). */
  showHealthDiagnostics?: boolean;
  onInsertComposerDraft?: (draft: CopilotComposerInsert) => boolean;
}

export function MatchingListingsPanel({
  contactId,
  contactFirstName,
  compact = true,
  isWorkspaceAdmin = false,
  inventoryRelevant = true,
  showHealthDiagnostics: showHealthDiagnosticsProp = false,
  onInsertComposerDraft,
}: MatchingListingsPanelProps) {
  const [allMatchesOpen, setAllMatchesOpen] = useState(false);
  const [lastClientFetchAt, setLastClientFetchAt] = useState<string | null>(null);
  const showHealthDiagnostics =
    showHealthDiagnosticsProp &&
    shouldShowInventoryHealthDiagnostics({
      isDev: import.meta.env.DEV,
      isWorkspaceAdmin,
    });
  const { data: inventoryStatus } = useQuery({
    queryKey: ["/api/inventory/status"],
    queryFn: fetchInventoryStatus,
    staleTime: 60_000,
  });

  const enabled = inventoryRelevant && !!contactId && !!inventoryStatus?.canUse;

  const { data, isLoading, isFetched, isError, error, isFetching, refetch, isPlaceholderData } =
    useQuery({
      queryKey: inventoryMatchesQueryKey(contactId),
      queryFn: () => fetchInventoryMatches(contactId),
      enabled,
      staleTime: INVENTORY_MATCHES_STALE_MS,
      placeholderData: (previousData, previousQuery) =>
        inventoryMatchesPlaceholderData(contactId, previousData, previousQuery),
      retry: shouldRetryInventoryMatches,
      retryDelay: inventoryMatchesRetryDelay,
    });

  useEffect(() => {
    setLastClientFetchAt(null);
    setAllMatchesOpen(false);
  }, [contactId]);

  useEffect(() => {
    if (!isFetched && !isError) return;
    if (!isError && !isPlaceholderData) {
      setLastClientFetchAt(new Date().toISOString());
    }
  }, [isFetched, isError, isPlaceholderData, contactId, data?.diagnostics?.lastMatchRunAt]);

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
      inventoryFilters: data.diagnostics?.activeFilterSummary ?? null,
      matchCount: data.matchCount ?? data.matches?.length ?? 0,
      returnedListings: summarizeListingsForTrace(data.matches ?? []),
      displayedCardCount: (data.matches ?? []).slice(0, SIDEBAR_PREVIEW_LIMIT).length,
    });
  }, [contactId, data, isFetched, isError, isPlaceholderData]);

  if (!inventoryRelevant) return null;
  if (!inventoryStatus) return null;
  if (!inventoryStatus.canUse) return null;
  if (!contactId) return null;

  const matches = data?.matches ?? [];
  const matchCount = data?.matchCount ?? matches.length;
  const qualifyingCount = data?.diagnostics?.totalQualifyingMatches;
  const matchCountLabel =
    qualifyingCount != null && qualifyingCount !== matches.length
      ? `${qualifyingCount} (${matches.length} shown)`
      : String(matchCount);
  const previewMatches = matches.slice(0, SIDEBAR_PREVIEW_LIMIT);
  const savedListingIds = data?.savedListingIds ?? [];
  const savedSet = new Set(savedListingIds);
  const hasMoreMatches = matches.length > SIDEBAR_PREVIEW_LIMIT;
  const hasCachedMatches = inventoryMatchesHasDisplayableResults(data);
  const isRateLimited = isError && isRateLimitedInventoryMatchesError(error);
  const clientErrorMessage =
    isError && error instanceof Error ? error.message : null;

  const showEmpty =
    isFetched &&
    !isError &&
    data?.eligible &&
    matches.length === 0 &&
    (data.reason === "no_matches" ||
      data.reason === "no_buyer_preferences" ||
      data.reason === "no_active_inventory");

  const showBlockingFetchError =
    isError &&
    !hasCachedMatches &&
    !isLoading;

  const showListingFetchFailed =
    !isError &&
    isFetched &&
    data?.reason === "listing_fetch_failed" &&
    !hasCachedMatches;

  if (!enabled && !isLoading) return null;
  if (isFetched && !isError && data && !data.eligible && data.reason === "feature_disabled") return null;

  return (
    <div
      className={cn(compact ? "mt-2 min-w-0" : "mt-3")}
      data-testid="matching-listings-panel"
    >
      <div className={cn(compact ? "mb-1.5" : "mb-2")}>
        <span
          className={cn(
            "font-semibold uppercase tracking-wide flex items-center gap-1.5 min-w-0",
            compact ? "text-[10px] text-gray-600" : "text-xs text-gray-600",
          )}
        >
          <Sparkles className="h-3.5 w-3.5 text-violet-500 shrink-0" aria-hidden />
          <span className="truncate">
            Inventory Matches{matchCount > 0 ? ` (${matchCountLabel})` : ""}
          </span>
          {isFetching && hasCachedMatches && (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-gray-400" aria-hidden />
          )}
        </span>
        {matches.length > 0 && !compact && (
          <p className="text-[10px] text-gray-400 leading-snug mt-0.5">
            For your review — ranked by buyer fit.
          </p>
        )}
      </div>

      {isLoading && !hasCachedMatches && (
        <div className="flex items-center gap-1.5 py-2 text-[11px] text-gray-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          Scoring inventory…
        </div>
      )}

      {(showBlockingFetchError || showListingFetchFailed) && (
        <p
          className="text-[11px] text-amber-700 leading-snug py-1"
          data-testid="matching-listings-fetch-error"
        >
          Unable to load matching listings
          {data?.diagnostics
            ? ` (${data.diagnostics.matchesReturned} of ${data.diagnostics.activeInventoryCount} scored).`
            : "."}
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
          {data?.reason === "no_buyer_preferences"
            ? "Matches will appear once buyer preferences and inventory are available."
            : data?.reason === "no_active_inventory"
              ? "Matches will appear once buyer preferences and inventory are available."
              : data?.diagnostics?.noMatchSummary?.trim() ||
                "No strong matches in active inventory yet."}
        </p>
      )}

      {previewMatches.length > 0 && (
        <div
          className="min-w-0"
          data-testid="matching-listings-cards"
          data-match-count={matches.length}
          data-rendered-count={previewMatches.length}
        >
          <div className="space-y-1.5">
            {previewMatches.map((match) => (
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
          {hasMoreMatches && (
            <button
              type="button"
              className="mt-4 mb-3 block w-full text-left text-[11px] font-medium leading-snug text-violet-700 hover:text-violet-900 hover:underline"
              onClick={() => setAllMatchesOpen(true)}
              data-testid="button-view-all-matches"
            >
              View all matches ({matches.length})
            </button>
          )}
        </div>
      )}

      <AllMatchesDialog
        contactId={contactId}
        contactFirstName={contactFirstName}
        matches={matches}
        savedListingIds={savedListingIds}
        open={allMatchesOpen}
        onOpenChange={setAllMatchesOpen}
        onSavedChange={() => void refetch()}
        onInsertComposerDraft={onInsertComposerDraft}
      />
    </div>
  );
}
