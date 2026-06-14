/**
 * Regression: SFH rentals in Pompano up to $4000 must exclude attached townhome (#0).
 * Run: npx tsx tests/sfh-rent-pompano-4000.test.ts
 */
import { heuristicPatchFromInboundText } from "../shared/buyerPreferenceExtractionNormalize";
import { detectPreferenceArrayReplacements } from "../shared/buyerPreferenceInventorySignals";
import { mergeBuyerPreferenceProfile } from "../shared/buyerPreferenceMerge";
import { emptyBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import { resolveMatchingBudgetBounds } from "../shared/buyerPreferenceBudget";
import {
  auditBuySearchMatchFunnel,
  extractBuyerMatchCriteria,
  formatListingPropertyTypePassReason,
  getListingExclusionReason,
  rankInventoryMatches,
  resolveListingPropertyType,
  type MatchListingInput,
} from "../shared/inventory/inventoryMatchScoring";
import {
  buildResoPropertyClassificationContext,
  mapResoPropertyType,
} from "../shared/inventory/reso/resoListingClassification";
import { normalizeResoPropertyRow, mapResoStandardStatus } from "../shared/inventory/reso/resoNormalizer";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const now = new Date().toISOString();
const inf = <T>(value: T, evidence: string) => ({
  value,
  source: "inferred" as const,
  confidence: 0.9,
  updatedAt: now,
  evidence,
});

const msg = "Show me SFH rentals in Pompano up to 4000";

const patch = heuristicPatchFromInboundText(msg);
assert(patch.transactionIntent?.value === "rent", "rent intent");
assert(
  patch.propertyTypes?.value?.length === 1 && patch.propertyTypes.value[0] === "house",
  "SFH -> house only",
);
assert(patch.priceMax?.value === 4000, "priceMax 4000");
assert(patch.priceMin == null, "no priceMin");

const replaceFields = detectPreferenceArrayReplacements(msg);
assert(replaceFields.includes("propertyTypes"), "propertyTypes replace");

const profile = mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), patch, undefined, {
  replaceArrayFields: replaceFields,
});
assert(profile.targetAreas?.value?.some((a) => /pompano/i.test(a)), "Pompano area");

const budget = resolveMatchingBudgetBounds(profile);
assert(budget.priceMax === 4000 && budget.priceMin == null, "cap-only 4000");

const criteria = extractBuyerMatchCriteria(profile);
assert(criteria.transactionIntent === "rent", "criteria rent");
assert(criteria.propertyTypes.join(",") === "house", "criteria house only");
assert(criteria.priceMax === 4000, "criteria priceMax");

const resoRow = {
  ListingId: "MLS-POMP-7TH",
  StandardStatus: "Active",
  PropertyType: "Residential Lease",
  PropertySubType: "Townhouse",
  StructureType: "Attached",
  ArchitecturalStyle: "Townhouse",
  UnitNumber: "0",
  StreetNumber: "111",
  StreetName: "SE 7th Ave",
  UnparsedAddress: "111 SE 7th Ave #0",
  ListPrice: 3900,
  TransactionType: "For Lease",
  BedroomsTotal: 4,
  BathroomsTotalInteger: 4,
  PublicRemarks: "Spacious townhome rental near the beach",
};

const ctx = buildResoPropertyClassificationContext(resoRow);
assert(
  mapResoPropertyType(resoRow.PropertyType, resoRow.PropertySubType, ctx) === "townhouse",
  "RESO attached townhome lease -> townhouse",
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

const normalized = normalizeResoPropertyRow(resoRow, contract);
assert(normalized != null, "normalizes RESO row");
assert(normalized.propertyType === "townhouse", `sync type townhouse, got ${normalized.propertyType}`);
assert(normalized.listingDetails?.listingTransactionType === "rent", "sync txn rent");
assert(normalized.address?.line2 === "#0", "unit in address line2");
assert(
  normalized.address?.line1?.includes("111 SE 7th Ave") === true,
  "street in address line1",
);

const attachedTownhome: MatchListingInput = {
  id: "pompano-attached",
  providerListingId: "MLS-POMP-7TH",
  status: "active",
  priceCents: 3_900_00,
  city: "Pompano Beach",
  state: "FL",
  addressLine1: "111 SE 7th Ave",
  addressLine2: "#0",
  zip: "33062",
  beds: 4,
  baths: 4,
  propertyType: normalized.propertyType ?? "townhouse",
  propertySubtype: "Townhouse",
  listingDetails: { listingTransactionType: "rent" },
  description: "Spacious townhome rental",
  features: [],
  listingUrl: null,
  photos: [],
};

const detachedSfh: MatchListingInput = {
  id: "pompano-sfh",
  providerListingId: "MLS-SFH-OK",
  status: "active",
  priceCents: 3_800_00,
  city: "Pompano Beach",
  state: "FL",
  addressLine1: "200 NE 1st St",
  addressLine2: null,
  zip: "33060",
  beds: 3,
  baths: 2,
  propertyType: "house",
  propertySubtype: "Single Family Residence",
  listingDetails: { listingTransactionType: "rent" },
  description: "Detached SFH rental",
  features: [],
  listingUrl: null,
  photos: [],
};

const overBudgetSfh: MatchListingInput = {
  ...detachedSfh,
  id: "pompano-sfh-over",
  providerListingId: "MLS-SFH-HIGH",
  priceCents: 4_100_00,
};

assert(
  resolveListingPropertyType(attachedTownhome) === "townhouse",
  "attached #0 resolves townhouse",
);
assert(
  getListingExclusionReason(attachedTownhome, criteria) === "wrong property type",
  "attached townhome excluded from house-only search",
);

const ranked = rankInventoryMatches([attachedTownhome, detachedSfh, overBudgetSfh], criteria, 10);
assert(ranked.length === 1, "only in-budget detached SFH");
assert(ranked[0].listing.id === "pompano-sfh", "correct SFH matched");

const funnel = auditBuySearchMatchFunnel(
  [attachedTownhome, detachedSfh, overBudgetSfh],
  criteria,
  { rankLimit: 10, sampleLimit: 20 },
);
const attachedSample = funnel.excludedSamples.find((s) => s.providerListingId === "MLS-POMP-7TH");
assert(attachedSample != null, "funnel includes attached sample");
assert(attachedSample.matched === false, "attached not matched");
assert(attachedSample.resolvedType === "townhouse", "funnel resolved townhouse");
assert(attachedSample.listingTransactionType === "rent", "funnel txn rent");

const matchedSample = funnel.excludedSamples.find((s) => s.providerListingId === "MLS-SFH-OK");
assert(matchedSample != null, "funnel includes matched SFH sample");
assert(matchedSample.matched === true, "SFH matched");
assert(
  formatListingPropertyTypePassReason(detachedSfh).includes("resolved=house"),
  "pass reason shows resolved house",
);

console.log("sfh-rent-pompano-4000.test.ts: OK");
