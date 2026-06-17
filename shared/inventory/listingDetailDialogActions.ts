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
  blockedReason: string | null;
};

/** Share button appears once direct-share meta is known; disabled when MLS gate blocks. */
export function getShareListingButtonState(input: {
  listingId: string | null | undefined;
  directShare: ListingDirectShareMeta | null | undefined;
  directShareLoaded: boolean;
}): ShareListingButtonState {
  if (!input.listingId || !input.directShareLoaded) {
    return { show: false, enabled: false, blockedReason: null };
  }
  if (input.directShare?.allowed) {
    return { show: true, enabled: true, blockedReason: null };
  }
  return {
    show: true,
    enabled: false,
    blockedReason:
      input.directShare?.blockedReason?.trim() ||
      "Sharing is not available for this listing",
  };
}

/** Composer drafts may only include a public share URL when direct-share is allowed. */
export function resolveComposerShareOrigin(input: {
  appOrigin: string;
  directShareAllowed: boolean | undefined;
}): string | null {
  if (!input.directShareAllowed) return null;
  return input.appOrigin.trim() || null;
}
