export type ListingDirectShareMeta = {
  allowed: boolean;
  blockedReason: string | null;
};

export function shouldShowPreviewFlyerButton(listingId: string | null | undefined): boolean {
  return !!listingId;
}

export type ShareListingButtonState = {
  show: boolean;
  enabled: boolean;
};

/** Share button only when direct-share gate passes — hidden entirely when blocked. */
export function getShareListingButtonState(input: {
  listingId: string | null | undefined;
  directShare: ListingDirectShareMeta | null | undefined;
  directShareLoaded: boolean;
}): ShareListingButtonState {
  if (!input.listingId || !input.directShareLoaded || input.directShare?.allowed !== true) {
    return { show: false, enabled: false };
  }
  return { show: true, enabled: true };
}
