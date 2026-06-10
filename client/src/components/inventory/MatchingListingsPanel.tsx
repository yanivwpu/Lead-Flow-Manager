import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Heart, Home, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
import { apiRequest } from "@/lib/queryClient";
import { ListingDetailDialog } from "@/components/inventory/ListingDetailDialog";
import { InventoryHealthDiagnosticsPanel } from "@/components/inventory/InventoryHealthDiagnosticsPanel";
import type { CopilotComposerInsert } from "@/lib/copilotComposerInsert";
import { shouldShowInventoryHealthDiagnostics } from "@/lib/copilotRgeVisibility";

function formatPrice(cents: number | null): string {
  if (cents == null) return "Price on request";
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(2).replace(/\.00$/, "")}M`;
  if (dollars >= 1_000) return `$${Math.round(dollars / 1_000).toLocaleString()}k`;
  return `$${Math.round(dollars).toLocaleString()}`;
}

function formatBedsBaths(beds: number | null, baths: number | null): string | null {
  const parts: string[] = [];
  if (beds != null) parts.push(`${beds % 1 === 0 ? beds : beds.toFixed(1)} bd`);
  if (baths != null) parts.push(`${baths % 1 === 0 ? baths : baths.toFixed(1)} ba`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function scoreBadgeClass(score: number): string {
  if (score >= 85) return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (score >= 65) return "bg-sky-100 text-sky-800 border-sky-200";
  if (score >= 45) return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-gray-100 text-gray-700 border-gray-200";
}

async function fetchInventoryMatches(contactId: string): Promise<InventoryMatchesResponse> {
  const res = await fetch(`/api/contacts/${contactId}/inventory-matches`, {
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (res.status === 404) throw new Error("Contact not found");
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || "Failed to load matches");
  }
  return res.json() as Promise<InventoryMatchesResponse>;
}

const SIDEBAR_PREVIEW_LIMIT = 3;

function MatchListingCard({
  contactId,
  contactFirstName,
  match,
  saved,
  onSavedChange,
  onInsertComposerDraft,
}: {
  contactId: string;
  contactFirstName?: string;
  match: InventoryMatchResult;
  saved: boolean;
  onSavedChange: () => void;
  onInsertComposerDraft?: (draft: CopilotComposerInsert) => boolean;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const queryClient = useQueryClient();
  const cityLine = [match.listing.city, match.listing.state].filter(Boolean).join(", ");
  const bedsBaths = formatBedsBaths(match.listing.beds, match.listing.baths);

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
      <div
        className="rounded-md border border-gray-200 bg-white p-2.5 shadow-sm"
        data-testid={`inventory-match-${match.listingId}`}
      >
        <div className="flex gap-2.5">
          <div className="h-[4.5rem] w-16 shrink-0 overflow-hidden rounded-md bg-gray-100 flex items-center justify-center self-start">
            {match.listing.thumbnailUrl ? (
              <img
                src={match.listing.thumbnailUrl}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <Home className="h-5 w-5 text-gray-300" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1 self-start pr-1">
            {cityLine && (
              <p className="text-[11px] font-semibold text-gray-900 leading-snug truncate">
                {cityLine}
              </p>
            )}
            <p className="text-[11px] font-medium text-gray-800 leading-snug mt-0.5">
              {formatPrice(match.listing.priceCents)}
            </p>
            {bedsBaths && (
              <p className="text-[10px] text-gray-600 leading-snug mt-0.5">{bedsBaths}</p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1 self-start w-7">
            <Badge
              variant="outline"
              className={cn(
                "text-[9px] px-1.5 py-0 h-5 font-semibold tabular-nums",
                scoreBadgeClass(match.score),
              )}
            >
              {match.score}
            </Badge>
            <button
              type="button"
              className="inline-flex h-5 w-5 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              onClick={viewListing}
              aria-label="View listing"
              data-testid={`button-view-listing-${match.listingId}`}
            >
              <Eye className="h-3 w-3" />
            </button>
            <button
              type="button"
              className={cn(
                "inline-flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-gray-100",
                saved ? "text-rose-500 hover:text-rose-600" : "text-gray-400 hover:text-gray-600",
              )}
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              aria-label="Save to buyer shortlist"
              aria-pressed={saved}
              data-testid={`button-save-match-${match.listingId}`}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Heart
                  className={cn(
                    "h-3 w-3",
                    saved ? "fill-rose-500 text-rose-500" : "",
                  )}
                />
              )}
            </button>
          </div>
        </div>

        {match.reasons.length > 0 && (
          <ul className="mt-2 space-y-0.5 pl-[4.5rem]">
            {match.reasons.slice(0, 4).map((reason) => (
              <li key={reason} className="text-[10px] text-violet-800/90 leading-snug flex gap-1">
                <span className="text-violet-400 shrink-0">•</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

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
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2 text-left space-y-1">
          <DialogTitle className="text-base flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-violet-500" aria-hidden />
            Matching Listings ({matches.length})
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-500">
            These matches are for your review only. Ranked by buyer preference fit.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[min(70vh,520px)] px-4 pb-4">
          <div className="space-y-2.5 pr-3">
            {matches.map((match) => (
              <MatchListingCard
                key={match.listingId}
                contactId={contactId}
                contactFirstName={contactFirstName}
                match={match}
                saved={savedSet.has(match.listingId)}
                onSavedChange={onSavedChange}
                onInsertComposerDraft={onInsertComposerDraft}
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
  onInsertComposerDraft?: (draft: CopilotComposerInsert) => boolean;
}

export function MatchingListingsPanel({
  contactId,
  contactFirstName,
  compact = true,
  isWorkspaceAdmin = false,
  onInsertComposerDraft,
}: MatchingListingsPanelProps) {
  const [allMatchesOpen, setAllMatchesOpen] = useState(false);
  const [lastClientFetchAt, setLastClientFetchAt] = useState<string | null>(null);
  const showHealthDiagnostics = shouldShowInventoryHealthDiagnostics({
    isDev: import.meta.env.DEV,
    isWorkspaceAdmin,
  });
  const { data: inventoryStatus } = useQuery({
    queryKey: ["/api/inventory/status"],
    queryFn: fetchInventoryStatus,
    staleTime: 60_000,
  });

  const enabled = !!contactId && !!inventoryStatus?.canUse;

  const { data, isLoading, isFetched, isError, error, refetch } = useQuery({
    queryKey: [`/api/contacts/${contactId}/inventory-matches`],
    queryFn: () => fetchInventoryMatches(contactId),
    enabled,
    staleTime: 0,
  });

  useEffect(() => {
    if (!isFetched && !isError) return;
    setLastClientFetchAt(new Date().toISOString());
  }, [isFetched, isError, contactId, data?.diagnostics?.lastMatchRunAt]);

  if (!inventoryStatus) return null;
  if (!inventoryStatus.canUse) return null;
  if (!contactId) return null;

  const matches = data?.matches ?? [];
  const matchCount = data?.matchCount ?? matches.length;
  const previewMatches = matches.slice(0, SIDEBAR_PREVIEW_LIMIT);
  const savedListingIds = data?.savedListingIds ?? [];
  const savedSet = new Set(savedListingIds);
  const hasMoreMatches = matches.length > SIDEBAR_PREVIEW_LIMIT;
  const showEmpty =
    isFetched &&
    data?.eligible &&
    matches.length === 0 &&
    (data.reason === "no_matches" ||
      data.reason === "no_buyer_preferences" ||
      data.reason === "no_active_inventory");

  const showFetchError =
    isError ||
    (isFetched && data?.reason === "listing_fetch_failed");

  if (!enabled && !isLoading) return null;
  if (isFetched && !data?.eligible && data?.reason === "feature_disabled") return null;

  return (
    <div
      className={cn(compact ? "mt-0" : "mt-3")}
      data-testid="matching-listings-panel"
    >
      <div className={cn(compact ? "mb-1" : "mb-2")}>
        <span
          className={cn(
            "font-semibold uppercase tracking-wide flex items-center gap-1 min-w-0",
            compact ? "text-[9px] text-gray-500" : "text-xs text-gray-600",
          )}
        >
          <Sparkles className="h-3 w-3 text-violet-500 shrink-0" aria-hidden />
          <span className="truncate">
            Matching Listings{matchCount > 0 ? ` (${matchCount})` : ""}
          </span>
        </span>
        {matches.length > 0 && (
          <p className="text-[10px] text-gray-400 leading-snug mt-0.5">
            These matches are for your review only.
          </p>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center gap-1.5 py-2 text-[11px] text-gray-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          Scoring inventory…
        </div>
      )}

      {showFetchError && (
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
          clientError={
            isError
              ? error instanceof Error
                ? error.message
                : "Request failed"
              : data?.error ?? null
          }
          lastClientFetchAt={lastClientFetchAt}
          reason={data?.reason}
          compact={compact}
        />
      )}

      {showEmpty && (
        <p className="text-[11px] text-gray-500 leading-snug py-1">
          {data?.reason === "no_buyer_preferences"
            ? "Matches will appear once buyer preferences and inventory are available."
            : data?.reason === "no_active_inventory"
              ? "Matches will appear once buyer preferences and inventory are available."
              : "No strong matches in active inventory yet."}
        </p>
      )}

      {previewMatches.length > 0 && (
        <div
          className="space-y-2 mt-1"
          data-testid="matching-listings-cards"
          data-match-count={matches.length}
          data-rendered-count={previewMatches.length}
        >
          {previewMatches.map((match) => (
            <MatchListingCard
              key={match.listingId}
              contactId={contactId}
              contactFirstName={contactFirstName}
              match={match}
              saved={savedSet.has(match.listingId)}
              onSavedChange={() => void refetch()}
              onInsertComposerDraft={onInsertComposerDraft}
            />
          ))}
          {hasMoreMatches && (
            <button
              type="button"
              className="text-[10px] font-medium text-violet-700 hover:text-violet-900 hover:underline w-full text-left py-0.5"
              onClick={() => setAllMatchesOpen(true)}
              data-testid="button-view-all-matches"
            >
              View all matches
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
