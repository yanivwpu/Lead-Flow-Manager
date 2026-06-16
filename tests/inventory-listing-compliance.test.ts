/**
 * MLS listing compliance extraction + public attribution gating.
 * Run: npx tsx tests/inventory-listing-compliance.test.ts
 */
import {
  auditResoComplianceFieldAvailability,
  buildPublicListingAttributionLines,
  canRenderPublicListingAttribution,
  extractResoListingCompliance,
  PROVIDER_COMPLIANCE_FIELD_MATRIX,
} from "../shared/inventory/inventoryListingCompliance";
import {
  buildPublicListingFlyerHtml,
  inventoryRowToFlyerListing,
} from "../shared/inventory/publicListingFlyer";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const MLS_GRID_ROW = {
  ListingId: "A1234567",
  OriginatingSystemName: "mfrmls",
  MlgCanView: true,
  InternetEntireListingDisplayYN: true,
  InternetDisplayYN: true,
  InternetAddressDisplayYN: true,
  ListOfficeName: "Premier Realty Group",
  ListAgentFullName: "Pat Seller",
  StandardStatus: "Active",
  ListPrice: 500000,
  PublicRemarks: "Bright home.",
  UnparsedAddress: "1 Main St",
  City: "Tampa",
  StateOrProvince: "FL",
};

const BRIDGE_ROW = {
  ListingId: "BR-99",
  OriginatingSystemName: "abor",
  InternetEntireListingDisplayYN: true,
  InternetAddressDisplayYN: false,
  ListOfficeName: "ABOR Brokerage",
  ListAgentFirstName: "Alex",
  ListAgentLastName: "Agent",
  StandardStatus: "Active",
  ListPrice: 400000,
  BridgeModificationTimestamp: "2024-06-01T12:00:00Z",
};

const TRESTLE_ROW = {
  ListingId: "TR-55",
  OriginatingSystemName: "actris",
  InternetDisplayYN: true,
  ListOfficeName: "Metro Brokers",
  ListAgentFullName: "Sam List",
  StandardStatus: "Active",
  ListPrice: 350000,
  ModificationTimestamp: "2024-06-01T12:00:00Z",
};

const SPARSE_ROW = {
  ListingId: "X1",
  StandardStatus: "Active",
  ListPrice: 300000,
};

function testProviderMatrix() {
  assert(PROVIDER_COMPLIANCE_FIELD_MATRIX.mls_grid.fields.includes("MlgCanView"), "mls grid matrix");
  assert(!PROVIDER_COMPLIANCE_FIELD_MATRIX.bridge_interactive.fields.includes("MlgCanView"), "bridge no mlg");
  console.log("  provider matrix: OK");
}

function testExtraction() {
  const mls = extractResoListingCompliance(MLS_GRID_ROW, {
    provider: "mls_grid",
    providerListingId: "A1234567",
    sourceMlsName: "mfrmls",
  });
  assert(mls.mlgCanView === true, "mls mlgCanView");
  assert(mls.internetEntireListingDisplay === true, "mls internet entire");
  assert(mls.listOfficeName === "Premier Realty Group", "mls office");
  assert(mls.mlsSourceName === "mfrmls", "mls source");

  const bridge = extractResoListingCompliance(BRIDGE_ROW, {
    provider: "bridge_interactive",
    providerListingId: "BR-99",
    sourceMlsName: "abor_dataset",
  });
  assert(bridge.listAgentName === "Alex Agent", "bridge agent composed");
  assert(bridge.internetAddressDisplay === false, "bridge address flag");

  const trestle = extractResoListingCompliance(TRESTLE_ROW, {
    provider: "trestle",
    providerListingId: "TR-55",
    sourceMlsName: "actris",
  });
  assert(trestle.internetDisplay === true, "trestle internet display");
  assert(trestle.mlgCanView == null, "trestle no mlg");

  const sparse = extractResoListingCompliance(SPARSE_ROW, {
    provider: "bridge_interactive",
    providerListingId: "X1",
  });
  assert(sparse.listOfficeName == null, "sparse no office");
  assert(!canRenderPublicListingAttribution(sparse), "sparse blocks attribution");
  console.log("  extraction: OK");
}

function testFieldAvailabilityAudit() {
  const avail = auditResoComplianceFieldAvailability(MLS_GRID_ROW);
  assert(avail.MlgCanView === true, "audit mlg");
  assert(avail.ListOfficeName === true, "audit office");
  assert(avail.ListAgentFullName === true, "audit agent");

  const sparseAvail = auditResoComplianceFieldAvailability(SPARSE_ROW);
  assert(sparseAvail.ListOfficeName === false, "sparse audit office");
  assert(sparseAvail.InternetEntireListingDisplayYN === false, "sparse audit display");
  console.log("  field availability audit: OK");
}

function testAttributionLines() {
  const lines = buildPublicListingAttributionLines({
    compliance: extractResoListingCompliance(MLS_GRID_ROW, {
      provider: "mls_grid",
      providerListingId: "A1234567",
    }),
    presentingBrokerageName: "Summit Realty",
  });
  assert(lines.some((l) => /Listing courtesy of Premier Realty Group/.test(l)), "courtesy line");
  assert(lines.some((l) => /MLS# A1234567/.test(l)), "mls id");
  assert(lines.some((l) => /Data courtesy of mfrmls/.test(l)), "mls source");
  assert(lines.some((l) => /Presented by Summit Realty/.test(l)), "presenting brokerage");
  console.log("  attribution lines: OK");
}

function testFlyerGating() {
  const baseRow = {
    id: "11111111-1111-1111-1111-111111111111",
    priceCents: 45000000,
    beds: "3",
    baths: "2",
    squareFeet: 1800,
    yearBuilt: 1998,
    hoaFeeCents: null,
    propertyType: "house",
    propertySubtype: null,
    description: "Nice place.",
    features: [],
    photos: [{ url: "https://cdn.example.com/a.jpg", order: 0 }],
    addressLine1: "1 Main St",
    addressLine2: null,
    city: "Tampa",
    state: "FL",
    zip: "33601",
    latitude: null,
    longitude: null,
    status: "active",
    providerListingId: "A1234567",
    listingDetails: {},
  };

  const without = buildPublicListingFlyerHtml({
    listing: inventoryRowToFlyerListing({ ...baseRow, listingCompliance: {} }),
    agent: { name: "Jane", email: null, phone: null, avatarUrl: null, brokerageName: null, bookingLink: null },
    shareUrl: "https://app.example.com/share/listings/x",
    qrDataUrl: "data:image/png;base64,TEST",
  });
  assert(!without.includes('data-testid="listing-compliance-attribution"'), "no attribution when data missing");

  const withData = buildPublicListingFlyerHtml({
    listing: inventoryRowToFlyerListing({
      ...baseRow,
      listingCompliance: extractResoListingCompliance(MLS_GRID_ROW, {
        provider: "mls_grid",
        providerListingId: "A1234567",
      }),
    }),
    agent: {
      name: "Jane",
      email: null,
      phone: null,
      avatarUrl: null,
      brokerageName: "Summit Realty",
      bookingLink: null,
    },
    shareUrl: "https://app.example.com/share/listings/x",
    qrDataUrl: "data:image/png;base64,TEST",
  });
  assert(withData.includes('data-testid="listing-compliance-attribution"'), "attribution rendered when complete");
  assert(withData.includes("MLS# A1234567"), "mls id on flyer");
  console.log("  flyer gating: OK");
}

testProviderMatrix();
testExtraction();
testFieldAvailabilityAudit();
testAttributionLines();
testFlyerGating();
console.log("inventory-listing-compliance.test.ts: OK");
