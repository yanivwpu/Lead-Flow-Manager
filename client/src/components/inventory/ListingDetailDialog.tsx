import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink, Home, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { fetchInventoryMatchDraft } from "@/lib/inventoryDraftApi";
import {
  buildListingComposerMessage,
  listingComposerDraftIncludesRequiredDetails,
} from "@shared/inventory/inventoryComposerDraft";
import type { InventoryMatchListingSummary } from "@shared/inventory/inventoryMatchTypes";

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

export type ListingDetailDialogProps = {
  contactId: string;
  listingId: string | null;
  fallback: InventoryMatchListingSummary | null;
  matchReasons?: string[];
  opportunityType?: "new_listing" | "price_reduced";
  priceReductionLabel?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsertComposerDraft?: (text: string) => boolean;
  contactFirstName?: string;
};

export function ListingDetailDialog({
  contactId,
  listingId,
  fallback,
  matchReasons = [],
  opportunityType,
  priceReductionLabel,
  open,
  onOpenChange,
  onInsertComposerDraft,
  contactFirstName,
}: ListingDetailDialogProps) {
  const { toast } = useToast();
  const [draftKey, setDraftKey] = useState("");

  const { data: listingData, isLoading: listingLoading } = useQuery({
    queryKey: ["/api/inventory/listings", listingId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/inventory/listings/${listingId}`);
      return res.json() as Promise<ListingDetail>;
    },
    enabled: open && !!listingId,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (open && listingId) {
      setDraftKey(`${contactId}:${listingId}:${matchReasons.join("|")}:${opportunityType ?? ""}`);
    }
  }, [open, listingId, contactId, matchReasons, opportunityType]);

  const {
    data: draftData,
    isLoading: draftLoading,
    isError: draftError,
    refetch: refetchDraft,
  } = useQuery({
    queryKey: ["/api/inventory/draft", draftKey],
    queryFn: () =>
      fetchInventoryMatchDraft({
        contactId,
        listingId: listingId!,
        reasons: matchReasons,
        opportunityType,
        priceReductionLabel,
      }),
    enabled: open && !!listingId && !!contactId && !!draftKey,
    staleTime: 120_000,
    retry: 1,
  });

  const listing = listingData?.listing;
  const photo = listing?.photos?.[0]?.url ?? fallback?.thumbnailUrl ?? null;
  const city = listing?.city ?? fallback?.city;
  const state = listing?.state ?? fallback?.state;
  const priceCents = listing?.priceCents ?? fallback?.priceCents ?? null;
  const beds = listing?.beds != null ? Number(listing.beds) : fallback?.beds;
  const baths = listing?.baths != null ? Number(listing.baths) : fallback?.baths;
  const listingUrl = listing?.listingUrl ?? fallback?.listingUrl ?? null;
  const propertyType = listing?.propertyType ?? fallback?.propertyType ?? null;
  const description = listing?.description ?? null;

  const resolveComposerText = useCallback((): string | null => {
    if (!listingId) return null;
    const listingInput = {
      listingId,
      priceCents,
      beds: beds ?? null,
      baths: baths ?? null,
      city: city ?? null,
      state: state ?? null,
      propertyType,
      listingUrl,
      description,
    };
    const fromApi = draftData?.composerDraft?.trim();
    if (fromApi) return fromApi;
    const intro = draftData?.draft?.trim();
    if (!intro && priceCents == null && beds == null && baths == null && !city) return null;
    return buildListingComposerMessage({
      listing: listingInput,
      contactFirstName,
      introDraft: intro,
      featureHints: draftData?.matchBullets ?? matchReasons,
    });
  }, [
    listingId,
    priceCents,
    beds,
    baths,
    city,
    state,
    propertyType,
    listingUrl,
    description,
    draftData?.composerDraft,
    draftData?.draft,
    draftData?.matchBullets,
    contactFirstName,
    matchReasons,
  ]);

  const handleCopyDraft = useCallback(async () => {
    const text = resolveComposerText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Draft copied", duration: 2000 });
    } catch {
      toast({ title: "Copy failed", variant: "destructive", duration: 2500 });
    }
  }, [resolveComposerText, toast]);

  const handleInsertDraft = useCallback(() => {
    const text = resolveComposerText();
    if (!text || !listingId) return;

    const hasUrl = !!(listingUrl && /^https?:\/\//i.test(listingUrl));
    const includesRequired = listingComposerDraftIncludesRequiredDetails(text, {
      priceCents,
      beds: beds ?? null,
      baths: baths ?? null,
      city: city ?? null,
      listingUrl,
    });
    console.info(
      "[ListingComposerDraft]",
      JSON.stringify({
        contactId,
        listingId,
        hasPrice: priceCents != null,
        beds,
        baths,
        location: [city, state].filter(Boolean).join(", "),
        hasUrl,
        includesRequiredDetails: includesRequired,
        messageLength: text.length,
      }),
    );

    const inserted = onInsertComposerDraft?.(text) ?? false;
    if (inserted) {
      toast({ title: "Draft inserted into composer", duration: 2000 });
      onOpenChange(false);
    } else {
      toast({
        title: "Could not insert draft",
        description: "Open the inbox composer for this contact and try again.",
        variant: "destructive",
        duration: 3000,
      });
    }
  }, [resolveComposerText, listingId, contactId, priceCents, beds, baths, city, state, listingUrl, onInsertComposerDraft, onOpenChange, toast]);

  const matchBullets = draftData?.matchBullets ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden gap-0">
        <ScrollArea className="max-h-[min(85vh,640px)]">
          <div className="h-36 bg-gray-100">
            {photo ? (
              <img src={photo} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Home className="h-8 w-8 text-gray-300" />
              </div>
            )}
          </div>
          <div className="p-4 space-y-3">
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
            {listingLoading && !listing && (
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading details…
              </p>
            )}
            {listing?.description && (
              <p className="text-xs text-gray-600 line-clamp-4 leading-relaxed">{listing.description}</p>
            )}
            {listingUrl && (
              <Button asChild size="sm" variant="outline" className="w-full">
                <a href={listingUrl} target="_blank" rel="noreferrer">
                  Open listing URL
                  <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </a>
              </Button>
            )}

            {contactId && listingId && (
              <div
                className="rounded-lg border border-violet-100 bg-violet-50/50 p-3 space-y-3"
                data-testid="listing-ai-recommendation"
              >
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-violet-500 shrink-0" aria-hidden />
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                    AI Recommendation
                  </p>
                </div>

                {draftLoading && (
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Preparing outreach draft…
                  </div>
                )}

                {draftError && !draftLoading && (
                  <div className="space-y-2">
                    <p className="text-[11px] text-gray-500">Could not generate a draft right now.</p>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void refetchDraft()}>
                      Retry
                    </Button>
                  </div>
                )}

                {!draftLoading && !draftError && draftData && (
                  <>
                    {matchBullets.length > 0 && (
                      <div>
                        <p className="text-[10px] font-medium text-gray-600 mb-1">
                          Why this is a strong match
                        </p>
                        <ul className="space-y-0.5">
                          {matchBullets.map((bullet) => (
                            <li
                              key={bullet}
                              className="text-[11px] text-gray-700 leading-snug flex gap-1.5"
                            >
                              <span className="text-violet-400 shrink-0">•</span>
                              <span>{bullet}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div>
                      <p className="text-[10px] font-medium text-gray-600 mb-1">Suggested outreach</p>
                      <p className="text-[11px] text-gray-800 leading-relaxed whitespace-pre-wrap rounded-md bg-white/80 border border-violet-100/80 p-2.5">
                        {resolveComposerText() ?? draftData.draft}
                      </p>
                    </div>

                    <div className="flex flex-col gap-1.5 pt-0.5">
                      <Button
                        size="sm"
                        className="h-8 text-xs w-full"
                        onClick={handleInsertDraft}
                        data-testid="button-insert-listing-draft"
                      >
                        Insert into Composer
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs w-full"
                        onClick={() => void handleCopyDraft()}
                        data-testid="button-copy-listing-draft"
                      >
                        <Copy className="h-3 w-3 mr-1.5" />
                        Copy Draft
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
