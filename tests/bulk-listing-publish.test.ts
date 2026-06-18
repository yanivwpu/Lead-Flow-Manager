/**
 * Bulk Agent Page publish gates — MLS eligibility vs indexed publish vs direct share.
 * Run: npx tsx tests/bulk-listing-publish.test.ts
 */
import { MATCHABLE_INVENTORY_STATUSES } from "../shared/inventory/inventoryListingSchema";
import {
  canDirectShareListing,
  canResolveIndexedPublicListing,
  getPublicListingPublishRejectionReason,
  passesPublicListingMlsGate,
} from "../shared/inventory/publicListingPublication";

function assert(cond: unknown, msg: string): void {
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

function testMatchableStatuses() {
  assert(MATCHABLE_INVENTORY_STATUSES.includes("active"), "active is matchable");
  assert(MATCHABLE_INVENTORY_STATUSES.includes("coming_soon"), "coming_soon is matchable");
  assert(!MATCHABLE_INVENTORY_STATUSES.includes("sold"), "sold excluded from bulk publish pool");
}

function testMlsGate() {
  assert(
    passesPublicListingMlsGate({ status: "active", listingCompliance: COMPLIANT }),
    "MLS eligible active listing",
  );
  assert(
    passesPublicListingMlsGate({ status: "coming_soon", listingCompliance: COMPLIANT }),
    "MLS eligible coming soon listing",
  );
  assert(
    !passesPublicListingMlsGate({ status: "sold", listingCompliance: COMPLIANT }),
    "sold listing excluded from MLS gate",
  );
  assert(
    getPublicListingPublishRejectionReason({ status: "sold", listingCompliance: COMPLIANT }) !== null,
    "sold gets rejection reason",
  );
}

function testDirectShareUnchanged() {
  assert(
    canDirectShareListing({ status: "active", listingCompliance: COMPLIANT }),
    "direct share allowed with MLS gate only",
  );
  assert(
    canDirectShareListing({ status: "active", listingCompliance: COMPLIANT }),
    "direct share does not require publishPublicly",
  );
}

function testIndexedPublishGate() {
  const base = {
    workspacePublishListingsPublicly: true,
    listingPublishPublicly: true,
    status: "active" as const,
    listingCompliance: COMPLIANT,
  };

  assert(canResolveIndexedPublicListing(base), "indexed gate passes when published");
  assert(
    !canResolveIndexedPublicListing({ ...base, listingPublishPublicly: false }),
    "unpublished listing blocked from agent page",
  );
  assert(
    !canResolveIndexedPublicListing({ ...base, workspacePublishListingsPublicly: false }),
    "workspace publish off blocks agent page even if listing published",
  );
  assert(
    !canResolveIndexedPublicListing({ ...base, status: "sold" }),
    "sold listing blocked from agent page",
  );
}

testMatchableStatuses();
testMlsGate();
testDirectShareUnchanged();
testIndexedPublishGate();

console.log("bulk-listing-publish.test.ts: all assertions passed");
