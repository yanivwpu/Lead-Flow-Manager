import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, ExternalLink, Heart, Home, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { InventoryMatchResult, InventoryMatchesResponse } from "@shared/inventory/inventoryMatchTypes";
import { fetchInventoryStatus } from "@/lib/inventoryApi";
import { apiRequest } from "@/lib/queryClient";

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

type ListingDetail = {
  listing: {
    id: string;
    city: string | null;
    state: string | null;
    addressLine1: string | null;
    priceCents: number | null;
    beds: string | number | null;
    baths: string | number | null;
    propertyType: string | null;
    description: string | null;
    listingUrl: string | null;
    photos: { url: string; order?: number }[];
    status: string;
  };
};

function ListingDetailDialog({
  listingId,
  fallback,
  open,
  onOpenChange,
}: {
  listingId: string | null;
  fallback: InventoryMatchResult["listing"] | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/inventory/listings", listingId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/inventory/listings/${listingId}`);
      return res.json() as Promise<ListingDetail>;
    },
    enabled: open && !!listingId,
    staleTime: 60_000,
  });

  const listing = data?.listing;
  const photo =
    listing?.photos?.[0]?.url ?? fallback?.thumbnailUrl ?? null;
  const city = listing?.city ?? fallback?.city;
  const state = listing?.state ?? fallback?.state;
  const priceCents = listing?.priceCents ?? fallback?.priceCents ?? null;
  const beds = listing?.beds != null ? Number(listing.beds) : fallback?.beds;
  const baths = listing?.baths != null ? Number(listing.baths) : fallback?.baths;
  const listingUrl = listing?.listingUrl ?? fallback?.listingUrl ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 overflow-hidden">
        <div className="h-36 bg-gray-100">
          {photo ? (
            <img src={photo} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Home className="h-8 w-8 text-gray-300" />
            </div>
          )}
        </div>
        <div className="p-4 space-y-2">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="text-base">
              {[city, state].filter(Boolean).join(", ") || "Listing"}
            </DialogTitle>
            <DialogDescription className="text-sm font-medium text-gray-900">
              {formatPrice(priceCents)}
            </DialogDescription>
          </DialogHeader>
          {formatBedsBaths(beds ?? null, baths ?? null) && (
            <p className="text-xs text-gray-600">{formatBedsBaths(beds ?? null, baths ?? null)}</p>
          )}
          {(listing?.addressLine1 ?? fallback?.addressLine1) && (
            <p className="text-xs text-gray-500">{listing?.addressLine1 ?? fallback?.addressLine1}</p>
          )}
          {isLoading && !listing && (
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading details…
            </p>
          )}
          {listing?.description && (
            <p className="text-xs text-gray-600 line-clamp-4 leading-relaxed">{listing.description}</p>
          )}
          {listingUrl && (
            <Button asChild size="sm" variant="outline" className="w-full mt-2">
              <a href={listingUrl} target="_blank" rel="noreferrer">
                Open listing URL
                <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </a>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MatchListingCard({
  contactId,
  match,
  saved,
  onSavedChange,
}: {
  contactId: string;
  match: InventoryMatchResult;
  saved: boolean;
  onSavedChange: () => void;
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
    if (match.listing.listingUrl) {
      window.open(match.listing.listingUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setDetailOpen(true);
  }, [match.listing.listingUrl]);

  return (
    <>
      <div
        className="rounded-md border border-gray-200 bg-white p-2 shadow-sm"
        data-testid={`inventory-match-${match.listingId}`}
      >
        <div className="flex gap-2">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-gray-100 flex items-center justify-center">
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
          <div className="min-w-0 flex-1 flex items-center">
            <p className="text-[11px] text-gray-900 truncate leading-snug min-w-0">
              {cityLine && <span className="font-semibold">{cityLine}</span>}
              <span className="font-medium text-gray-800">
                {cityLine ? " · " : ""}
                {formatPrice(match.listing.priceCents)}
              </span>
              {bedsBaths && <span className="text-gray-500"> · {bedsBaths}</span>}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-0.5 self-start">
            <Badge
              variant="outline"
              className={cn(
                "text-[9px] px-1.5 py-0 h-5 font-semibold tabular-nums",
                scoreBadgeClass(match.score),
              )}
              title="Match score"
            >
              {match.score}
            </Badge>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-5 w-5 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                    onClick={viewListing}
                    aria-label="View listing"
                    data-testid={`button-view-listing-${match.listingId}`}
                  >
                    <Eye className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left">View listing</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
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
                </TooltipTrigger>
                <TooltipContent side="left">Save to buyer shortlist</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {match.reasons.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 pl-[4.25rem]">
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
        listingId={match.listingId}
        fallback={match.listing}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </>
  );
}

function AllMatchesDialog({
  contactId,
  matches,
  savedListingIds,
  open,
  onOpenChange,
  onSavedChange,
}: {
  contactId: string;
  matches: InventoryMatchResult[];
  savedListingIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSavedChange: () => void;
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
          <DialogDescription className="text-xs">
            Ranked by buyer preference fit. Internal preview only — not sent to the contact.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[min(70vh,520px)] px-4 pb-4">
          <div className="space-y-2 pr-3">
            {matches.map((match) => (
              <MatchListingCard
                key={match.listingId}
                contactId={contactId}
                match={match}
                saved={savedSet.has(match.listingId)}
                onSavedChange={onSavedChange}
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
  compact?: boolean;
}

export function MatchingListingsPanel({ contactId, compact = true }: MatchingListingsPanelProps) {
  const [allMatchesOpen, setAllMatchesOpen] = useState(false);
  const { data: inventoryStatus } = useQuery({
    queryKey: ["/api/inventory/status"],
    queryFn: fetchInventoryStatus,
    staleTime: 60_000,
  });

  const enabled = !!contactId && !!inventoryStatus?.canUse;

  const { data, isLoading, isFetched, refetch } = useQuery({
    queryKey: [`/api/contacts/${contactId}/inventory-matches`],
    queryFn: () => fetchInventoryMatches(contactId),
    enabled,
    staleTime: 30_000,
  });

  if (!inventoryStatus?.featureEnabled) return null;
  if (!inventoryStatus.rgeInstalled) return null;
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

  if (!enabled && !isLoading) return null;
  if (isFetched && !data?.eligible && data?.reason === "feature_disabled") return null;

  return (
    <div
      className={cn(compact ? "mt-0" : "mt-3")}
      data-testid="matching-listings-panel"
    >
      <div className={cn("flex items-center justify-between gap-2", compact ? "mb-1" : "mb-2")}>
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
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-violet-200 text-violet-700 shrink-0">
            Internal preview
          </Badge>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center gap-1.5 py-2 text-[11px] text-gray-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          Scoring inventory…
        </div>
      )}

      {showEmpty && (
        <p className="text-[11px] text-gray-500 leading-snug py-1">
          {data?.reason === "no_buyer_preferences"
            ? "Add buyer preferences to preview MLS matches."
            : data?.reason === "no_active_inventory"
              ? "Connect and sync MLS inventory to preview matches."
              : "No strong matches in active inventory yet."}
        </p>
      )}

      {previewMatches.length > 0 && (
        <div className="space-y-2 mt-1">
          {previewMatches.map((match) => (
            <MatchListingCard
              key={match.listingId}
              contactId={contactId}
              match={match}
              saved={savedSet.has(match.listingId)}
              onSavedChange={() => void refetch()}
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
        matches={matches}
        savedListingIds={savedListingIds}
        open={allMatchesOpen}
        onOpenChange={setAllMatchesOpen}
        onSavedChange={() => void refetch()}
      />
    </div>
  );
}
