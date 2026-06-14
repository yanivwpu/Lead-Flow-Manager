/**
 * RESO listing classification — property type, sale/rent, pool.
 * Run: npx tsx tests/inventory-reso-classification.test.ts
 */
import {
  buildResoPropertyClassificationContext,
  extractResoPoolFlag,
  mapResoPropertyType,
  renormalizeStoredListingFields,
  resolveResoListingTransactionType,
} from "../shared/inventory/reso/resoListingClassification";
import {
  extractResoListingDetails,
  normalizeResoPropertyRow,
  mapResoStandardStatus,
} from "../shared/inventory/reso/resoNormalizer";
import { listingIsRentalOrLease } from "../shared/inventory/listingTransactionIntent";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(mapResoPropertyType("Residential", "Single Family Residence") === "house", "SFR -> house");
assert(mapResoPropertyType("Residential", "Single Family") === "house", "Single Family -> house");
assert(mapResoPropertyType("Residential", "Detached") === "house", "Detached -> house");
assert(mapResoPropertyType("Residential", "Townhouse") === "townhouse", "Townhouse stays townhouse");
assert(mapResoPropertyType("Residential", "Townhome") === "townhouse", "Townhome stays townhouse");
assert(mapResoPropertyType("Residential", "Villa") === "villa", "Villa stays villa");
assert(mapResoPropertyType("Residential", "Condominium") === "condo", "Condo stays condo");
assert(
  mapResoPropertyType("Residential", "Single Family Residence") !== "townhouse",
  "SFR not townhouse",
);

const attachedLeaseCtx = buildResoPropertyClassificationContext({
  PropertyType: "Residential Lease",
  PropertySubType: "Townhouse",
  StructureType: "Attached",
  UnitNumber: "0",
  UnparsedAddress: "111 SE 7th Ave #0",
});
assert(
  mapResoPropertyType("Residential Lease", "Townhouse", attachedLeaseCtx) === "townhouse",
  "residential lease townhome -> townhouse",
);
assert(
  mapResoPropertyType("Residential Lease", "", attachedLeaseCtx) === "townhouse",
  "residential lease + unit #0 + attached -> townhouse",
);
assert(
  mapResoPropertyType("Residential", "", attachedLeaseCtx) === "townhouse",
  "generic residential + unit #0 + attached -> townhouse not house",
);
assert(
  mapResoPropertyType("Residential Lease", "Single Family Residence", attachedLeaseCtx) === "townhouse",
  "unit #0 blocks SFR subtype from house",
);

assert(
  resolveResoListingTransactionType({
    PropertyType: "Residential",
    PropertySubType: "Single Family Residence",
    ListPrice: 875000,
    TransactionType: "For Sale",
  }) === "sale",
  "explicit sale transaction",
);

assert(
  resolveResoListingTransactionType({
    PropertyType: "Residential Lease",
    PropertySubType: "Condominium",
    ListPrice: 2500,
  }) === "rent",
  "residential lease -> rent",
);

assert(
  resolveResoListingTransactionType({
    PropertyType: "Residential",
    PropertySubType: "Single Family Residence",
    ListPrice: 3500,
  }) === "rent",
  "low list price -> rent",
);

assert(
  extractResoPoolFlag({
    PoolPrivateYN: true,
  }) === true,
  "PoolPrivateYN true",
);

assert(
  extractResoPoolFlag({
    PrivatePoolYN: true,
  }) === true,
  "PrivatePoolYN true",
);

assert(
  extractResoPoolFlag({
    PoolFeatures: "Heated, In Ground",
    PublicRemarks: "Beautiful home",
  }) === true,
  "PoolFeatures -> pool",
);

assert(
  extractResoPoolFlag({
    ExteriorFeatures: "Outdoor Shower, Pool",
  }) === true,
  "ExteriorFeatures pool",
);

assert(
  extractResoPoolFlag({
    PublicRemarks: "Spacious SFH with private pool and canal access",
  }) === true,
  "remarks pool fallback",
);

const contract = {
  provider: "bridge_interactive" as const,
  extractListingId(row: Record<string, unknown>) {
    return String(row.ListingId ?? "");
  },
  resolveStatus(row: Record<string, unknown>) {
    return mapResoStandardStatus(row.StandardStatus);
  },
};

const normalized = normalizeResoPropertyRow(
  {
    ListingId: "MLS-1",
    StandardStatus: "Active",
    PropertyType: "Residential",
    PropertySubType: "Single Family Residence",
    ListPrice: 650000,
    TransactionType: "For Sale",
    PoolPrivateYN: false,
    PublicRemarks: "No pool but great yard",
  },
  contract,
);
assert(normalized?.propertyType === "house", "sync row -> house");
assert(normalized?.listingDetails?.listingTransactionType === "sale", "sync row -> sale");
assert(normalized?.listingDetails?.pool === false, "sync row pool false");

const saleHouse = renormalizeStoredListingFields({
  propertyType: "residential",
  propertySubtype: "Single Family Residence",
  priceCents: 650_000_00,
  description: "For sale SFH",
  features: [],
  listingDetails: { listingTransactionType: "sale" },
});
assert(saleHouse.propertyType === "house", "backfill residential+SFR -> house");
assert(
  !listingIsRentalOrLease({
    propertyType: saleHouse.propertyType,
    propertySubtype: "Single Family Residence",
    description: "For sale",
    features: [],
    priceCents: 650_000_00,
    listingDetails: { listingTransactionType: "sale" },
  }),
  "stored sale flag skips rental heuristic",
);

const details = extractResoListingDetails({
  ParkingFeatures: "Assigned",
  PoolPrivateYN: true,
  WaterfrontYN: false,
  PropertyType: "Residential",
  PropertySubType: "Townhouse",
  ListPrice: 450000,
  TransactionType: "For Sale",
});
assert(details.listingTransactionType === "sale", "listing details include transaction type");
assert(details.pool === true, "listing details pool");

console.log("inventory-reso-classification.test.ts: OK");
