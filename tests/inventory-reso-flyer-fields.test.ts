/**
 * RESO extended field extraction for public listing flyer.
 * Run: npx tsx tests/inventory-reso-flyer-fields.test.ts
 */
import {
  normalizeResoPropertyRow,
  mapResoStandardStatus,
  extractResoFeatures,
  extractResoSquareFeet,
  extractResoHoaFeeCents,
  extractResoListingDetails,
} from "../shared/inventory/reso/resoNormalizer";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const contract = {
  provider: "bridge_interactive" as const,
  extractListingId(row: Record<string, unknown>) {
    return String(row.ListingId ?? "");
  },
  resolveStatus(row: Record<string, unknown>) {
    return mapResoStandardStatus(row.StandardStatus);
  },
};

const row = {
  ListingId: "MLS-9001",
  StandardStatus: "Active",
  ListPrice: 875000,
  LivingArea: 2450,
  YearBuilt: 2004,
  AssociationFee: 325,
  PropertyType: "Residential",
  PropertySubType: "Single Family Residence",
  BedroomsTotal: 4,
  BathroomsTotalInteger: 3,
  GarageSpaces: 2,
  WaterfrontYN: true,
  PoolPrivateYN: false,
  View: ["Ocean", "City"],
  InteriorFeatures: "Hardwood Floors, Walk-In Closet",
  Appliances: "Dishwasher, Refrigerator",
  PublicRemarks: "Stunning waterfront home with open floor plan.",
  Latitude: 25.7617,
  Longitude: -80.1918,
  UnparsedAddress: "100 Ocean Dr",
  City: "Miami Beach",
  StateOrProvince: "FL",
  PostalCode: "33139",
};

const normalized = normalizeResoPropertyRow(row, contract);
assert(normalized != null, "row normalizes with extended fields");
assert(normalized!.squareFeet === 2450, "LivingArea -> squareFeet");
assert(normalized!.yearBuilt === 2004, "YearBuilt mapped");
assert(normalized!.hoaFeeCents === 32500, "AssociationFee -> hoaFeeCents");
assert(normalized!.propertySubtype === "Single Family Residence", "PropertySubType preserved");
assert(normalized!.listingDetails?.waterfront === true, "WaterfrontYN");
assert(normalized!.listingDetails?.pool === false, "PoolPrivateYN");
assert(normalized!.listingDetails?.view === "Ocean, City", "View joined");
assert(
  normalized!.listingDetails?.parkingGarage?.includes("Garage (2)") === true,
  "GarageSpaces in parking",
);
assert(normalized!.features.length >= 4, "features extracted from RESO amenity fields");

assert(extractResoSquareFeet({ BuildingAreaTotal: 1800 }) === 1800, "BuildingAreaTotal fallback");
assert(extractResoHoaFeeCents({ AssociationFeeMonthly: 150 }) === 15000, "monthly HOA");
const detailsOnly = extractResoListingDetails({ ParkingFeatures: "Assigned, Covered", CarportSpaces: 1 });
assert(detailsOnly.parkingGarage?.includes("Assigned") === true, "parking features string");
assert(extractResoFeatures({ CommunityFeatures: "Pool, Gym" }).includes("Pool") === true, "community features");

console.log("inventory-reso-flyer-fields.test.ts: OK");
