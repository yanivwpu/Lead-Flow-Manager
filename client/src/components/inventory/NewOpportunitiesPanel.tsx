import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Heart, Home, Loader2, Sparkles, Tag, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type {
  InventoryOpportunitiesResponse,
  InventoryOpportunityResult,
} from "@shared/inventory/inventoryOpportunityTypes";
import { fetchInventoryStatus } from "@/lib/inventoryApi";
import { apiRequest } from "@/lib/queryClient";

function formatPrice(cents: number | null): string {
  if (cents == null) return "Price on request";
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(2).replace(/\.00$/, "")}M`;
  if (dollars >= 1_000) return `$${Math.round(dollars / 1_000).toLocaleString()}k`;
  return `$${Math.round(dollars).toLocaleString()}`;
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

function OpportunityCard({
  contactId,
  opportunity,
  onChange,
}: {
  contactId: string;
  opportunity: InventoryOpportunityResult;
  onChange: () => void;
}) {
  const queryClient = useQueryClient();
  const saved = opportunity.status === "saved";

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
    }
  }, [opportunity.listing.listingUrl, opportunity.status, statusMutation]);

  const cityLine = [opportunity.listing.city, opportunity.listing.state].filter(Boolean).join(", ");

  return (
    <div
      className="rounded-md border border-violet-100 bg-violet-50/30 p-2 shadow-sm"
      data-testid={`inventory-opportunity-${opportunity.id}`}
    >
      <div className="flex gap-2">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-gray-100 flex items-center justify-center">
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
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-gray-900 truncate">{opportunity.headline}</p>
              {opportunity.opportunityType === "price_reduced" && cityLine && (
                <p className="text-[10px] text-gray-600 truncate">{cityLine}</p>
              )}
              {opportunity.priceReductionLabel && (
                <p className="text-[10px] font-medium text-emerald-700 flex items-center gap-0.5 mt-0.5">
                  <Tag className="h-3 w-3 shrink-0" aria-hidden />
                  {opportunity.priceReductionLabel}
                </p>
              )}
              <p className="text-[10px] text-gray-500 mt-0.5">
                {formatPrice(opportunity.listing.priceCents)}
                <span className="text-gray-400 mx-1">·</span>
                {opportunity.score}% match
              </p>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                onClick={viewListing}
                aria-label="View listing"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className={cn(
                  "inline-flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-gray-100",
                  saved ? "text-rose-500 hover:text-rose-600" : "text-gray-400 hover:text-gray-700",
                )}
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
                aria-label="Save to buyer shortlist"
                aria-pressed={saved}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Heart className={cn("h-3.5 w-3.5", saved ? "fill-rose-500 text-rose-500" : "")} />
                )}
              </button>
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate("dismissed")}
                aria-label="Dismiss opportunity"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <Badge
                variant="outline"
                className={cn(
                  "text-[9px] px-1.5 py-0 h-5 font-semibold tabular-nums ml-0.5",
                  scoreBadgeClass(opportunity.score),
                )}
              >
                {opportunity.score}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {opportunity.reasons.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 pl-[3.75rem]">
          {opportunity.reasons.slice(0, 3).map((reason) => (
            <li key={reason} className="text-[10px] text-violet-800/90 leading-snug flex gap-1">
              <span className="text-violet-400 shrink-0">•</span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface NewOpportunitiesPanelProps {
  contactId: string;
  compact?: boolean;
}

export function NewOpportunitiesPanel({ contactId, compact = true }: NewOpportunitiesPanelProps) {
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
  const activeCount = opportunities.filter((o) => o.status === "new" || o.status === "viewed").length;
  const showDevDiagnostics = import.meta.env.DEV && isFetched;

  if (!enabled && !isLoading) return null;
  if (isFetched && !data?.eligible && data?.reason === "feature_disabled") return null;
  if (isFetched && data?.eligible && opportunities.length === 0 && !import.meta.env.DEV) return null;

  return (
    <div className={cn(compact ? "mt-0" : "mt-3")} data-testid="new-opportunities-panel">
      <div className={cn("flex items-center justify-between", compact ? "mb-1" : "mb-2")}>
        <span
          className={cn(
            "font-semibold uppercase tracking-wide flex items-center gap-1",
            compact ? "text-[9px] text-gray-500" : "text-xs text-gray-600",
          )}
        >
          <Sparkles className="h-3 w-3 text-violet-500" aria-hidden />
          New Opportunities{activeCount > 0 ? ` (${activeCount})` : ""}
        </span>
      </div>

      {isLoading && (
        <div className="flex items-center gap-1.5 py-2 text-[11px] text-gray-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading opportunities…
        </div>
      )}

      {opportunities.length > 0 && (
        <div className="space-y-2 mt-1">
          {opportunities.map((opportunity) => (
            <OpportunityCard
              key={opportunity.id}
              contactId={contactId}
              opportunity={opportunity}
              onChange={() => void refetch()}
            />
          ))}
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
    </div>
  );
}
