import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Home, Link2, Loader2, Sparkles } from "lucide-react";
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
import type { CopilotComposerInsert } from "@/lib/copilotComposerInsert";
import {
  buildListingComposerMessage,
  listingComposerDraftIncludesRequiredDetails,
} from "@shared/inventory/inventoryComposerDraft";
import {
  extractListingShareSegmentFromUrl,
  pickPrimaryPhotoUrl,
} from "@shared/inventory/listingViewUrl";
import {
  getShareListingButtonState,
  shouldShowPreviewFlyerButton,
} from "@shared/inventory/listingDetailDialogActions";
import { formatListingPriceDisplay } from "@shared/inventory/listingTransactionIntent";
import type { InventoryMatchListingSummary } from "@shared/inventory/inventoryMatchTypes";

/** Replace stale UUID share links in API draft text when a slug is available. */
function rewriteComposerDraftListingShareUrl(
  text: string,
  listingId: string,
  publicSlug: string | null | undefined,
  slugViewUrl: string,
): string {
  if (!publicSlug?.trim()) return text;
  const uuidSharePattern = new RegExp(
    `https?://[^\\s]*/share/listings/${listingId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[/?#\\s]|$)`,
    "gi",
  );
  return text.replace(uuidSharePattern, slugViewUrl);
}

function toPriceListingSummary(
  listing?: InventoryMatchListingSummary | ListingDetail["listing"] | null,
): InventoryMatchListingSummary | null {
  if (!listing) return null;
  const beds =
    typeof listing.beds === "string" ? parseFloat(listing.beds) || null : listing.beds ?? null;
  const baths =
    typeof listing.baths === "string" ? parseFloat(listing.baths) || null : listing.baths ?? null;
  return {
    id: listing.id ?? "",
    providerListingId: "providerListingId" in listing ? listing.providerListingId : listing.id,
    status: listing.status ?? "active",
    city: listing.city ?? null,
    state: "state" in listing ? listing.state ?? null : null,
    addressLine1: listing.addressLine1 ?? null,
    priceCents: listing.priceCents ?? null,
    beds,
    baths,
    propertyType: listing.propertyType ?? null,
    listingUrl: listing.listingUrl ?? null,
    thumbnailUrl: "thumbnailUrl" in listing ? listing.thumbnailUrl ?? null : null,
  };
}

function formatPrice(cents: number | null, listing?: InventoryMatchListingSummary | ListingDetail["listing"] | null): string {
  const summary = toPriceListingSummary(listing);
  return formatListingPriceDisplay(
    cents,
    summary
      ? {
          propertyType: summary.propertyType,
          description: null,
          features: [],
          priceCents: summary.priceCents,
        }
      : null,
  );
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
    publicSlug?: string | null;
    photos: { url: string; order?: number }[];
    status: string;
  };
  directShare?: {
    allowed: boolean;
    blockedReason: string | null;
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
  onInsertComposerDraft?: (draft: CopilotComposerInsert) => boolean;
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
  const directShare = listingData?.directShare;
  const photo = listing?.photos?.[0]?.url ?? fallback?.thumbnailUrl ?? null;
  const city = listing?.city ?? fallback?.city;
  const state = listing?.state ?? fallback?.state;
  const priceCents = listing?.priceCents ?? fallback?.priceCents ?? null;
  const beds = listing?.beds != null ? Number(listing.beds) : fallback?.beds;
  const baths = listing?.baths != null ? Number(listing.baths) : fallback?.baths;
  const listingUrl = listing?.listingUrl ?? fallback?.listingUrl ?? null;
  const propertyType = listing?.propertyType ?? fallback?.propertyType ?? null;
  const description = listing?.description ?? null;

  const listingPhotos = listing?.photos ?? null;
  const primaryPhotoUrl =
    draftData?.primaryPhotoUrl ??
    pickPrimaryPhotoUrl(listingPhotos ?? undefined, fallback?.thumbnailUrl ?? null);

  const resolveComposerDraft = useCallback((): {
    text: string;
    viewUrl: string | null;
    primaryPhotoUrl: string | null;
  } | null => {
    if (!listingId) return null;
    const serverViewUrl = draftData?.viewUrl?.trim() || null;
    const shareSlug =
      listing?.publicSlug?.trim() ||
      (serverViewUrl ? extractListingShareSegmentFromUrl(serverViewUrl) : null);
    const listingInput = {
      listingId,
      publicSlug: shareSlug,
      priceCents,
      beds: beds ?? null,
      baths: baths ?? null,
      city: city ?? null,
      state: state ?? null,
      propertyType,
      listingUrl,
      description,
      photos: listingPhotos ?? undefined,
      thumbnailUrl: fallback?.thumbnailUrl ?? null,
    };
    const fromApi = draftData?.composerDraft?.trim();
    if (fromApi) {
      const text =
        serverViewUrl && shareSlug
          ? rewriteComposerDraftListingShareUrl(fromApi, listingId, shareSlug, serverViewUrl)
          : fromApi;
      return {
        text,
        viewUrl: serverViewUrl,
        primaryPhotoUrl,
      };
    }
    const intro = draftData?.draft?.trim();
    const built = buildListingComposerMessage({
      listing: listingInput,
      contactFirstName,
      introDraft: intro,
      featureHints: draftData?.matchBullets ?? matchReasons,
      viewUrl: serverViewUrl,
    });
    return {
      text: built.text,
      viewUrl: built.viewUrl,
      primaryPhotoUrl: built.primaryPhotoUrl ?? primaryPhotoUrl,
    };
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
    listingPhotos,
    fallback?.thumbnailUrl,
    listing?.publicSlug,
    draftData?.composerDraft,
    draftData?.viewUrl,
    draftData?.draft,
    draftData?.matchBullets,
    primaryPhotoUrl,
    contactFirstName,
    matchReasons,
  ]);

  const handleInsertDraft = useCallback(() => {
    const draft = resolveComposerDraft();
    if (!draft?.text || !listingId) return;

    const includesRequired = listingComposerDraftIncludesRequiredDetails(draft.text, {
      listingId,
      priceCents,
      beds: beds ?? null,
      baths: baths ?? null,
      city: city ?? null,
      listingUrl,
    }, { viewUrl: draft.viewUrl });
    console.info(
      "[ListingComposerDraft]",
      JSON.stringify({
        contactId,
        listingId,
        hasPrice: priceCents != null,
        beds,
        baths,
        location: [city, state].filter(Boolean).join(", "),
        viewUrl: draft.viewUrl,
        hasPhoto: !!draft.primaryPhotoUrl,
        includesRequiredDetails: includesRequired,
        messageLength: draft.text.length,
      }),
    );

    const inserted =
      onInsertComposerDraft?.({
        text: draft.text,
        primaryPhotoUrl: draft.primaryPhotoUrl,
        listingId,
        preserveAiMode: true,
      }) ?? false;
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
  }, [resolveComposerDraft, listingId, contactId, listing?.publicSlug, priceCents, beds, baths, city, state, listingUrl, onInsertComposerDraft, onOpenChange, toast]);

  const showPreviewFlyer = shouldShowPreviewFlyerButton(listingId);
  const shareButton = getShareListingButtonState({
    listingId,
    directShare,
    directShareLoaded: !listingLoading || !!listingData,
  });
  const previewFlyerUrl = listingId ? `/api/inventory/listings/${listingId}/flyer-preview` : null;

  const handlePreviewFlyer = useCallback(() => {
    if (!previewFlyerUrl) return;
    window.open(previewFlyerUrl, "_blank", "noopener,noreferrer");
  }, [previewFlyerUrl]);

  const handleShareListing = useCallback(async () => {
    if (!listingId) return;
    try {
      const res = await apiRequest("POST", `/api/inventory/listings/${listingId}/share-link`);
      const data = (await res.json()) as { shareUrl?: string; error?: string };
      if (!res.ok || !data.shareUrl) {
        throw new Error(data.error ?? "Share link unavailable");
      }
      await navigator.clipboard.writeText(data.shareUrl);
      toast({ title: "Share link copied", duration: 2000 });
    } catch (error) {
      toast({
        title: "Share link unavailable",
        description: "This listing cannot be shared publicly yet.",
        duration: 3000,
      });
    }
  }, [listingId, toast]);

  const composerPreview = resolveComposerDraft();
  const matchBullets = draftData?.matchBullets ?? matchReasons;
  const showDraftContent = !draftLoading && !!composerPreview?.text;
  const showDraftRetry = !draftLoading && draftError && !composerPreview?.text;
  const usingTemplateFallback = draftError && !!composerPreview?.text;

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
                {formatPrice(priceCents, listing ?? fallback)}
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

            {(showPreviewFlyer || shareButton.show) && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {showPreviewFlyer && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px] font-medium text-gray-600 hover:text-gray-900"
                    onClick={handlePreviewFlyer}
                    data-testid="button-preview-flyer"
                  >
                    <ExternalLink className="mr-1 h-3 w-3" aria-hidden />
                    Preview Flyer
                  </Button>
                )}
                {shareButton.show && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px] font-medium text-gray-600 hover:text-gray-900"
                    onClick={() => void handleShareListing()}
                    data-testid="button-share-listing"
                  >
                    <Link2 className="mr-1 h-3 w-3" aria-hidden />
                    Share Listing
                  </Button>
                )}
              </div>
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

                {showDraftRetry && (
                  <div className="space-y-2">
                    <p className="text-[11px] text-gray-500">Could not generate a draft right now.</p>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void refetchDraft()}>
                      Retry
                    </Button>
                  </div>
                )}

                {showDraftContent && (
                  <>
                    {usingTemplateFallback && (
                      <p className="text-[10px] text-gray-500">
                        Using a template draft — AI was unavailable.
                      </p>
                    )}
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
                      <p className="text-[10px] font-medium text-gray-600 mb-1">
                        Message that will be sent
                      </p>
                      <p className="text-[11px] text-gray-800 leading-relaxed whitespace-pre-wrap rounded-md bg-white/80 border border-violet-100/80 p-2.5">
                        {composerPreview.text}
                      </p>
                      {primaryPhotoUrl && (
                        <p className="text-[10px] text-gray-500 mt-1.5 leading-snug">
                          Photo: included as a separate attachment after this text on Messenger and
                          Facebook. WhatsApp sends the photo with this text as the caption.
                        </p>
                      )}
                    </div>

                    <Button
                      size="sm"
                      className="h-8 w-full text-xs"
                      onClick={handleInsertDraft}
                      data-testid="button-insert-listing-draft"
                    >
                      Insert into Composer
                    </Button>
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
