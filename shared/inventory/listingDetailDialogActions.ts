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

/** Share is shown once meta loads; disabled quietly when direct-share gate blocks link creation. */
export function getShareListingButtonState(input: {
  listingId: string | null | undefined;
  directShare: ListingDirectShareMeta | null | undefined;
  directShareLoaded: boolean;
}): ShareListingButtonState {
  if (!input.listingId || !input.directShareLoaded) {
    return { show: false, enabled: false };
  }
  return {
    show: true,
    enabled: input.directShare?.allowed === true,
  };
}

/** Composer drafts only include a public share URL when direct-share link creation would succeed. */
export function resolveComposerShareOrigin(input: {
  appOrigin: string;
  directShareAllowed: boolean | undefined;
}): string | null {
  if (!input.directShareAllowed) return null;
  return input.appOrigin.trim() || null;
}
