import type { AgentPageListingCard } from "@shared/agent/agentPageTypes";
import {
  buildAgentPageListingFullAddress,
  buildAgentPageListingMetaSummary,
} from "@shared/agent/agentPageListingDisplay";
import { buildListingCanonicalShareUrl, pickPrimaryPhotoUrl } from "@shared/inventory/listingViewUrl";
import { formatListingPriceForComposer } from "@shared/inventory/inventoryComposerDraft";
import { normalizeListingCompliance } from "@shared/inventory/inventoryListingCompliance";
import { canShowPublicStreetAddress } from "@shared/inventory/publicListingPublication";
import {
  resolveFlyerListingLabel,
  resolveFlyerSpecFields,
  type PublicListingFlyerListing,
} from "@shared/inventory/publicListingFlyer";
import type { fetchPublishedListingsForAgentPage } from "./agentPageDb";

export function inventoryListingToAgentPageCard(
  listing: Awaited<ReturnType<typeof fetchPublishedListingsForAgentPage>>[number],
  appOrigin: string,
): AgentPageListingCard {
  const flyerListing: PublicListingFlyerListing = {
    id: listing.id,
    priceCents: listing.priceCents,
    beds: listing.beds != null ? Number(listing.beds) : null,
    baths: listing.baths != null ? Number(listing.baths) : null,
    squareFeet: listing.squareFeet,
    yearBuilt: listing.yearBuilt,
    hoaFeeCents: listing.hoaFeeCents,
    propertyType: listing.propertyType,
    propertySubtype: listing.propertySubtype,
    description: listing.description,
    features: Array.isArray(listing.features) ? listing.features.map(String) : [],
    photos: Array.isArray(listing.photos) ? (listing.photos as { url: string }[]) : [],
    addressLine1: listing.addressLine1,
    addressLine2: listing.addressLine2,
    city: listing.city,
    state: listing.state,
    zip: listing.zip,
    latitude: listing.latitude,
    longitude: listing.longitude,
    status: listing.status,
    providerListingId: listing.providerListingId,
    listingDetails: (listing.listingDetails || {}) as PublicListingFlyerListing["listingDetails"],
    listingCompliance: normalizeListingCompliance(listing.listingCompliance),
  };

  const allowStreet = canShowPublicStreetAddress(normalizeListingCompliance(listing.listingCompliance));
  const street = allowStreet
    ? [listing.addressLine1, listing.addressLine2].filter(Boolean).join(", ") || null
    : null;
  const cityState = [listing.city, listing.state].filter(Boolean).join(", ");
  const { sqft } = resolveFlyerSpecFields(flyerListing);
  const bedsNum = listing.beds != null ? Number(listing.beds) : null;
  const bathsNum = listing.baths != null ? Number(listing.baths) : null;
  const beds =
    bedsNum != null && Number.isFinite(bedsNum)
      ? `${bedsNum % 1 === 0 ? Math.round(bedsNum) : bedsNum} bed`
      : null;
  const baths =
    bathsNum != null && Number.isFinite(bathsNum)
      ? `${bathsNum % 1 === 0 ? Math.round(bathsNum) : bathsNum} bath`
      : null;
  const sqftNum = listing.squareFeet ?? null;
  const price = formatListingPriceForComposer(listing.priceCents) || "Price on request";
  const fullAddress = buildAgentPageListingFullAddress({
    street,
    city: listing.city,
    state: listing.state,
    zip: listing.zip,
  });
  const metaSummary = buildAgentPageListingMetaSummary({ price, beds, baths, sqft });

  return {
    id: listing.id,
    shareUrl: buildListingCanonicalShareUrl(
      { listingId: listing.id, publicSlug: listing.publicSlug },
      appOrigin,
    ),
    imageUrl: pickPrimaryPhotoUrl(flyerListing.photos),
    street,
    fullAddress,
    metaSummary,
    cityState,
    price,
    priceCents: listing.priceCents ?? null,
    beds,
    baths,
    sqft,
    bedsNum: Number.isFinite(bedsNum) ? bedsNum : null,
    bathsNum: Number.isFinite(bathsNum) ? bathsNum : null,
    sqftNum,
    propertyType: listing.propertyType ?? null,
    propertySubtype: listing.propertySubtype ?? null,
    status: listing.status === "coming_soon" ? "Coming Soon" : "Active",
    listingLabel: resolveFlyerListingLabel(flyerListing),
  };
}
