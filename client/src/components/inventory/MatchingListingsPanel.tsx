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
      className={cn(compact ? "mt-2 min-w-0" : "mt-3")}
      data-testid="matching-listings-panel"
    >
      <div className={cn(compact ? "mb-1 px-0.5" : "mb-2")}>
        <span
          className={cn(
            "font-semibold uppercase tracking-wide flex items-center gap-1.5 min-w-0",
            compact ? "text-[10px] text-gray-600" : "text-xs text-gray-600",
          )}
        >
          <Sparkles className="h-3.5 w-3.5 text-violet-500 shrink-0" aria-hidden />
          <span className="truncate">
            Inventory Matches{matchCount > 0 ? ` (${matchCount})` : ""}
          </span>
        </span>
        {matches.length > 0 && !compact && (
          <p className="text-[10px] text-gray-400 leading-snug mt-0.5">
            For your review — ranked by buyer fit.
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
              className="mt-2.5 block w-full text-left px-0.5 text-[11px] font-medium leading-snug text-violet-700 hover:text-violet-900 hover:underline"
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
