import { useQuery } from "@tanstack/react-query";
import { Home, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { InventoryMatchesResponse } from "@shared/inventory/inventoryMatchTypes";
import { fetchInventoryStatus } from "@/lib/inventoryApi";

function formatPrice(cents: number | null): string {
  if (cents == null) return "—";
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(2).replace(/\.00$/, "")}M`;
  if (dollars >= 1_000) return `$${Math.round(dollars / 1_000)}k`;
  return `$${Math.round(dollars).toLocaleString()}`;
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

interface MatchingListingsPanelProps {
  contactId: string;
  compact?: boolean;
}

export function MatchingListingsPanel({ contactId, compact = true }: MatchingListingsPanelProps) {
  const { data: inventoryStatus } = useQuery({
    queryKey: ["/api/inventory/status"],
    queryFn: fetchInventoryStatus,
    staleTime: 60_000,
  });

  const enabled = !!contactId && !!inventoryStatus?.canUse;

  const { data, isLoading, isFetched } = useQuery({
    queryKey: [`/api/contacts/${contactId}/inventory-matches`],
    queryFn: () => fetchInventoryMatches(contactId),
    enabled,
    staleTime: 30_000,
  });

  if (!inventoryStatus?.featureEnabled) return null;
  if (!inventoryStatus.rgeInstalled) return null;
  if (!contactId) return null;

  const matches = data?.matches ?? [];
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
      <div className={cn("flex items-center justify-between", compact ? "mb-1" : "mb-2")}>
        <span
          className={cn(
            "font-semibold uppercase tracking-wide flex items-center gap-1",
            compact ? "text-[9px] text-gray-500" : "text-xs text-gray-600",
          )}
        >
          <Sparkles className="h-3 w-3 text-violet-500" aria-hidden />
          Matching listings
        </span>
        {matches.length > 0 && (
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-violet-200 text-violet-700">
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

      {isFetched && data && (
        <div
          className="mb-1.5 rounded border border-dashed border-amber-300 bg-amber-50/80 px-2 py-1.5 font-mono text-[9px] leading-relaxed text-amber-950"
          data-testid="inventory-match-debug"
        >
          <div>eligible: {String(data.eligible)}</div>
          <div>reason: {data.reason}</div>
          <div>inventoryCount: {data.inventoryCount ?? "—"}</div>
          <div>matchCount: {data.matchCount}</div>
          <div>sourceCount: {data.debug?.sourceCount ?? "—"}</div>
          {data.debug && (
            <>
              <div>activeListingCount: {data.debug.activeListingCount}</div>
              <div>totalListingCount: {data.debug.totalListingCount}</div>
              <div>workspaceAligned: {String(data.debug.workspaceAligned)}</div>
              <div className="truncate" title={data.debug.sessionUserId}>
                sessionUserId: {data.debug.sessionUserId}
              </div>
              <div className="truncate" title={data.debug.contactUserId}>
                contactUserId: {data.debug.contactUserId}
              </div>
            </>
          )}
        </div>
      )}

      {showEmpty && (
        <p className="text-[11px] text-gray-500 leading-snug py-1">
          {data?.reason === "no_buyer_preferences"
            ? "Add buyer preferences to preview MLS matches."
            : data?.reason === "no_active_inventory"
              ? data.debug?.sourceCount === 0
                ? "No inventory source for this workspace — run seed with the session user id below."
                : data.debug && data.debug.totalListingCount > 0 && data.debug.activeListingCount === 0
                  ? "Listings exist but none are active — check listing status."
                  : "Connect and sync MLS inventory to preview matches."
              : "No strong matches in active inventory yet."}
        </p>
      )}

      {matches.length > 0 && (
        <div className="space-y-2 mt-1">
          {matches.map((match) => {
            const loc = [match.listing.city, match.listing.state].filter(Boolean).join(", ");
            const bedsBaths = [
              match.listing.beds != null ? `${match.listing.beds} bd` : null,
              match.listing.baths != null ? `${match.listing.baths} ba` : null,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <div
                key={match.listingId}
                className="flex gap-2 rounded-md border border-gray-200 bg-white p-1.5 shadow-sm"
                data-testid={`inventory-match-${match.listingId}`}
              >
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded bg-gray-100 flex items-center justify-center">
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
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-gray-900 truncate">
                        {formatPrice(match.listing.priceCents)}
                        {loc ? ` · ${loc}` : ""}
                      </p>
                      {bedsBaths && (
                        <p className="text-[10px] text-gray-500 truncate">{bedsBaths}</p>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={cn("shrink-0 text-[9px] px-1 py-0 h-4 font-semibold", scoreBadgeClass(match.score))}
                    >
                      {match.score}
                    </Badge>
                  </div>
                  {match.reasons.length > 0 && (
                    <p className="text-[10px] text-gray-600 leading-snug mt-0.5 line-clamp-2">
                      {match.reasons.slice(0, 4).join(" · ")}
                    </p>
                  )}
                  <p className="text-[9px] text-gray-400 mt-0.5 capitalize">{match.listing.status.replace(/_/g, " ")}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
