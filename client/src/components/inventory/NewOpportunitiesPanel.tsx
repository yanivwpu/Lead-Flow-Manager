import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, ExternalLink, Heart, Home, Loader2, Sparkles, X } from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  InventoryOpportunitiesResponse,
  InventoryOpportunityResult,
} from "@shared/inventory/inventoryOpportunityTypes";
import { fetchInventoryStatus } from "@/lib/inventoryApi";
import { apiRequest } from "@/lib/queryClient";

const SIDEBAR_PREVIEW_LIMIT = 3;

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

async function fetchInventoryOpportunities(contactId: string): Promise<InventoryOpportunitiesResponse> {
  const res = await fetch(`/api/contacts/${contactId}/inventory-opportunities`, {
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (res.status === 404) throw new Error("Contact not found");
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || "Failed to load opportunities");
  }
  return res.json() as Promise<InventoryOpportunitiesResponse>;
}

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
  fallback: InventoryOpportunityResult["listing"] | null;
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
  const photo = listing?.photos?.[0]?.url ?? fallback?.thumbnailUrl ?? null;
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

function OpportunityCard({
  contactId,
  opportunity,
  onChange,
}: {
  contactId: string;
  opportunity: InventoryOpportunityResult;
  onChange: () => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const queryClient = useQueryClient();
  const saved = opportunity.status === "saved";
  const cityLine = [opportunity.listing.city, opportunity.listing.state].filter(Boolean).join(", ");
  const bedsBaths = formatBedsBaths(opportunity.listing.beds, opportunity.listing.baths);

  const statusMutation = useMutation({
    mutationFn: async (status: "viewed" | "saved" | "dismissed") => {
      await apiRequest(
        "PATCH",
        `/api/contacts/${contactId}/inventory-opportunities/${opportunity.id}`,
        { status },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/contacts/${contactId}/inventory-opportunities`] });
      onChange();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (saved) {
        await apiRequest(
          "DELETE",
          `/api/contacts/${contactId}/inventory-matches/saved/${opportunity.listingId}`,
        );
        return;
      }
      await apiRequest("POST", `/api/contacts/${contactId}/inventory-matches/saved`, {
        listingId: opportunity.listingId,
        score: opportunity.score,
        reasons: opportunity.reasons,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/contacts/${contactId}/inventory-opportunities`] });
      queryClient.invalidateQueries({ queryKey: [`/api/contacts/${contactId}/inventory-matches`] });
      onChange();
    },
  });

  const viewListing = useCallback(() => {
    if (opportunity.status === "new") {
      void statusMutation.mutateAsync("viewed");
    }
    if (opportunity.listing.listingUrl) {
      window.open(opportunity.listing.listingUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setDetailOpen(true);
  }, [opportunity.listing.listingUrl, opportunity.status, statusMutation]);

  const displayReasons = opportunity.reasons.slice(0, 3);

  return (
    <>
      <div
        className="rounded-md border border-gray-200 bg-white p-2.5 shadow-sm"
        data-testid={`inventory-opportunity-${opportunity.id}`}
      >
        <div className="flex gap-2.5">
          <div className="h-[4.5rem] w-16 shrink-0 overflow-hidden rounded-md bg-gray-100 flex items-center justify-center self-start">
            {opportunity.listing.thumbnailUrl ? (
              <img
                src={opportunity.listing.thumbnailUrl}
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
            {!cityLine && opportunity.opportunityType === "price_reduced" && (
              <p className="text-[11px] font-semibold text-gray-900 leading-snug truncate">
                Price Reduced
              </p>
            )}
            <p className="text-[11px] font-medium text-gray-800 leading-snug mt-0.5">
              {formatPrice(opportunity.listing.priceCents)}
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
                scoreBadgeClass(opportunity.score),
              )}
            >
              {opportunity.score}
            </Badge>
            <button
              type="button"
              className="inline-flex h-5 w-5 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              onClick={viewListing}
              aria-label="View listing"
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
            <button
              type="button"
              className="inline-flex h-5 w-5 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate("dismissed")}
              aria-label="Dismiss opportunity"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>

        {displayReasons.length > 0 && (
          <ul className="mt-2 space-y-0.5 pl-[4.5rem]">
            {displayReasons.map((reason) => (
              <li key={reason} className="text-[10px] text-violet-800/90 leading-snug flex gap-1">
                <span className="text-violet-400 shrink-0">•</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ListingDetailDialog
        listingId={opportunity.listingId}
        fallback={opportunity.listing}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </>
  );
}

function AllOpportunitiesDialog({
  contactId,
  opportunities,
  open,
  onOpenChange,
  onChange,
}: {
  contactId: string;
  opportunities: InventoryOpportunityResult[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2 text-left space-y-1">
          <DialogTitle className="text-base flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-violet-500" aria-hidden />
            New Opportunities ({opportunities.length})
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-500">
            Internal preview only — ranked by buyer preference fit. Not sent to the contact.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[min(70vh,520px)] px-4 pb-4">
          <div className="space-y-2.5 pr-3">
            {opportunities.map((opportunity) => (
              <OpportunityCard
                key={opportunity.id}
                contactId={contactId}
                opportunity={opportunity}
                onChange={onChange}
              />
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

interface NewOpportunitiesPanelProps {
  contactId: string;
  compact?: boolean;
}

export function NewOpportunitiesPanel({ contactId, compact = true }: NewOpportunitiesPanelProps) {
  const [allOpportunitiesOpen, setAllOpportunitiesOpen] = useState(false);
  const { data: inventoryStatus } = useQuery({
    queryKey: ["/api/inventory/status"],
    queryFn: fetchInventoryStatus,
    staleTime: 60_000,
  });

  const enabled = !!contactId && !!inventoryStatus?.canUse;

  const { data, isLoading, isFetched, refetch } = useQuery({
    queryKey: [`/api/contacts/${contactId}/inventory-opportunities`],
    queryFn: () => fetchInventoryOpportunities(contactId),
    enabled,
    staleTime: 30_000,
  });

  if (!inventoryStatus?.featureEnabled) return null;
  if (!inventoryStatus.rgeInstalled) return null;
  if (!contactId) return null;

  const opportunities = data?.opportunities ?? [];
  const opportunityCount = data?.opportunityCount ?? opportunities.length;
  const previewOpportunities = opportunities.slice(0, SIDEBAR_PREVIEW_LIMIT);
  const hasMoreOpportunities = opportunities.length > SIDEBAR_PREVIEW_LIMIT;
  const showDevDiagnostics = import.meta.env.DEV && isFetched;

  if (!enabled && !isLoading) return null;
  if (isFetched && !data?.eligible && data?.reason === "feature_disabled") return null;
  if (isFetched && data?.eligible && opportunities.length === 0 && !import.meta.env.DEV) return null;

  return (
    <div className={cn(compact ? "mt-0" : "mt-3")} data-testid="new-opportunities-panel">
      <div className={cn(compact ? "mb-1" : "mb-2")}>
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "font-semibold uppercase tracking-wide flex items-center gap-1 min-w-0",
              compact ? "text-[9px] text-gray-500" : "text-xs text-gray-600",
            )}
          >
            <Sparkles className="h-3 w-3 text-violet-500 shrink-0" aria-hidden />
            <span className="truncate">
              New Opportunities{opportunityCount > 0 ? ` (${opportunityCount})` : ""}
            </span>
          </span>
          {opportunities.length > 0 && (
            <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-violet-200 text-violet-700 shrink-0">
              Internal preview
            </Badge>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-1.5 py-2 text-[11px] text-gray-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading opportunities…
        </div>
      )}

      {previewOpportunities.length > 0 && (
        <div className="space-y-2 mt-1">
          {previewOpportunities.map((opportunity) => (
            <OpportunityCard
              key={opportunity.id}
              contactId={contactId}
              opportunity={opportunity}
              onChange={() => void refetch()}
            />
          ))}
          {hasMoreOpportunities && (
            <button
              type="button"
              className="text-[10px] font-medium text-violet-700 hover:text-violet-900 hover:underline w-full text-left py-0.5"
              onClick={() => setAllOpportunitiesOpen(true)}
              data-testid="button-view-all-opportunities"
            >
              View all opportunities
            </button>
          )}
        </div>
      )}

      {showDevDiagnostics && opportunities.length === 0 && !isLoading && (
        <p
          className="text-[9px] text-gray-400 leading-snug font-mono mt-1"
          data-testid="new-opportunities-diagnostics"
        >
          eligible={String(data?.eligible ?? false)} reason={data?.reason ?? "—"} count=
          {data?.opportunityCount ?? 0}
        </p>
      )}

      <AllOpportunitiesDialog
        contactId={contactId}
        opportunities={opportunities}
        open={allOpportunitiesOpen}
        onOpenChange={setAllOpportunitiesOpen}
        onChange={() => void refetch()}
      />
    </div>
  );
}
