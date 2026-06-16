import type { InventoryProvider } from "../inventoryProviderSchema";
import {
  extractResoListingCompliance,
} from "../inventoryListingCompliance";
import {
  normalizedInventoryListingSchema,
  type InventoryListingDetails,
  type InventoryListingStatus,
  type NormalizedInventoryListing,
} from "../inventoryListingSchema";
import {
  extractResoStringList,
  extractResoPoolFlag,
  mapResoPropertyType,
  buildResoPropertyClassificationContext,
  resolveResoListingTransactionType,
} from "./resoListingClassification";

export {
  extractResoStringList,
  extractResoPoolFlag,
  mapResoPropertyType,
  buildResoPropertyClassificationContext,
  resolveResoListingTransactionType,
} from "./resoListingClassification";

/** Provider implements status + listing id resolution; shared layer maps RESO fields. */
export interface ResoPropertyNormalizerContract {
  readonly provider: InventoryProvider;
  extractListingId(row: Record<string, unknown>): string | null;
  resolveStatus(row: Record<string, unknown>): InventoryListingStatus;
  extractPhotos?(row: Record<string, unknown>): NormalizedInventoryListing["photos"];
  extractListingUrl?(row: Record<string, unknown>): string | null;
}

export function mapResoStandardStatus(raw: unknown): InventoryListingStatus {
  const s = String(raw ?? "").replace(/\s+/g, "");
  const lower = s.toLowerCase();
  if (lower === "active") return "active";
  if (lower === "comingsoon") return "coming_soon";
  if (lower === "activeundercontract" || lower === "pending") return "pending";
  if (lower === "closed" || lower === "sold") return "sold";
  if (
    lower === "canceled" ||
    lower === "cancelled" ||
    lower === "expired" ||
    lower === "withdrawn" ||
    lower === "rented" ||
    lower === "leased"
  ) {
    return "off_market";
  }
  if (lower === "inactive" || lower === "delete") return "inactive";
  return "inactive";
}

export function resoListPriceToCents(listPrice: unknown): number | null {
  if (listPrice == null || listPrice === "") return null;
  const n = typeof listPrice === "number" ? listPrice : parseFloat(String(listPrice));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Normalize RESO Media resource rows or expanded Property.Media arrays. */
export function normalizeResoMediaItems(media: unknown): NormalizedInventoryListing["photos"] {
  if (!Array.isArray(media)) return [];
  const items = media
    .map((m, idx) => {
      if (!m || typeof m !== "object") return null;
      const row = m as Record<string, unknown>;
      const url = row.MediaURL ?? row.MediaUrl ?? row.Url;
      if (typeof url !== "string" || !url.startsWith("http")) return null;
      const order = typeof row.Order === "number" ? row.Order : idx;
      return { url, order };
    })
    .filter(Boolean) as NormalizedInventoryListing["photos"];
  items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return items;
}

export function buildResoAddress(row: Record<string, unknown>): NormalizedInventoryListing["address"] {
  const parts = [row.StreetNumber, row.StreetName, row.StreetSuffix].filter(Boolean).map(String);
  const line1 = String(row.UnparsedAddress ?? "").trim() || parts.join(" ").trim() || undefined;
  const unit = row.UnitNumber != null ? String(row.UnitNumber).trim() : "";
  const line2 = unit ? (unit.startsWith("#") ? unit : `#${unit}`) : undefined;
  return {
    line1: line1 || undefined,
    line2,
    city: row.City != null ? String(row.City) : undefined,
    state: row.StateOrProvince != null ? String(row.StateOrProvince) : undefined,
    zip: row.PostalCode != null ? String(row.PostalCode) : undefined,
    country: row.Country != null ? String(row.Country) : "US",
  };
}

function resoOptionalNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeResoTimestamp(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function resoOptionalInt(value: unknown): number | null {
  const n = resoOptionalNumber(value);
  if (n == null) return null;
  return Math.round(n);
}

function resoYesNo(value: unknown): boolean | null {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const s = String(value ?? "").trim().toLowerCase();
  if (s === "y" || s === "yes" || s === "true") return true;
  if (s === "n" || s === "no" || s === "false") return false;
  return null;
}

/** RESO amenity / feature fields merged into a deduplicated list. */
export function extractResoFeatures(row: Record<string, unknown>): string[] {
  const fields = [
    "InteriorFeatures",
    "ExteriorFeatures",
    "CommunityFeatures",
    "Appliances",
    "Flooring",
    "Heating",
    "Cooling",
    "LaundryFeatures",
    "PatioAndPorchFeatures",
    "FireplaceFeatures",
    "PoolFeatures",
    "SecurityFeatures",
    "WindowFeatures",
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const field of fields) {
    for (const item of extractResoStringList(row[field])) {
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
      if (out.length >= 40) return out;
    }
  }
  return out;
}

export function extractResoSquareFeet(row: Record<string, unknown>): number | null {
  return (
    resoOptionalInt(row.LivingArea) ??
    resoOptionalInt(row.BuildingAreaTotal) ??
    resoOptionalInt(row.AboveGradeFinishedArea)
  );
}

export function extractResoYearBuilt(row: Record<string, unknown>): number | null {
  return resoOptionalInt(row.YearBuilt);
}

export function extractResoHoaFeeCents(row: Record<string, unknown>): number | null {
  const fee =
    resoOptionalNumber(row.AssociationFee) ??
    resoOptionalNumber(row.AssociationFee2) ??
    resoOptionalNumber(row.AssociationFeeMonthly);
  if (fee == null || fee < 0) return null;
  return Math.round(fee * 100);
}

export function extractResoPropertySubtype(row: Record<string, unknown>): string | null {
  const raw = row.PropertySubType;
  if (raw == null || String(raw).trim() === "") return null;
  return String(raw).trim();
}

export function extractResoListingDetails(row: Record<string, unknown>): InventoryListingDetails {
  const parkingParts: string[] = [];
  const garageSpaces = row.GarageSpaces ?? row.GarageYN;
  if (garageSpaces != null && String(garageSpaces).trim() !== "") {
    parkingParts.push(
      typeof garageSpaces === "number" || /^\d+$/.test(String(garageSpaces))
        ? `Garage (${garageSpaces})`
        : `Garage: ${String(garageSpaces)}`,
    );
  }
  const parkingFeatures = extractResoStringList(row.ParkingFeatures);
  if (parkingFeatures.length > 0) {
    parkingParts.push(parkingFeatures.join(", "));
  }
  const carport = row.CarportSpaces;
  if (carport != null && String(carport).trim() !== "") {
    parkingParts.push(`Carport (${carport})`);
  }
  const parkingTotal = row.ParkingTotal;
  if (parkingTotal != null && String(parkingTotal).trim() !== "") {
    parkingParts.push(`Parking spaces: ${parkingTotal}`);
  }

  const viewParts = extractResoStringList(row.View);
  const view =
    viewParts.length > 0
      ? viewParts.join(", ")
      : row.ViewYN != null
        ? resoYesNo(row.ViewYN) === true
          ? "Yes"
          : null
        : null;

  const publicRemarks = row.PublicRemarks != null ? String(row.PublicRemarks) : undefined;
  const pool = extractResoPoolFlag(row, { publicRemarks });
  const waterfront = resoYesNo(row.WaterfrontYN);
  const listingTransactionType = resolveResoListingTransactionType(row);

  const details: InventoryListingDetails = { listingTransactionType };
  if (parkingParts.length > 0) details.parkingGarage = parkingParts.join(" · ");
  if (waterfront != null) details.waterfront = waterfront;
  if (pool != null) details.pool = pool;
  if (view) details.view = view;
  return details;
}

/** RESO / MLS public URL fields used when provider omits extractListingUrl. */
export function defaultResoListingUrl(row: Record<string, unknown>): string | null {
  const candidates = [
    row.ListingURL,
    row.ListingUrl,
    row.VirtualTourURLUnbranded,
    row.VirtualTourURLBranded,
    row.UnparsedAddressURL,
  ];
  for (const raw of candidates) {
    if (typeof raw === "string" && /^https?:\/\//i.test(raw.trim())) {
      return raw.trim();
    }
  }
  return null;
}

export function defaultResoListingId(row: Record<string, unknown>): string | null {
  const id = row.ListingId ?? row.ListingKey;
  if (id == null || String(id).trim() === "") return null;
  return String(id).trim();
}

export function normalizeResoPropertyRow(
  raw: unknown,
  contract: ResoPropertyNormalizerContract,
  options?: {
    modificationTimestampField?: string;
    descriptionMaxLength?: number;
    /** Fallback MLS / originating system label when row omits OriginatingSystemName. */
    sourceMlsName?: string | null;
  },
): NormalizedInventoryListing | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const providerListingId = contract.extractListingId(row);
  if (!providerListingId) return null;

  const modField = options?.modificationTimestampField ?? "ModificationTimestamp";

  const candidate: NormalizedInventoryListing = {
    provider: contract.provider,
    providerListingId,
    status: contract.resolveStatus(row),
    priceCents: resoListPriceToCents(row.ListPrice),
    currency: "USD",
    address: buildResoAddress(row),
    latitude: resoOptionalNumber(row.Latitude),
    longitude: resoOptionalNumber(row.Longitude),
    beds: resoOptionalNumber(row.BedroomsTotal),
    baths:
      resoOptionalNumber(row.BathroomsTotalInteger) ??
      resoOptionalNumber(row.BathroomsFull),
    propertyType: mapResoPropertyType(
      row.PropertyType,
      row.PropertySubType,
      buildResoPropertyClassificationContext(row),
    ),
    propertySubtype: extractResoPropertySubtype(row),
    squareFeet: extractResoSquareFeet(row),
    yearBuilt: extractResoYearBuilt(row),
    hoaFeeCents: extractResoHoaFeeCents(row),
    listingDetails: extractResoListingDetails(row),
    description:
      row.PublicRemarks != null
        ? String(row.PublicRemarks).slice(0, options?.descriptionMaxLength ?? 8000)
        : undefined,
    features: extractResoFeatures(row),
    photos: contract.extractPhotos?.(row) ?? normalizeResoMediaItems(row.Media),
    listingUrl: contract.extractListingUrl?.(row) ?? null,
    sourceUpdatedAt: normalizeResoTimestamp(row[modField]),
    listingCompliance: extractResoListingCompliance(row, {
      provider: contract.provider,
      providerListingId,
      sourceMlsName: options?.sourceMlsName,
    }),
  };

  const parsed = normalizedInventoryListingSchema.safeParse(candidate);
  if (parsed.success) return parsed.data;
  return null;
}

/** First validation issue for import diagnostics. */
export function describeResoNormalizationFailure(
  raw: unknown,
  contract?: ResoPropertyNormalizerContract,
  options?: { modificationTimestampField?: string },
): string | null {
  if (!raw || typeof raw !== "object") return "row is not an object";
  if (!contract) {
    const row = raw as Record<string, unknown>;
    const id = row.ListingId ?? row.ListingKey;
    if (id == null || String(id).trim() === "") return "missing ListingId/ListingKey";
    return "listing failed normalization";
  }
  const row = raw as Record<string, unknown>;
  const modField = options?.modificationTimestampField ?? "ModificationTimestamp";
  const providerListingId = contract.extractListingId(row);
  if (!providerListingId) return "missing ListingId/ListingKey";

  const candidate = {
    provider: contract.provider,
    providerListingId,
    status: contract.resolveStatus(row),
    priceCents: resoListPriceToCents(row.ListPrice),
    currency: "USD",
    address: buildResoAddress(row),
    latitude: resoOptionalNumber(row.Latitude),
    longitude: resoOptionalNumber(row.Longitude),
    beds: resoOptionalNumber(row.BedroomsTotal),
    baths:
      resoOptionalNumber(row.BathroomsTotalInteger) ?? resoOptionalNumber(row.BathroomsFull),
    propertyType: mapResoPropertyType(
      row.PropertyType,
      row.PropertySubType,
      buildResoPropertyClassificationContext(row),
    ),
    propertySubtype: extractResoPropertySubtype(row),
    squareFeet: extractResoSquareFeet(row),
    yearBuilt: extractResoYearBuilt(row),
    hoaFeeCents: extractResoHoaFeeCents(row),
    listingDetails: extractResoListingDetails(row),
    description:
      row.PublicRemarks != null
        ? String(row.PublicRemarks).slice(0, 8000)
        : undefined,
    features: extractResoFeatures(row),
    photos: contract.extractPhotos?.(row) ?? normalizeResoMediaItems(row.Media),
    listingUrl: contract.extractListingUrl?.(row) ?? null,
    sourceUpdatedAt: normalizeResoTimestamp(row[modField]),
  };

  const parsed = normalizedInventoryListingSchema.safeParse(candidate);
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  return issue ? `${issue.path.join(".")}: ${issue.message}` : "schema validation failed";
}
