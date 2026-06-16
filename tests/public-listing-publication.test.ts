/**
 * Public listing publication gates + display permissions.
 * Run: npx tsx tests/public-listing-publication.test.ts
 */
import {
  canResolvePublicShareListing,
  canShowPublicStreetAddress,
  getPublicListingPublishRejectionReason,
  hasPublicInternetDisplayPermission,
  isComplianceEligibleForPublicPublish,
  PUBLIC_LISTING_ATTRIBUTION_PUBLISH_ERROR,
} from "../shared/inventory/publicListingPublication";
import {
  applyPublicDisplayPermissions,
  buildPublicListingFlyerHtml,
  inventoryRowToFlyerListing,
} from "../shared/inventory/publicListingFlyer";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const COMPLIANT = {
  mlgCanView: true,
  internetEntireListingDisplay: true,
  internetDisplay: true,
  internetAddressDisplay: true,
  listOfficeName: "Premier Realty",
  listAgentName: "Pat Seller",
  mlsSourceName: "mfrmls",
  mlsListingId: "A1234567",
  provider: "mls_grid" as const,
  extractedAt: "2026-01-01T00:00:00.000Z",
};

const NO_ADDRESS_DISPLAY = {
  ...COMPLIANT,
  internetAddressDisplay: false,
};

function testPublicationGate() {
  assert(!canResolvePublicShareListing({
    workspacePublishListingsPublicly: false,
    listingPublishPublicly: true,
    status: "active",
    listingCompliance: COMPLIANT,
  }), "workspace off blocks share");

  assert(!canResolvePublicShareListing({
    workspacePublishListingsPublicly: true,
    listingPublishPublicly: false,
    status: "active",
    listingCompliance: COMPLIANT,
  }), "listing unpublished blocks share");

  assert(!canResolvePublicShareListing({
    workspacePublishListingsPublicly: true,
    listingPublishPublicly: true,
    status: "pending",
    listingCompliance: COMPLIANT,
  }), "non-matchable status blocks share");

  assert(!canResolvePublicShareListing({
    workspacePublishListingsPublicly: true,
    listingPublishPublicly: true,
    status: "active",
    listingCompliance: { ...COMPLIANT, internetDisplay: false },
  }), "no display permission blocks share");

  assert(!canResolvePublicShareListing({
    workspacePublishListingsPublicly: true,
    listingPublishPublicly: true,
    status: "active",
    listingCompliance: { ...COMPLIANT, mlsListingId: "" },
  }), "missing attribution blocks share");

  assert(canResolvePublicShareListing({
    workspacePublishListingsPublicly: true,
    listingPublishPublicly: true,
    status: "active",
    listingCompliance: COMPLIANT,
  }), "fully published + compliant resolves");

  console.log("  publication gate: OK");
}

function testDisplayPermissions() {
  assert(hasPublicInternetDisplayPermission(COMPLIANT), "display allowed");
  assert(!canShowPublicStreetAddress(NO_ADDRESS_DISPLAY), "street withheld");
  assert(canShowPublicStreetAddress(COMPLIANT), "street allowed");

  const masked = applyPublicDisplayPermissions(
    inventoryRowToFlyerListing({
      id: "l1",
      priceCents: 50000000,
      beds: 3,
      baths: 2,
      squareFeet: 1800,
      yearBuilt: 2010,
      hoaFeeCents: null,
      propertyType: "Residential",
      propertySubtype: null,
      description: "Bright home.",
      features: [],
      photos: [],
      addressLine1: "1 Main St",
      addressLine2: null,
      city: "Tampa",
      state: "FL",
      zip: "33602",
      latitude: 27.95,
      longitude: -82.45,
      status: "active",
      providerListingId: "A123",
      listingDetails: {},
      listingCompliance: NO_ADDRESS_DISPLAY,
    }),
  );
  assert(!masked.allowStreetAddress, "mask flag");
  assert(masked.listing.addressLine1 == null, "street cleared");
  assert(masked.listing.latitude == null, "lat cleared");

  const html = buildPublicListingFlyerHtml({
    listing: inventoryRowToFlyerListing({
      id: "l1",
      priceCents: 50000000,
      beds: 3,
      baths: 2,
      squareFeet: 1800,
      yearBuilt: 2010,
      hoaFeeCents: null,
      propertyType: "Residential",
      propertySubtype: null,
      description: "Bright home.",
      features: [],
      photos: [],
      addressLine1: "1 Main St",
      addressLine2: null,
      city: "Tampa",
      state: "FL",
      zip: "33602",
      latitude: 27.95,
      longitude: -82.45,
      status: "active",
      providerListingId: "A123",
      listingDetails: {},
      listingCompliance: NO_ADDRESS_DISPLAY,
    }),
    agent: { name: "Agent", email: null, phone: null, avatarUrl: null, brokerageName: null, bookingLink: null },
    shareUrl: "https://example.com/share/listings/l1",
    qrDataUrl: "",
  });
  assert(html.includes('content="noindex, nofollow"'), "noindex when address restricted");
  assert(!html.includes("1 Main St"), "street not in html");
  assert(!html.includes('class="map-embed map-embed-interactive"'), "map iframe hidden");

  console.log("  display permissions: OK");
}

function testPublishRejectionReason() {
  assert(
    getPublicListingPublishRejectionReason({
      status: "active",
      listingCompliance: { ...COMPLIANT, listOfficeName: "", listAgentName: "" },
    }) === PUBLIC_LISTING_ATTRIBUTION_PUBLISH_ERROR,
    "attribution error message",
  );
  console.log("  publish rejection reason: OK");
}

function testComplianceEligible() {
  assert(isComplianceEligibleForPublicPublish(COMPLIANT), "eligible when attribution + display");
  assert(!isComplianceEligibleForPublicPublish({ ...COMPLIANT, mlsListingId: "" }), "missing mls id");
  console.log("  compliance eligible: OK");
}

function main() {
  console.log("public-listing-publication tests");
  testPublicationGate();
  testPublishRejectionReason();
  testDisplayPermissions();
  testComplianceEligible();
  console.log("\nAll tests passed.");
}

main();
