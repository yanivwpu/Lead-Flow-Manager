/**
 * Direct share vs indexed public listing model.
 * Run: npx tsx tests/listing-direct-share.test.ts
 */
import {
  canDirectShareListing,
  canResolveIndexedPublicListing,
  getDirectShareRejectionReason,
  isCopilotAgentShareListing,
  isSearchIndexablePublicListing,
  PUBLIC_LISTING_ATTRIBUTION_PUBLISH_ERROR,
} from "../shared/inventory/publicListingPublication";
import {
  buildPublicListingFlyerHtml,
  inventoryRowToFlyerListing,
} from "../shared/inventory/publicListingFlyer";
import { buildListingCanonicalShareUrl, resolveListingShareSegment } from "../shared/inventory/listingViewUrl";
import { buildListingPublicSlug } from "../shared/inventory/listingPublicSlug";
import {
  buildListingComposerMessage,
  composerDraftHasShareListingUrl,
} from "../shared/inventory/inventoryComposerDraft";
import { getListingDirectShareMeta } from "../server/inventory/inventoryDb";

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

const FLYER_ROW = {
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
  listingCompliance: COMPLIANT,
};

function buildFlyerHtml(indexed: boolean): string {
  return buildPublicListingFlyerHtml({
    listing: inventoryRowToFlyerListing(FLYER_ROW),
    agent: {
      name: "Agent",
      email: null,
      phone: null,
      avatarUrl: null,
      brokerageName: null,
      bookingLink: null,
    },
    shareUrl: "https://example.com/share/listings/l1",
    qrDataUrl: "",
    allowSearchIndexing: indexed,
  });
}

function testUnpublishedCompliantDirectShare() {
  assert(
    canDirectShareListing({ status: "active", listingCompliance: COMPLIANT }),
    "compliant active listing can direct-share",
  );
  assert(
    !canResolveIndexedPublicListing({
      workspacePublishListingsPublicly: true,
      listingPublishPublicly: false,
      status: "active",
      listingCompliance: COMPLIANT,
    }),
    "unpublished listing is not indexed public",
  );
  console.log("  unpublished compliant direct-share: OK");
}

function testDirectShareNoindex() {
  const html = buildFlyerHtml(false);
  assert(html.includes('content="noindex, nofollow"'), "direct share flyer is noindex");
  console.log("  direct share noindex: OK");
}

function testPublishedIndexable() {
  const html = buildFlyerHtml(true);
  assert(html.includes('content="index, follow"'), "published indexed flyer is indexable");
  assert(
    isSearchIndexablePublicListing({
      workspacePublishListingsPublicly: true,
      listingPublishPublicly: true,
      status: "active",
      listingCompliance: COMPLIANT,
    }),
    "published compliant listing is search indexable",
  );
  console.log("  published indexable: OK");
}

function testNotOnAgentPageOrSitemap() {
  assert(
    !canResolveIndexedPublicListing({
      workspacePublishListingsPublicly: true,
      listingPublishPublicly: false,
      status: "active",
      listingCompliance: COMPLIANT,
    }),
    "unpublished listing excluded from agent page / sitemap gate",
  );
  assert(
    !canResolveIndexedPublicListing({
      workspacePublishListingsPublicly: false,
      listingPublishPublicly: true,
      status: "active",
      listingCompliance: COMPLIANT,
    }),
    "workspace publish off excludes from agent page / sitemap gate",
  );
  console.log("  agent page / sitemap exclusion: OK");
}

function testNonCompliantRejectionReasons() {
  assert(
    getDirectShareRejectionReason({
      status: "pending",
      listingCompliance: COMPLIANT,
    }) === "Listing cannot be published in its current status",
    "inactive status reason",
  );
  assert(
    getDirectShareRejectionReason({
      status: "active",
      listingCompliance: { ...COMPLIANT, internetDisplay: false },
    }) === "Listing is not compliance-eligible for public publishing",
    "display permission reason",
  );
  assert(
    getDirectShareRejectionReason({
      status: "active",
      listingCompliance: { ...COMPLIANT, mlsListingId: "" },
    }) === PUBLIC_LISTING_ATTRIBUTION_PUBLISH_ERROR,
    "attribution reason",
  );
  assert(!canDirectShareListing({ status: "active", listingCompliance: { ...COMPLIANT, mlsListingId: "" } }), "non-compliant blocked");
  console.log("  non-compliant rejection reasons: OK");
}

function testListingDirectShareMeta() {
  const meta = getListingDirectShareMeta({
    id: "l1",
    userId: "u1",
    sourceId: "s1",
    providerListingId: "A123",
    status: "active",
    publishPublicly: false,
    publishedAt: null,
    publicSlug: null,
    listingCompliance: COMPLIANT,
  } as Parameters<typeof getListingDirectShareMeta>[0]);
  assert(meta.allowed === true, "meta allows compliant listing");
  assert(meta.blockedReason == null, "no blocked reason when allowed");
  console.log("  listing direct share meta: OK");
}

function testDirectShareSlugUrlResolves() {
  const listingId = "2e059e00-0846-4f23-a606-cf0812b57bff";
  const slug = "1-main-st-tampa-fl-33602-2e059e00";
  const origin = "https://app.example.com";
  const shareUrl = buildListingCanonicalShareUrl({ listingId, publicSlug: slug }, origin);

  assert(resolveListingShareSegment({ listingId, publicSlug: slug }) === slug, "slug segment preferred");
  assert(resolveListingShareSegment({ listingId, publicSlug: null }) === listingId, "uuid fallback segment");
  const generatedSlug = buildListingPublicSlug({
    id: listingId,
    addressLine1: "1 Main St",
    city: "Tampa",
    state: "FL",
    zip: "33602",
  });
  assert(generatedSlug === slug, "slug builder matches expected pattern");

  assert(
    canDirectShareListing({ status: "active", listingCompliance: COMPLIANT }),
    "unpublished compliant listing passes direct-share MLS gate",
  );
  assert(
    !isSearchIndexablePublicListing({
      workspacePublishListingsPublicly: true,
      listingPublishPublicly: false,
      status: "active",
      listingCompliance: COMPLIANT,
    }),
    "unpublished listing is not search-indexable",
  );

  const html = buildPublicListingFlyerHtml({
    listing: inventoryRowToFlyerListing({
      ...FLYER_ROW,
      id: listingId,
      publicSlug: slug,
      publishPublicly: false,
    }),
    agent: {
      name: "Agent",
      email: null,
      phone: null,
      avatarUrl: null,
      brokerageName: null,
      bookingLink: null,
    },
    shareUrl,
    qrDataUrl: "",
    allowSearchIndexing: false,
  });

  assert(shareUrl === `${origin}/share/listings/${slug}`, "share-link returns slug URL");
  assert(!shareUrl.includes(listingId), "share URL avoids UUID when slug assigned");
  assert(html.includes('content="noindex, nofollow"'), "direct-share public page is noindex");
  assert(html.includes("Bright home."), "flyer content is visible");
  assert(html.includes("Listed By: Premier Realty"), "MLS attribution visible on flyer");
  assert(html.includes("MLS#: A1234567 · Data Source: mfrmls"), "MLS attribution compact footer");
  console.log("  direct share slug URL resolves with flyer: OK");
}

function testCopilotAgentShareAlias() {
  assert(
    isCopilotAgentShareListing({ status: "active", listingCompliance: COMPLIANT }),
    "copilot alias matches direct-share gate",
  );
  assert(
    !isCopilotAgentShareListing({
      status: "pending",
      listingCompliance: COMPLIANT,
    }),
    "inactive listings excluded from copilot pool",
  );
  console.log("  copilot agent-share alias: OK");
}

function testCopilotComposerRequiresVerifiedShareUrl() {
  const listingId = "2e059e00-0846-4f23-a606-cf0812b57bff";
  const origin = "https://app.example.com";
  const shareUrl = buildListingCanonicalShareUrl({ listingId, publicSlug: "slug-1" }, origin);
  const draft = buildListingComposerMessage({
    listing: {
      listingId,
      priceCents: 500_000_00,
      beds: 3,
      baths: 2,
      city: "Pompano Beach",
      state: "FL",
      propertyType: "house",
      listingUrl: null,
    },
    contactFirstName: "Susu",
    viewUrl: shareUrl,
  });
  assert(draft.text.includes("View Property Flyer:"), "Copilot draft has flyer line");
  assert(draft.text.includes(shareUrl), "Copilot draft has verified shareUrl");
  assert(!draft.text.includes(listingId), "composer draft avoids UUID when slug URL issued");
  assert(composerDraftHasShareListingUrl(draft.text), "share URL is canonical server URL");
  console.log("  copilot composer verified shareUrl: OK");
}

function main() {
  console.log("listing-direct-share tests");
  testUnpublishedCompliantDirectShare();
  testDirectShareNoindex();
  testPublishedIndexable();
  testNotOnAgentPageOrSitemap();
  testNonCompliantRejectionReasons();
  testListingDirectShareMeta();
  testDirectShareSlugUrlResolves();
  testCopilotAgentShareAlias();
  testCopilotComposerRequiresVerifiedShareUrl();
  console.log("\nAll tests passed.");
}

main();
