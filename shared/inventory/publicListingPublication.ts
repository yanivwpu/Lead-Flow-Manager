/**
 * Public listing publication — workspace + per-listing opt-in.
 */
import type { InventoryListingCompliance } from "./inventoryListingCompliance";
import {
  canRenderPublicListingAttribution,
  normalizeListingCompliance,
} from "./inventoryListingCompliance";

export type WorkspacePublicListingSettings = {
  publishListingsPublicly: boolean;
};

export type ListingPublicPublication = {
  publishPublicly: boolean;
  publishedAt: string | null;
};

export const DEFAULT_WORKSPACE_PUBLIC_LISTING_SETTINGS: WorkspacePublicListingSettings = {
  publishListingsPublicly: false,
};

export const DEFAULT_LISTING_PUBLIC_PUBLICATION: ListingPublicPublication = {
  publishPublicly: false,
  publishedAt: null,
};

/** True when RESO/MLS flags allow internet display. Unknown flags → not eligible. */
export function hasPublicInternetDisplayPermission(
  compliance: InventoryListingCompliance | null | undefined,
): boolean {
  const c = normalizeListingCompliance(compliance);
  if (c.mlgCanView === false) return false;
  if (c.internetEntireListingDisplay === false || c.internetDisplay === false) return false;
  if (c.internetEntireListingDisplay === true || c.internetDisplay === true) return true;
  if (c.provider === "mls_grid" && c.mlgCanView === true) return true;
  return false;
}

/** Street address may be shown only when explicitly allowed. */
export function canShowPublicStreetAddress(
  compliance: InventoryListingCompliance | null | undefined,
): boolean {
  const c = normalizeListingCompliance(compliance);
  if (!hasPublicInternetDisplayPermission(c)) return false;
  return c.internetAddressDisplay === true;
}

/** Full compliance gate before a listing may be published publicly. */
export function isComplianceEligibleForPublicPublish(
  compliance: InventoryListingCompliance | null | undefined,
): boolean {
  const c = normalizeListingCompliance(compliance);
  return hasPublicInternetDisplayPermission(c) && canRenderPublicListingAttribution(c);
}

export function isListingMissingAttribution(
  compliance: InventoryListingCompliance | null | undefined,
): boolean {
  return !canRenderPublicListingAttribution(normalizeListingCompliance(compliance));
}

export function isListingMissingDisplayPermission(
  compliance: InventoryListingCompliance | null | undefined,
): boolean {
  return !hasPublicInternetDisplayPermission(normalizeListingCompliance(compliance));
}

export const PUBLIC_LISTING_ATTRIBUTION_PUBLISH_ERROR =
  "Listing cannot be published until MLS attribution data is available. Re-sync inventory or check MLS feed permissions.";

/** MLS internet display + attribution + matchable status — shared runtime gate. */
export function passesPublicListingMlsGate(input: {
  status: string;
  listingCompliance: InventoryListingCompliance | null | undefined;
}): boolean {
  if (input.status !== "active" && input.status !== "coming_soon") return false;
  return isComplianceEligibleForPublicPublish(input.listingCompliance);
}

/** Human-readable rejection when MLS gate blocks share or publish. */
export function getPublicListingPublishRejectionReason(input: {
  status: string;
  listingCompliance: InventoryListingCompliance | null | undefined;
}): string | null {
  if (input.status !== "active" && input.status !== "coming_soon") {
    return "Listing cannot be published in its current status";
  }
  if (isListingMissingDisplayPermission(input.listingCompliance)) {
    return "Listing is not compliance-eligible for public publishing";
  }
  if (isListingMissingAttribution(input.listingCompliance)) {
    return PUBLIC_LISTING_ATTRIBUTION_PUBLISH_ERROR;
  }
  return null;
}

/** Alias — direct agent share uses the same MLS gate as publish compliance. */
export const getDirectShareRejectionReason = getPublicListingPublishRejectionReason;

export type DirectShareGateInput = {
  status: string;
  listingCompliance: InventoryListingCompliance | null | undefined;
};

/** Agent may direct-share /share/listings/:slug when MLS compliance passes (no publish toggle). */
export function canDirectShareListing(input: DirectShareGateInput): boolean {
  return passesPublicListingMlsGate(input);
}

/** Copilot matching/cards only surface listings agents can preview and direct-share. */
export function isCopilotAgentShareListing(input: DirectShareGateInput): boolean {
  return canDirectShareListing(input);
}

export type PublicShareGateInput = DirectShareGateInput & {
  workspacePublishListingsPublicly: boolean;
  listingPublishPublicly: boolean;
};

/** Whether listing may appear on Agent Page, sitemap, and search indexing. */
export function canResolveIndexedPublicListing(input: PublicShareGateInput): boolean {
  if (!input.workspacePublishListingsPublicly || !input.listingPublishPublicly) return false;
  return passesPublicListingMlsGate({
    status: input.status,
    listingCompliance: input.listingCompliance,
  });
}

/** @deprecated Use canResolveIndexedPublicListing — kept for existing imports. */
export const canResolvePublicShareListing = canResolveIndexedPublicListing;

/** Search engines may index only explicitly published listings that pass the MLS gate. */
export function isSearchIndexablePublicListing(input: PublicShareGateInput): boolean {
  return canResolveIndexedPublicListing(input);
}
